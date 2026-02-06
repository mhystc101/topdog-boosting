// netlify/functions/stripe-webhook.js
const Stripe = require("stripe");

// fetch helper (Node 18+ has global fetch; fallback for safety)
async function getFetch() {
  if (typeof fetch === "function") return fetch;
  const mod = await import("node-fetch"); // only used if needed
  return mod.default;
}

function money(n) {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

function boosterPay(amountDollars) {
  // boosters get 70% (you keep 30% internally)
  return money(Number(amountDollars) * 0.7);
}

// ---------- Discord limits helpers ----------
function truncate(str, max) {
  const s = String(str ?? "");
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

// Discord field values max 1024 chars
function fieldValue(str) {
  const cleaned = String(str ?? "").trim();
  return truncate(cleaned || "None", 1024);
}

// ---------- Discord posting ----------
async function postToDiscord(url, payload) {
  if (!url) return;

  const _fetch = await getFetch();
  const res = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Discord webhook failed:", res.status, text);
  }
}

// --- Your existing OWNER webhook (admin/orders channel)
async function postToOwner(payload) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.error("Missing DISCORD_WEBHOOK_URL");
    return;
  }
  await postToDiscord(url, payload);
}

// --- Booster webhook (optional, if you ever switch away from bot posting)
async function postToBoosters(payload) {
  const url = process.env.DISCORD_BOOSTER_WEBHOOK_URL;
  if (!url) {
    console.error("Missing DISCORD_BOOSTER_WEBHOOK_URL");
    return;
  }
  await postToDiscord(url, payload);
}

// --- Bot-post directly to a channel (what you're using now)
async function postToBoosterChannel(payload) {
  const channelId = process.env.BOOSTER_CHANNEL_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!channelId) {
    console.error("Missing BOOSTER_CHANNEL_ID");
    return;
  }
  if (!token) {
    console.error("Missing DISCORD_BOT_TOKEN");
    return;
  }

  const _fetch = await getFetch();
  const res = await _fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Booster channel post failed:", res.status, text);
  }
}

// --------- Stateless idempotency via Discord history ---------
// If a booster job message already exists in the booster channel
// with footer containing `Session: <sessionId>`, we skip posting.
async function boosterJobAlreadyPosted(sessionId) {
  const channelId = process.env.BOOSTER_CHANNEL_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!channelId || !token) return false;

  const _fetch = await getFetch();
  const res = await _fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`,
    {
      method: "GET",
      headers: { Authorization: `Bot ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Failed to read booster channel messages:", res.status, text);
    return false; // fail open (don't block jobs if Discord read fails)
  }

  const msgs = await res.json().catch(() => []);
  const needle = `Session: ${sessionId}`;

  for (const m of msgs) {
    const embeds = Array.isArray(m.embeds) ? m.embeds : [];
    for (const e of embeds) {
      const footerText = e?.footer?.text || "";
      if (typeof footerText === "string" && footerText.includes(needle)) {
        return true;
      }
    }
  }
  return false;
}

// ---- Anti-fraud memory (temporary, resets on cold start) ----
const processedOrders = new Set();
const recentOrdersByEmail = new Map();

exports.handler = async (event) => {
  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecret || !webhookSecret) {
      return { statusCode: 500, body: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET" };
    }

    const stripe = new Stripe(stripeSecret);

    const sig =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"] ||
      event.headers["STRIPE-SIGNATURE"];

    if (!sig) return { statusCode: 400, body: "Missing stripe-signature header" };

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (e) {
      console.error("Webhook signature verification failed:", e.message);
      return { statusCode: 400, body: `Webhook signature verification failed: ${e.message}` };
    }

    // Only handle confirmed paid checkouts
    if (stripeEvent.type === "checkout.session.completed") {
      const eventSession = stripeEvent.data.object;

      // Expand payment_intent so we can pull metadata from there too if needed
      const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
        expand: ["payment_intent"],
      });

      const email = session.customer_details?.email || "UNKNOWN";

      // ---- Velocity check ----
      const now = Date.now();
      const lastOrderTime = recentOrdersByEmail.get(email);
      const isRapidRepeat = !!(lastOrderTime && now - lastOrderTime < 2 * 60 * 1000);
      recentOrdersByEmail.set(email, now);

      // ---- Burner email detection ----
      const blockedDomains = ["tempmail", "10minutemail", "mailinator", "guerrillamail", "yopmail"];
      const isBurnerEmail =
        email !== "UNKNOWN" && blockedDomains.some((d) => email.toLowerCase().includes(d));

      const fraudFlags = [];
      if (isBurnerEmail) fraudFlags.push("Burner Email");
      if (isRapidRepeat) fraudFlags.push("Rapid Repeat Order");

      // ✅ Merge metadata from session + payment intent (session wins)
      const mdSession = session.metadata || {};
      const mdPI = session.payment_intent?.metadata || {};
      const md = { ...mdPI, ...mdSession };

      const paid = (session.amount_total ?? 0) / 100;

      // orderId fallback (never UNKNOWN)
      const sessionShort = String(session.id || "").slice(-8).toUpperCase();
      const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      let orderId = md.order_id || session.client_reference_id || "";
      orderId = String(orderId || "").trim();
      if (!orderId || orderId.toUpperCase() === "UNKNOWN") {
        orderId = `TD-${yyyymmdd}-${sessionShort || "XXXX"}`;
      }

      // ---- Duplicate order protection (memory fast-path) ----
      if (processedOrders.has(orderId)) {
        console.warn("Duplicate order blocked (memory):", orderId);
        return { statusCode: 200, body: "duplicate ignored" };
      }
      processedOrders.add(orderId);

      const addons = [];
      if (md.addon_priority === "true") addons.push("Priority");
      if (md.addon_specific_hero === "true") {
        const hero = (md.hero_name || "").trim();
        addons.push(hero ? `Specific Hero (${hero})` : "Specific Hero");
      }
      if (md.addon_low_rr === "true") addons.push("Low RR Gain");

      // ===================== 1) OWNER / ADMIN MESSAGE (same info, safer) =====================
      await postToOwner({
        embeds: [
          {
            title: truncate("✅ New Paid Order", 256),
            description: truncate(`**Order ID:** ${orderId}`, 4096),
            color: fraudFlags.length ? 0xf1c40f : 0x2ecc71,
            fields: [
              { name: "Game", value: fieldValue(md.game || "UNKNOWN"), inline: true },
              { name: "Paid", value: fieldValue(`$${paid.toFixed(2)}`), inline: true },
              { name: "Email", value: fieldValue(email), inline: false },

              { name: "Discord", value: fieldValue(md.discord || "UNKNOWN"), inline: true },
              { name: "Platform", value: fieldValue(md.platform || "UNKNOWN"), inline: true },
              { name: "Region", value: fieldValue(md.region || "UNKNOWN"), inline: true },

              { name: "In-game", value: fieldValue(md.ign || "UNKNOWN"), inline: false },
              { name: "Rank From", value: fieldValue(md.rank_from || "N/A"), inline: true },
              { name: "Rank To", value: fieldValue(md.rank_to || "N/A"), inline: true },

              { name: "Package", value: fieldValue(md.package || "UNKNOWN"), inline: false },
              { name: "Add-ons", value: fieldValue(addons.length ? addons.join(", ") : "None"), inline: false },
              { name: "Notes", value: fieldValue(md.notes || "None"), inline: false },

              { name: "Stripe Session", value: fieldValue(session.id), inline: false },
              {
                name: "Stripe Dashboard",
                value: fieldValue(
                  session.payment_intent
                    ? `https://dashboard.stripe.com/payments/${session.payment_intent.id || session.payment_intent}`
                    : "N/A"
                ),
                inline: false,
              },
              {
                name: "Fraud Flags",
                value: fieldValue(fraudFlags.length ? fraudFlags.join(", ") : "None"),
                inline: false,
              },
            ],
          },
        ],
      });

      // ===================== 2) BOOSTER MESSAGE (CLEAN + DEDUPED) =====================
      // Stateless dedupe: check Discord history for Session: <sessionId>
      const alreadyPosted = await boosterJobAlreadyPosted(session.id);
      if (alreadyPosted) {
        console.warn("Duplicate booster job skipped (discord dedupe):", session.id, orderId);
        return { statusCode: 200, body: "duplicate booster ignored" };
      }

      await postToBoosterChannel({
        content: `🧾 **New Job** • **${truncate(String(md.game || "UNKNOWN").toUpperCase(), 100)}**`,
        embeds: [
          {
            title: truncate(`Claimable Job • ${orderId}`, 256),
            description: truncate(`**Booster Pay:** $${boosterPay(paid)}`, 4096),
            color: 0x5865f2,
            fields: [
              { name: "Order ID", value: fieldValue(orderId), inline: false },

              { name: "Discord", value: fieldValue(md.discord || "UNKNOWN"), inline: true },
              { name: "Platform", value: fieldValue(md.platform || "UNKNOWN"), inline: true },
              { name: "Region", value: fieldValue(md.region || "UNKNOWN"), inline: true },

              { name: "In-game", value: fieldValue(md.ign || "UNKNOWN"), inline: false },

              ...(md.rank_from || md.rank_to
                ? [
                    { name: "Rank From", value: fieldValue(md.rank_from || "N/A"), inline: true },
                    { name: "Rank To", value: fieldValue(md.rank_to || "N/A"), inline: true },
                  ]
                : []),

              { name: "Package", value: fieldValue(md.package || "UNKNOWN"), inline: false },
              { name: "Add-ons", value: fieldValue(addons.length ? addons.join(", ") : "None"), inline: false },
              { name: "Notes", value: fieldValue(md.notes || "None"), inline: false },
            ],
            footer: {
              // This is the key: dedupe marker lives in Discord.
              text: truncate(`First come first serve — click Claim to lock. | Session: ${session.id}`, 2048),
            },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Claim", custom_id: `claim:${orderId}` },
              { type: 2, style: 2, label: "Log", custom_id: `log:${orderId}` },
            ],
          },
        ],
      });
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: err.message || "Webhook error" };
  }
};
