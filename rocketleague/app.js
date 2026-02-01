// /rocketleague/app.js

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
const GAME_KEY = "rocketleague";

// Rocket League tiers (match backend)
const DIVISION_TIERS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champion",
  "Grand Champion",
];

const SINGLE_RANKS = ["SSL"];

function buildRanks() {
  const out = [];
  for (const tier of DIVISION_TIERS) {
    out.push(`${tier} 3`, `${tier} 2`, `${tier} 1`);
  }
  for (const r of SINGLE_RANKS) out.push(r);
  return out;
}

const RANKS = buildRanks();
const idx = (rank) => RANKS.indexOf(rank);

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
// Matches backend intent: ramps HARD after Champion
const STEP_PRICE_BY_TIER = {
  bronze: 3.0,
  silver: 3.5,
  gold: 4.25,
  platinum: 6.0,
  diamond: 9.0,
  champion: 16.0,
  grandchampion: 30.0,
  ssl: 199.0, // used only for final jump
};

function tierKey(rank) {
  if (!rank) return "bronze";
  const lower = String(rank).toLowerCase();

  // handle "Grand Champion"
  if (lower.startsWith("grand champion")) return "grandchampion";
  if (lower.startsWith("ssl")) return "ssl";

  return String(rank).split(" ")[0].toLowerCase(); // bronze/silver/gold/platinum/diamond/champion
}

function calcPreviewTotal(fromRank, toRank, addons) {
  const i = idx(fromRank);
  const j = idx(toRank);
  if (i < 0 || j < 0 || j <= i) return 0;

  let total = 0;

  for (let k = i + 1; k <= j; k++) {
    const destRank = RANKS[k];

    if (destRank === "SSL") {
      total += STEP_PRICE_BY_TIER.ssl;
    } else {
      const key = tierKey(destRank);
      total += STEP_PRICE_BY_TIER[key] || 0;
    }
  }

  let mult = 1;
  if (addons.priority) mult += 0.2;
  if (addons.lowRR) mult += 0.5;

  return total * mult;
}

// ================= Add-ons / UI helpers =================
function getAddOns() {
  return {
    priority: !!document.getElementById("addonPriority")?.checked,
    lowRR: !!document.getElementById("addonLowRR")?.checked,
  };
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

  if (prevTo && idx(prevTo) > fromIndex) {
    to.value = prevTo;
  }
}

// ================= Rank icons (Rocket League folder) =================
function getMainTier(rank) {
  if (!rank) return "placeholder";
  const lower = rank.toLowerCase();
  if (lower.startsWith("grand champion")) return "grandchampion";
  if (lower.startsWith("champion")) return "champion";
  if (lower.startsWith("ssl")) return "ssl";
  return rank.split(" ")[0].toLowerCase();
}

function swapImage(imgEl, tier) {
  if (!imgEl) return;
  imgEl.classList.add("opacity-0");

  setTimeout(() => {
    imgEl.src = `/assets/ranks-rl/${tier}.png`;
    imgEl.onerror = () => (imgEl.src = "/assets/ranks-rl/placeholder.png");
    imgEl.classList.remove("opacity-0");
  }, 120);
}

function setRankImages() {
  const fromRank = document.getElementById("rankFrom")?.value || "";
  const toRank = document.getElementById("rankTo")?.value || "";

  swapImage(document.getElementById("rankFromImg"), getMainTier(fromRank));
  swapImage(document.getElementById("rankToImg"), getMainTier(toRank));
}

// ================= Pricing preview (UI) =================
function updatePreview() {
  const fromEl = document.getElementById("rankFrom");
  const toEl = document.getElementById("rankTo");
  const totalEl = document.getElementById("totalPreview");
  const summaryEl = document.getElementById("packageSummary");
  const hiddenPkg = document.getElementById("package");

  if (!fromEl || !toEl || !totalEl || !summaryEl || !hiddenPkg) return;

  const fromRank = fromEl.value || "";
  const toRank = toEl.value || "";

  if (!fromRank || !toRank) {
    totalEl.textContent = "$0.00";
    hiddenPkg.value = "";
    summaryEl.textContent = "Choose ranks above.";
    return;
  }

  if (stepsUp(fromRank, toRank) <= 0) {
    totalEl.textContent = "$0.00";
    hiddenPkg.value = "";
    summaryEl.textContent = "Desired rank must be higher than current rank.";
    return;
  }

  const addons = getAddOns();
  const total = calcPreviewTotal(fromRank, toRank, addons);

  hiddenPkg.value = buildPackageValue(fromRank, toRank);
  totalEl.textContent = `$${total.toFixed(2)}`;
  summaryEl.textContent = `${buildPackageLabel(fromRank, toRank)} (preview)`;
}

// ================= Wiring / init =================
function init() {
  showBanner();
  populateRankFrom();
  populateRankToFiltered();
  setRankImages();
  updatePreview();

  document.getElementById("rankFrom")?.addEventListener("change", () => {
    populateRankToFiltered();
    setRankImages();
    updatePreview();
  });

  document.getElementById("rankTo")?.addEventListener("change", () => {
    setRankImages();
    updatePreview();
  });

  ["addonPriority", "addonLowRR"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", updatePreview);
  });

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
      const discord = document.getElementById("discord")?.value?.trim() || "";
      const platform = document.getElementById("platform")?.value || "";
      const ign = document.getElementById("ign")?.value?.trim() || "";
      const region = document.getElementById("region")?.value || "";
      const notes = document.getElementById("notes")?.value?.trim() || "";

      const rankFrom = document.getElementById("rankFrom")?.value || "";
      const rankTo = document.getElementById("rankTo")?.value || "";
      const pkg = document.getElementById("package")?.value || "";

      if (!discord || !ign) throw new Error("Please fill out Discord username and In-game name.");
      if (!platform) throw new Error("Please select your platform.");
      if (!region) throw new Error("Please select your region.");
      if (!rankFrom) throw new Error("Please select your current rank.");
      if (!rankTo) throw new Error("Please select your desired rank.");
      if (stepsUp(rankFrom, rankTo) <= 0) throw new Error("Desired rank must be higher than current rank.");
      if (!pkg) throw new Error("Package selection is invalid. Please re-select ranks.");

      const addons = getAddOns();

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
          addons,
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
