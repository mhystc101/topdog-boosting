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

// --- NEW: Booster webhook (single channel for all games)
async function postToBoosters(payload) {
  const url = process.env.DISCORD_BOOSTER_WEBHOOK_URL;
  if (!url) {
    console.error("Missing DISCORD_BOOSTER_WEBHOOK_URL");
    return;
  }
  await postToDiscord(url, payload);
}

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
        email !== "UNKNOWN" &&
        blockedDomains.some((d) => email.toLowerCase().includes(d));

      const fraudFlags = [];
      if (isBurnerEmail) fraudFlags.push("Burner Email");
      if (isRapidRepeat) fraudFlags.push("Rapid Repeat Order");

      // ✅ Merge metadata from session + payment intent (session wins)
      const mdSession = session.metadata || {};
      const mdPI = session.payment_intent?.metadata || {};
      const md = { ...mdPI, ...mdSession };

      console.log("Stripe session id:", session.id);
      console.log("Merged metadata:", md);

      const orderId = md.order_id || session.client_reference_id || "UNKNOWN";

      // ---- Duplicate order protection ----
      if (processedOrders.has(orderId)) {
        console.warn("Duplicate order blocked:", orderId);
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

      const paid = (session.amount_total ?? 0) / 100;

      // ===================== 1) OWNER / ADMIN MESSAGE (unchanged) =====================
      await postToOwner({
        embeds: [
          {
            title: "✅ New Paid Order",
            description: `**Order ID:** ${orderId}`,
            color: fraudFlags.length ? 0xf1c40f : 0x2ecc71,
            fields: [
              { name: "Game", value: md.game || "UNKNOWN", inline: true },
              { name: "Paid", value: `$${paid.toFixed(2)}`, inline: true },
              { name: "Email", value: email, inline: false },

              { name: "Discord", value: md.discord || "UNKNOWN", inline: true },
              { name: "Platform", value: md.platform || "UNKNOWN", inline: true },
              { name: "Region", value: md.region || "UNKNOWN", inline: true },

              { name: "In-game", value: md.ign || "UNKNOWN", inline: false },
              { name: "Rank From", value: md.rank_from || "N/A", inline: true },
              { name: "Rank To", value: md.rank_to || "N/A", inline: true },

              { name: "Package", value: md.package || "UNKNOWN", inline: false },
              { name: "Add-ons", value: addons.length ? addons.join(", ") : "None", inline: false },
              { name: "Notes", value: (md.notes || "").trim() || "None", inline: false },

              { name: "Stripe Session", value: session.id, inline: false },
              {
                name: "Stripe Dashboard",
                value: session.payment_intent
                  ? `https://dashboard.stripe.com/payments/${session.payment_intent.id || session.payment_intent}`
                  : "N/A",
                inline: false,
              },
              { name: "Fraud Flags", value: fraudFlags.length ? fraudFlags.join(", ") : "None", inline: false },
            ],
          },
        ],
      });

      // ===================== 2) BOOSTER MESSAGE (NEW, CLEAN) =====================
      // No email, no stripe ids/links, no fraud flags.
      // Shows booster pay (70%) but doesn't mention your cut.
      await postToBoosterChannel({
        content: `🧾 **New Job** • **${String(md.game || "UNKNOWN").toUpperCase()}**`,
        embeds: [
          {
            title: `Claimable Job • ${orderId}`,
            description: `**Booster Pay:** $${boosterPay(paid)}`,
            color: 0x5865f2,
            fields: [
              { name: "Order ID", value: orderId, inline: false },

              { name: "Discord", value: md.discord || "UNKNOWN", inline: true },
              { name: "Platform", value: md.platform || "UNKNOWN", inline: true },
              { name: "Region", value: md.region || "UNKNOWN", inline: true },

              { name: "In-game", value: md.ign || "UNKNOWN", inline: false },

              ...(md.rank_from || md.rank_to
                ? [
                    { name: "Rank From", value: md.rank_from || "N/A", inline: true },
                    { name: "Rank To", value: md.rank_to || "N/A", inline: true },
                  ]
                : []),

              { name: "Package", value: md.package || "UNKNOWN", inline: false },
              { name: "Add-ons", value: addons.length ? addons.join(", ") : "None", inline: false },
              { name: "Notes", value: (md.notes || "").trim() || "None", inline: false },
            ],
            footer: { text: "First come first serve — click Claim to lock." },
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
