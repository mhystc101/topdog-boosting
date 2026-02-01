// netlify/functions/stripe-webhook.js
const Stripe = require("stripe");

async function postToDiscord(payload) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  // Node 18+ has fetch built-in (Netlify should be on Node 18)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Discord webhook failed:", res.status, text);
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

    // We only care about confirmed paid checkouts
    if (stripeEvent.type === "checkout.session.completed") {
      const eventSession = stripeEvent.data.object;

      // ✅ Pull the full session from Stripe (most reliable for metadata)
      const session = await stripe.checkout.sessions.retrieve(eventSession.id);

      const md = session.metadata || {};
      const email = session.customer_details?.email || "UNKNOWN";

      // ---- Velocity check (same email spamming orders) ----
      const now = Date.now();
      const lastOrderTime = recentOrdersByEmail.get(email);

      let isRapidRepeat = false;
      if (lastOrderTime && now - lastOrderTime < 2 * 60 * 1000) {
        isRapidRepeat = true;
        console.warn("⚠️ Rapid repeat order:", email);
      }

      recentOrdersByEmail.set(email, now);

      // ---- Burner email detection ----
      const blockedDomains = [
        "tempmail",
        "10minutemail",
        "mailinator",
        "guerrillamail",
        "yopmail"
      ];

      const isBurnerEmail =
        email !== "UNKNOWN" &&
        blockedDomains.some(d => email.toLowerCase().includes(d));

      // ---- Fraud flags (NOW safe) ----
      const fraudFlags = [];
      if (isBurnerEmail) fraudFlags.push("Burner Email");
      if (isRapidRepeat) fraudFlags.push("Rapid Repeat Order");

      const orderId = md.order_id || session.client_reference_id || "UNKNOWN";
      const discord = md.discord || "UNKNOWN";
      const platform = md.platform || "UNKNOWN";
      const ign = md.ign || "UNKNOWN";
      const region = md.region || "UNKNOWN";
      const pkg = md.package || "UNKNOWN";
      const notes = (md.notes || "").trim();
      
      recentOrdersByEmail.set(email, now);


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

      await postToDiscord({
        embeds: [
          {
            title: "✅ New Paid Order",
            description: `**Order ID:** ${orderId}`,
            color: fraudFlags.length ? 0xF1C40F : 0x2ECC71,
            fields: [
              { name: "Discord", value: discord, inline: true },
              { name: "Platform", value: platform, inline: true },
              { name: "Region", value: region, inline: true },
              { name: "In-game", value: ign, inline: false },
              { name: "Package", value: pkg, inline: false },
              { name: "Add-ons", value: addons.length ? addons.join(", ") : "None", inline: false },
              { name: "Notes", value: notes ? notes : "None", inline: false },
              { name: "Paid", value: `$${paid.toFixed(2)}`, inline: true },
              { name: "Stripe Session", value: session.id, inline: false },
              
              {
                name: "Stripe Dashboard",
                value: `https://dashboard.stripe.com/payments/${session.payment_intent}`,
                inline: false
              },
              {
                name: "Fraud Flags",
                value: fraudFlags.length ? fraudFlags.join(", ") : "None",
                inline: false
              },

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
