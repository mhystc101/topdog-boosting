// netlify/functions/create-checkout.js
const Stripe = require("stripe");

// ===================== RIVALS CONFIG =====================
const DIVISION_TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Grandmaster", "Celestial"];
const SINGLE_RANKS = ["Eternity", "OOA"];

function buildRanks() {
  const out = [];
  for (const tier of DIVISION_TIERS) out.push(`${tier} 3`, `${tier} 2`, `${tier} 1`);
  for (const r of SINGLE_RANKS) out.push(r);
  return out;
}
const RIVALS_RANKS = buildRanks();
const rivalsIdx = (r) => RIVALS_RANKS.indexOf(r);

// Rivals Pricing curve
const BASE_PRICE = 12.49;
const STEP_ADD_SLOW = 3.75;
const STEP_ADD_FAST = 12.75;
const FAST_STEP_START_MULT = 1.65;
const FAST_GROWTH = 1.24;

const OOA_MIN = 1000;
const OOA_MAX = 2000;

const MID_DIA_INDEX = rivalsIdx("Diamond 2");
const ETERNITY_INDEX = rivalsIdx("Eternity");

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function sumExponentialSteps(base, nSteps, startMult, growth) {
  if (nSteps <= 0) return 0;
  if (growth === 1) return base * startMult * nSteps;
  return (base * startMult * (Math.pow(growth, nSteps) - 1)) / (growth - 1);
}
function calcOOAPrice(fromRank) {
  const fromIndex = rivalsIdx(fromRank);
  if (fromIndex < 0 || ETERNITY_INDEX < 0) return OOA_MIN;
  const steps = Math.max(0, ETERNITY_INDEX - fromIndex);
  return clamp(OOA_MIN + steps * 25, OOA_MIN, OOA_MAX);
}
function calcBasePrice(fromRank, toRank) {
  const i = rivalsIdx(fromRank);
  const j = rivalsIdx(toRank);
  if (i < 0 || j < 0) return 0;
  const steps = j - i;
  if (steps <= 0) return 0;

  if (toRank === "OOA") return calcOOAPrice(fromRank);

  if (j <= MID_DIA_INDEX) return BASE_PRICE + steps * STEP_ADD_SLOW;

  const slowSteps = Math.max(0, MID_DIA_INDEX - i);
  const slowCost = BASE_PRICE + slowSteps * STEP_ADD_SLOW;

  const postSteps = j - Math.max(i, MID_DIA_INDEX);
  const rampCost = sumExponentialSteps(STEP_ADD_FAST, postSteps, FAST_STEP_START_MULT, FAST_GROWTH);

  return slowCost + rampCost;
}

function addonMultiplier(addons = {}) {
  let m = 1;
  if (addons.priority) m += 0.2;
  if (addons.specificHero) m += 0.2;
  if (addons.lowRR) m += 0.5;
  return m;
}

// ===================== ROCKET LEAGUE CONFIG =====================
const RL_DIVISION_TIERS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champion",
  "Grand Champion",
];
const RL_SINGLE_RANKS = ["SSL"];

function buildRLRanks() {
  const out = [];
  for (const tier of RL_DIVISION_TIERS) out.push(`${tier} 3`, `${tier} 2`, `${tier} 1`);
  for (const r of RL_SINGLE_RANKS) out.push(r);
  return out;
}
const RL_RANKS = buildRLRanks();
const rlIdx = (r) => RL_RANKS.indexOf(r);

const RL_STEP_PRICE_BY_TIER = {
  bronze: 3.0,
  silver: 3.5,
  gold: 4.25,
  platinum: 6.0,
  diamond: 9.0,
  champion: 16.0,
  grandchampion: 30.0,
};
const RL_SSL_JUMP = 199.0;

function rlTierKey(rank) {
  if (!rank) return "";
  const lower = String(rank).toLowerCase();
  if (lower.startsWith("grand champion")) return "grandchampion";
  if (lower.startsWith("champion")) return "champion";
  return String(rank).split(" ")[0].toLowerCase();
}

function calcRLBasePrice(fromRank, toRank) {
  const i = rlIdx(fromRank);
  const j = rlIdx(toRank);
  if (i < 0 || j < 0) return 0;
  if (j <= i) return 0;

  let total = 0;
  for (let k = i + 1; k <= j; k++) {
    const destRank = RL_RANKS[k];
    if (destRank === "SSL") {
      total += RL_SSL_JUMP;
    } else {
      const key = rlTierKey(destRank);
      const step = RL_STEP_PRICE_BY_TIER[key] ?? 0;
      total += step;
    }
  }
  return total;
}

function addonMultiplierRL(addons = {}) {
  let m = 1;
  if (addons.priority) m += 0.2;
  if (addons.lowRR) m += 0.5;
  return m;
}

// ===================== ARC RAIDERS CONFIG =====================
const ARC_RAIDERS_PACKS = {
  starter: { price: 42, label: "Starter Pack" },
  advanced: { price: 115, label: "Advanced Pack" },
  epic: { price: 235, label: "Epic Pack" },
  legendary: { price: 450, label: "Legendary Pack" },
};

const ARC_RAIDERS_PLATFORMS = ["PC", "PlayStation", "Xbox"];
const ARC_RAIDERS_REGIONS = ["NA", "EU", "OCE", "ASIA"];

// ===================== PROMO HELPERS (Stripe Promotion Codes) =====================
// Assumes you created promo codes in Stripe Dashboard.
// This validates by CODE (case-insensitive), ensures active, and returns coupon info.
async function resolvePromo(stripe, rawCode) {
  const code = String(rawCode || "").trim();
  if (!code) return null;

  // Stripe promo code matching is exact; we normalize to upper to be consistent.
  // You should create codes in Stripe that match what you expect users to type.
  const normalized = code.toUpperCase();

  // Fetch active promo codes and find match. Stripe doesn't support direct "code equals" search.
  // We pull a page and match. If you have tons of promo codes, we can paginate later.
  const promos = await stripe.promotionCodes.list({
    active: true,
    limit: 100,
  });

  const hit = promos.data.find((p) => String(p.code || "").toUpperCase() === normalized);
  if (!hit) return null;

  // hit.coupon contains percent_off or amount_off/currency (depending on coupon type)
  return {
    code: hit.code,
    promotion_code_id: hit.id,
    coupon_id: hit.coupon?.id || "",
    percent_off: hit.coupon?.percent_off ?? null,
    amount_off: hit.coupon?.amount_off ?? null,
    currency: hit.coupon?.currency ?? null,
  };
}

// Compute an estimated discount in cents for quote display + metadata.
// Note: Stripe will be the real authority at checkout time.
// We only compute this for showing totals in quote responses / metadata.
function estimateDiscountCents(amountCents, promo) {
  if (!promo) return 0;
  if (promo.percent_off != null) {
    const pct = Number(promo.percent_off);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return Math.round((amountCents * pct) / 100);
  }
  if (promo.amount_off != null) {
    const off = Number(promo.amount_off);
    if (!Number.isFinite(off) || off <= 0) return 0;

    // amount_off is in the smallest currency unit of the coupon currency.
    // We only support USD prices right now, so only accept usd coupons for fixed discounts.
    if (promo.currency && String(promo.currency).toLowerCase() !== "usd") return 0;
    return Math.min(amountCents, Math.round(off));
  }
  return 0;
}

// ===================== SANITATION / LIMITS =====================
const MAX_NOTES_LEN = 500;
const MAX_IGN_LEN = 40;
const MAX_DISCORD_LEN = 60;

function safeStr(v, maxLen) {
  const s = String(v ?? "").trim();
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

exports.handler = async (event) => {
  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return { statusCode: 500, body: "Missing STRIPE_SECRET_KEY" };

    const stripe = new Stripe(stripeSecret);
    const body = JSON.parse(event.body || "{}");

    const {
      game,
      discord,
      platform,
      ign,
      region,
      notes = "",
      package: pkg,
      pack,
      rankFrom,
      rankTo,
      divisionPoints = null,
      addons = {},
      heroName = "",
      quote = false,
      promoCode = "", 
    } = body;

    const isQuote = quote === true;

    // unify package value
    const finalPkg = (pkg || pack || "").trim();

    // Sanitize commonly abused fields
    const cleanDiscord = safeStr(discord, MAX_DISCORD_LEN);
    const cleanIgn = safeStr(ign, MAX_IGN_LEN);
    const cleanNotes = safeStr(notes, MAX_NOTES_LEN);
    const cleanHeroName = safeStr(heroName, 40);
    const cleanPromoCode = safeStr(promoCode, 32);

    // Only require customer fields for REAL checkout (and per-game)
    if (!isQuote) {
      if (game === "rivals" || game === "rocketleague") {
        if (!cleanDiscord || !platform || !cleanIgn || !region) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields." }) };
        }
      } else if (game === "arcraiders") {
        if (!cleanDiscord || !cleanIgn) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields." }) };
        }
      }
    }

    let amountCents = 0;
    let productName = "";
    let productDesc = "";
    let successPath = "";

    // ===================== GAME SWITCH =====================
    switch (game) {
      case "rivals": {
        const i = rivalsIdx(rankFrom);
        const j = rivalsIdx(rankTo);
        if (i < 0 || j < 0 || j <= i) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid rank selection." }) };
        }

        const expectedPkg = `rivals:${rankFrom}->${rankTo}`;
        if (finalPkg !== expectedPkg) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid package." }) };
        }

        if (addons.specificHero && !String(cleanHeroName || "").trim()) {
          return { statusCode: 400, body: JSON.stringify({ error: "Hero name required." }) };
        }

        const base = calcBasePrice(rankFrom, rankTo);
        const total = base * addonMultiplier(addons);
        amountCents = Math.round(total * 100);

        productName = "TopDog Rivals Boost";
        productDesc = `${rankFrom} → ${rankTo}`;
        successPath = "/rivals/";
        break;
      }

      case "rocketleague": {
        if (!rankFrom || !rankTo) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing rank selection." }) };
        }

        const i = rlIdx(rankFrom);
        const j = rlIdx(rankTo);
        if (i < 0 || j < 0 || j <= i) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid Rocket League rank direction." }) };
        }

        const expectedPkg = `rocketleague:${rankFrom}->${rankTo}`;
        if (finalPkg !== expectedPkg) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid Rocket League package." }) };
        }

        const base = calcRLBasePrice(rankFrom, rankTo);
        if (base <= 0) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid Rocket League price." }) };
        }

        const total = base * addonMultiplierRL(addons);
        amountCents = Math.round(total * 100);

        productName = "TopDog Rocket League Boost";
        productDesc = `${rankFrom} → ${rankTo}`;
        successPath = "/rocketleague/";
        break;
      }

      case "arcraiders": {
        if (!finalPkg || !finalPkg.startsWith("arcraiders:")) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid Arc Raiders package." }) };
        }

        const packKey = finalPkg.split(":")[1];
        const packObj = ARC_RAIDERS_PACKS[packKey];

        if (!packObj) {
          return { statusCode: 400, body: JSON.stringify({ error: "Unknown Arc Raiders pack." }) };
        }

        amountCents = Math.round(packObj.price * 100);
        productName = "TopDog Arc Raiders Boost";
        productDesc = packObj.label;
        successPath = "/arcraiders/";

        // Required fields (checkout only)
        if (!isQuote) {
          if (!platform || !region || !cleanDiscord || !cleanIgn) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields." }) };
          }
          if (!ARC_RAIDERS_PLATFORMS.includes(platform)) {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid platform." }) };
          }
          if (!ARC_RAIDERS_REGIONS.includes(region)) {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid region." }) };
          }
        }

        break;
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid game." }) };
    }

    // Guardrail: never allow 0/negative amounts
    if (amountCents <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid price." }) };
    }

    // ===================== PROMO RESOLUTION =====================
    // Resolve promo once per request (works for quote + checkout).
    let promo = null;
    if (cleanPromoCode) {
      promo = await resolvePromo(stripe, cleanPromoCode);
      // If user typed something invalid, we don't hard-fail — we just ignore (better UX).
      // If you want to hard-fail, change this behavior.
    }

    const discountCentsEst = estimateDiscountCents(amountCents, promo);
    const finalCentsEst = Math.max(0, amountCents - discountCentsEst);

    // ===================== QUOTE MODE =====================
    if (isQuote) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          amountCents: finalCentsEst,
          amount: (finalCentsEst / 100).toFixed(2),
          baseAmountCents: amountCents,
          baseAmount: (amountCents / 100).toFixed(2),
          discountCents: discountCentsEst,
          discount: (discountCentsEst / 100).toFixed(2),
          promoApplied: !!promo,
          promoCode: promo?.code || "",
          productName,
          productDesc,
        }),
      };
    }

    // ===================== STRIPE SESSION =====================
    const orderId = `TD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Origin handling: prefer SITE_URL if provided (prevents weird origin spoofing)
    const siteUrl = (process.env.SITE_URL || "").trim();
    const origin = siteUrl || event.headers.origin || `https://${event.headers.host}`;

    // Idempotency key prevents duplicates if the function is retried
    const idempotencyKey = `checkout_${orderId}`;

    const sessionParams = {
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${origin}${successPath}?success=1&order=${orderId}`,
      cancel_url: `${origin}${successPath}?canceled=1`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents, // Stripe will apply discounts on top
            product_data: {
              name: productName,
              description: productDesc,
            },
          },
        },
      ],
      metadata: {
        order_id: orderId,
        game,
        package: finalPkg,

        rank_from: rankFrom || "",
        rank_to: rankTo || "",

        division_points: divisionPoints === null ? "" : String(divisionPoints),

        discord: cleanDiscord || "",
        platform: platform || "",
        ign: cleanIgn || "",
        region: region || "",
        notes: cleanNotes,

        addon_priority: addons.priority ? "true" : "false",
        addon_specific_hero: addons.specificHero ? "true" : "false",
        addon_low_rr: addons.lowRR ? "true" : "false",
        hero_name: cleanHeroName || "",

        // Promo metadata (helps webhook/bot display it cleanly)
        promo_code: promo?.code || "",
        promo_promotion_code_id: promo?.promotion_code_id || "",
        promo_coupon_id: promo?.coupon_id || "",
        promo_percent_off: promo?.percent_off == null ? "" : String(promo.percent_off),
        promo_amount_off: promo?.amount_off == null ? "" : String(promo.amount_off),
        promo_currency: promo?.currency || "",

        // For visibility/debugging
        base_amount_cents: String(amountCents),
        est_discount_cents: String(discountCentsEst),
      },
    };

    // If promo is valid, attach Stripe discount
    if (promo?.promotion_code_id) {
      sessionParams.discounts = [{ promotion_code: promo.promotion_code_id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        checkoutUrl: session.url,
        url: session.url,
        orderId,
        promoApplied: !!promo,
        promoCode: promo?.code || "",
      }),
    };
  } catch (err) {
    console.error("create-checkout error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
};
