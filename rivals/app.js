// /rivals/app.js


// ================= Banner (success / canceled) =================
function showBanner() {
  const params = new URLSearchParams(window.location.search);
  const banner = document.getElementById("banner");
  if (!banner) return;

  if (params.get("success") === "1") {
    const order = params.get("order") || "";
    banner.className =
      "mb-6 rounded-2xl border border-emerald-700 bg-emerald-900/30 px-4 py-3";
    banner.innerHTML = `<div class="font-semibold">Payment received ✅</div>
      <div class="text-sm text-slate-200 mt-1">Order ID: <span class="font-mono">${order}</span></div>
      <div class="text-xs text-slate-300 mt-1">We’ll contact you on Discord soon.</div>`;
    banner.classList.remove("hidden");
  } else if (params.get("canceled") === "1") {
    banner.className =
      "mb-6 rounded-2xl border border-rose-700 bg-rose-900/30 px-4 py-3";
    banner.innerHTML = `<div class="font-semibold">Checkout canceled</div>
      <div class="text-sm text-slate-200 mt-1">No charge was made.</div>`;
    banner.classList.remove("hidden");
  }
}

// ================= Game Config =================
const GAME_KEY = "rivals";

// Tiers with divisions 3/2/1
const DIVISION_TIERS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Grandmaster",
  "Celestial",
];

// Single ranks (no divisions)
const SINGLE_RANKS = ["Eternity", "OOA"];

function buildRanks() {
  const out = [];
  for (const tier of DIVISION_TIERS) {
    out.push(`${tier} 3`);
    out.push(`${tier} 2`);
    out.push(`${tier} 1`);
  }
  for (const r of SINGLE_RANKS) out.push(r);
  return out;
}

const RANKS = buildRanks();

function idx(rank) {
  return RANKS.indexOf(rank);
}

// Only allow rank-ups
function stepsUp(fromRank, toRank) {
  const i = idx(fromRank);
  const j = idx(toRank);
  if (i < 0 || j < 0) return 0;
  return j - i; // must be > 0
}

function buildPackageValue(fromRank, toRank) {
  return `${GAME_KEY}:${fromRank}->${toRank}`;
}

function buildPackageLabel(fromRank, toRank) {
  return `${fromRank} → ${toRank}`;
}

// ================= Pricing (PREVIEW ONLY) =================
// Base starts here
const BASE_PRICE = 6;

// Slow linear step cost up to mid Diamond
const STEP_ADD_SLOW = 4.3; // slow markup per step until mid Diamond

// Heavy ramp AFTER mid Diamond (geometric growth per step)
const STEP_ADD_FAST = 12.13;       // starting “per step” add after threshold
const FAST_STEP_START_MULT = 1.8; // first post-threshold step multiplier
const FAST_GROWTH = 1.23;       // growth factor per step (raise to ramp harder)

// OOA target range
const OOA_MIN = 1000;
const OOA_MAX = 2000;

// Define "mid Diamond" threshold (Diamond 2)
const MID_DIA_INDEX = idx("Diamond 2");

// Keep these for your tier logic
const GM_START_INDEX = idx("Grandmaster 3");
const ETERNITY_INDEX = idx("Eternity");

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Geometric series sum: base*startMult*(growth^n - 1)/(growth - 1)
function sumExponentialSteps(base, nSteps, startMult, growth) {
  if (nSteps <= 0) return 0;
  if (growth === 1) return base * startMult * nSteps;
  return base * startMult * (Math.pow(growth, nSteps) - 1) / (growth - 1);
}

// OOA: expensive, capped 1k–2k
function calcOOAPrice(fromRank) {
  const fromIndex = idx(fromRank);
  if (fromIndex < 0 || ETERNITY_INDEX < 0) return OOA_MIN;

  const stepsToEternity = Math.max(0, ETERNITY_INDEX - fromIndex);
  const price = OOA_MIN + stepsToEternity * 25; // tune slope
  return clamp(price, OOA_MIN, OOA_MAX);
}

function calcBasePrice(fromRank, toRank) {
  const i = idx(fromRank);
  const j = idx(toRank);
  if (i < 0 || j < 0) return 0;

  const steps = j - i;
  if (steps <= 0) return 0;

  // OOA override
  if (toRank === "OOA") return calcOOAPrice(fromRank);

  // If threshold missing (typo or renamed ranks), fallback to simple linear
  if (MID_DIA_INDEX < 0) {
    return BASE_PRICE + steps * STEP_ADD_SLOW;
  }

  // -------- Case 1: Entire boost is <= mid Diamond (slow linear) --------
  if (j <= MID_DIA_INDEX) {
    return BASE_PRICE + steps * STEP_ADD_SLOW;
  }

  // -------- Case 2: Crosses past mid Diamond (slow then heavy ramp) --------
  // Slow part: from current -> mid Diamond
  const slowSteps = Math.max(0, MID_DIA_INDEX - i);
  const slowCost = BASE_PRICE + slowSteps * STEP_ADD_SLOW;

  // Heavy part: steps AFTER mid Diamond
  const postSteps = j - Math.max(i, MID_DIA_INDEX);

  // Post-threshold ramp: geometric add-ons stacked onto slowCost
  // This makes costs jump noticeably after mid Diamond.
  const rampCost = sumExponentialSteps(STEP_ADD_FAST, postSteps, FAST_STEP_START_MULT, FAST_GROWTH);

  return slowCost + rampCost;
}

// ================= Add-ons / UI helpers =================
function setHeroVisibility() {
  const wrap = document.getElementById("heroWrap");
  const heroChecked = document.getElementById("addonHero")?.checked;
  if (wrap) wrap.classList.toggle("hidden", !heroChecked);
}

function getAddOnMultiplier() {
  let multiplier = 1;
  if (document.getElementById("addonPriority")?.checked) multiplier += 0.2;
  if (document.getElementById("addonHero")?.checked) multiplier += 0.2;
  if (document.getElementById("addonLowRR")?.checked) multiplier += 0.5;
  return multiplier;
}

// ================= Rank dropdown populate =================
function populateRankFrom() {
  const from = document.getElementById("rankFrom");
  if (!from) return;

  // prevent double-fill
  if (from.querySelectorAll("option").length > 1) return;

  for (const r of RANKS) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    from.appendChild(opt);
  }
}

// Desired rank shows ONLY ranks above current
function populateRankToFiltered() {
  const from = document.getElementById("rankFrom");
  const to = document.getElementById("rankTo");
  if (!from || !to) return;

  const fromRank = from.value;
  const fromIndex = idx(fromRank);

  const prevTo = to.value;

  to.innerHTML = `<option value="" disabled selected>Select desired rank</option>`;

  if (!fromRank || fromIndex < 0) return;

  for (let j = fromIndex + 1; j < RANKS.length; j++) {
    const r = RANKS[j];
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    to.appendChild(opt);
  }

  // restore if still valid
  if (prevTo && idx(prevTo) > fromIndex) {
    to.value = prevTo;
  }
}

// ================= Rank icons (main tier only) =================
function getMainTier(rank) {
  if (!rank) return "placeholder";
  return rank.split(" ")[0].toLowerCase(); // ignores 1/2/3
}

function swapImage(imgEl, tier) {
  if (!imgEl) return;

  imgEl.classList.add("opacity-0");

  setTimeout(() => {
    imgEl.src = `/assets/ranks/${tier}.png`;
    imgEl.onerror = () => (imgEl.src = "/assets/ranks/placeholder.png");
    imgEl.classList.remove("opacity-0");
  }, 120);
}

function setRankImages() {
  const fromRank = document.getElementById("rankFrom")?.value || "";
  const toRank = document.getElementById("rankTo")?.value || "";

  swapImage(document.getElementById("rankFromImg"), getMainTier(fromRank));
  swapImage(document.getElementById("rankToImg"), getMainTier(toRank));
}

// ================= Pricing preview =================
function calcPreviewTotal() {
  const fromEl = document.getElementById("rankFrom");
  const toEl = document.getElementById("rankTo");
  const totalEl = document.getElementById("totalPreview");
  const summaryEl = document.getElementById("packageSummary");
  const hiddenPkg = document.getElementById("package");

  if (!fromEl || !toEl || !totalEl || !summaryEl || !hiddenPkg) {
    console.error("Missing required elements for pricing preview.");
    return;
  }

  const fromRank = fromEl.value || "";
  const toRank = toEl.value || "";

  if (!fromRank || !toRank) {
    totalEl.textContent = "$0.00";
    hiddenPkg.value = "";
    summaryEl.textContent = "Choose ranks above.";
    return;
  }

  const steps = stepsUp(fromRank, toRank);
  if (steps <= 0) {
    totalEl.textContent = "$0.00";
    hiddenPkg.value = "";
    summaryEl.textContent = "Desired rank must be higher than current rank.";
    return;
  }

  const base = calcBasePrice(fromRank, toRank);
  const mult = getAddOnMultiplier();
  const total = base * mult;

  hiddenPkg.value = buildPackageValue(fromRank, toRank);
  totalEl.textContent = `$${total.toFixed(2)}`;
  summaryEl.textContent = `${buildPackageLabel(fromRank, toRank)} (base: $${base.toFixed(2)})`;
}

// ================= Wiring / init =================
function init() {
  showBanner();

  populateRankFrom();
  populateRankToFiltered();

  setHeroVisibility();
  setRankImages();
  calcPreviewTotal();

  // Rank listeners
  document.getElementById("rankFrom")?.addEventListener("change", () => {
    populateRankToFiltered();
    setRankImages();
    calcPreviewTotal();
  });

  document.getElementById("rankTo")?.addEventListener("change", () => {
    setRankImages();
    calcPreviewTotal();
  });

  // Add-on listeners
  ["addonPriority", "addonHero", "addonLowRR"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      setHeroVisibility();
      calcPreviewTotal();
    });
  });

  // Submit
  document.getElementById("orderForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const status = document.getElementById("status");
    const payBtn = document.getElementById("payBtn");
    if (status) status.textContent = "";
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.textContent = "Creating checkout...";
    }

    try {
      const discord = document.getElementById("discord").value.trim();
      const platform = document.getElementById("platform").value;
      const ign = document.getElementById("ign").value.trim();
      const region = document.getElementById("region").value;
      const notes = document.getElementById("notes").value.trim();

      const rankFrom = document.getElementById("rankFrom").value;
      const rankTo = document.getElementById("rankTo").value;
      const pkg = document.getElementById("package").value;

      // Optional division points (only under current)
      const divisionPointsRaw = document.getElementById("divisionPoints")?.value ?? "";
      const divisionPoints = divisionPointsRaw === "" ? null : Number(divisionPointsRaw);
      if (divisionPoints !== null && (!Number.isFinite(divisionPoints) || divisionPoints < 0)) {
        throw new Error("Division points must be a valid number (0 or higher).");
      }

      if (!discord || !ign) throw new Error("Please fill out Discord username and In-game name.");
      if (!rankFrom) throw new Error("Please select your current rank.");
      if (!rankTo) throw new Error("Please select your desired rank.");
      if (stepsUp(rankFrom, rankTo) <= 0) throw new Error("Desired rank must be higher than current rank.");
      if (!pkg) throw new Error("Package selection is invalid. Please re-select ranks.");

      const addons = {
        priority: document.getElementById("addonPriority").checked,
        specificHero: document.getElementById("addonHero").checked,
        lowRR: document.getElementById("addonLowRR").checked,
      };

      const heroName = document.getElementById("heroName")?.value?.trim() || "";
      if (addons.specificHero && !heroName) {
        throw new Error("Please enter a hero name for the Specific Hero add-on.");
      }

      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: GAME_KEY,
          discord,
          platform,
          ign,
          region,
          notes,
          package: pkg,
          rankFrom,
          rankTo,
          divisionPoints,
          addons,
          heroName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create checkout session");

      window.location.href = data.checkoutUrl;
    } catch (err) {
      if (status) status.textContent = `Error: ${err.message}`;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = "Continue to Secure Checkout";
      }
    }
  });
}

// Run after DOM is ready so listeners always attach
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
