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
// Ladder: Tier 3/2/1 + SSL single
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

// Per-step pricing (ramps hard after Champ)
const RL_STEP_PRICE_BY_TIER = {
  bronze: 3.0,
  silver: 3.5,
  gold: 4.25,
  platinum: 6.0,
  diamond: 9.0,
  champion: 16.0,
  grandchampion: 30.0, // bigger jump after champ (your request)
};
// Final jump into SSL is flat (the last step into SSL)
const RL_SSL_JUMP = 199.0;

function rlTierKey(rank) {
  if (!rank) return "";
  const lower = String(rank).toLowerCase();
  if (lower.startsWith("grand champion")) return "grandchampion";
  if (lower.startsWith("champion")) return "champion";
  return String(rank).split(" ")[0].toLowerCase(); // bronze/silver/gold/platinum/diamond
}

function calcRLBasePrice(fromRank, toRank) {
  const i = rlIdx(fromRank);
  const j = rlIdx(toRank);
  if (i < 0 || j < 0) return 0;
  if (j <= i) return 0;

  let total = 0;

  // Sum costs for each step into the destination rank
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
  // RL add-ons you currently have: priority + lowRR
  let m = 1;
  if (addons.priority) m += 0.2;
  if (addons.lowRR) m += 0.5;
  return m;
}

// ===================== ARC RAIDERS CONFIG =====================
const ARC_PACKS = {
  starter: { price: 42.0, label: "Starter" },
  advanced: { price: 115.0, label: "Advanced" },
  epic: { price: 235.0, label: "Epic" },
  legendary: { price: 450.0, label: "Legendary" },
};

function arcPackKeyFromPackage(pkg) {
  // expects "arcraiders:starter" etc
  if (!pkg) return "";
  const s = String(pkg);
  if (!s.startsWith("arcraiders:")) return "";
  return s.split(":")[1] || "";
}

// ===================== HANDLER =====================
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
      // some pages use `package`, some use `pack` - support both
      package: pkg,
      pack, // optional alias
      rankFrom,
      rankTo,
      divisionPoints = null,
      addons = {},
      heroName = "",
      quote = false,
    } = body;

    const isQuote = quote === true;

    // unify package value
    const finalPkg = pkg || pack || "";

    // Only require customer fields for REAL checkout (and per-game)
    if (!isQuote) {
      if (game === "rivals" || game === "rocketleague") {
        if (!discord || !platform || !ign || !region) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields." }) };
        }
      } else if (game === "arcraiders") {
        if (!discord || !ign) {
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

        if (addons.specificHero && !String(heroName || "").trim()) {
          return { statusCode: 400, body: JSON.stringify({ error: "Hero name required." }) };
        }

        const base = calcBasePrice(rankFrom, rankTo);
        const total = base * addonMultiplier(addons);
        amountCents = Math.round(total * 100);

        productName = "TopDog Rivals Boost";
        productDesc = `${rankFrom} → ${rankTo}`;
        successPath = "/rivals/";

        if (isQuote) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              amountCents,
              amount: (amountCents / 100).toFixed(2),
              productName,
              productDesc,
            }),
          };
        }

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

        if (isQuote) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              amountCents,
              amount: (amountCents / 100).toFixed(2),
              productName,
              productDesc,
            }),
          };
        }

        break;
      }

      case "arcraiders": {
      const PRICES = {
        starter: 42,
        advanced: 115,
        epic: 235,
        legendary: 450,
      };

      if (!pkg || !pkg.startsWith("arcraiders:")) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid Arc Raiders package." }) };
      }

      const packKey = pkg.split(":")[1];
      const price = PRICES[packKey];

      if (!price) {
        return { statusCode: 400, body: JSON.stringify({ error: "Unknown Arc Raiders pack." }) };
      }

      amountCents = Math.round(price * 100);
      productName = "TopDog Arc Raiders Boost";
      productDesc = packKey.charAt(0).toUpperCase() + packKey.slice(1) + " Pack";
      successPath = "/arcraiders/";

      if (isQuote) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            amountCents,
            amount: price.toFixed(2),
            productName,
            productDesc,
          }),
        };
      }

      break;
    }


      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid game." }) };
    }

    // ===================== STRIPE SESSION =====================
    const orderId = `TD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const origin = event.headers.origin || `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${origin}${successPath}?success=1&order=${orderId}`,
      cancel_url: `${origin}${successPath}?canceled=1`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
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

        // Keep for backwards compatibility (rivals uses it, RL ignores it)
        division_points: divisionPoints === null ? "" : String(divisionPoints),

        // customer-ish data (arcraiders may not send platform/region and that's fine)
        discord: discord || "",
        platform: platform || "",
        ign: ign || "",
        region: region || "",
        notes: String(notes || ""),

        addon_priority: addons.priority ? "true" : "false",
        addon_specific_hero: addons.specificHero ? "true" : "false",
        addon_low_rr: addons.lowRR ? "true" : "false",
        hero_name: String(heroName || ""),
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        checkoutUrl: session.url, // your current pages use this
        url: session.url,         // extra alias (some pages use data.url)
        orderId,
      }),
    };
  } catch (err) {
    console.error("create-checkout error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Server error" }) };
  }
};
