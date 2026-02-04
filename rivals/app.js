// /rivals/app.js

// ================= Banner (success / canceled) =================
function showBanner() {
  const params = new URLSearchParams(window.location.search);
  const banner = document.getElementById("banner");
  if (!banner) return;

  if (params.get("success") === "1") {
    const order = params.get("order") || "";
    const discordUrl = "https://discord.gg/rF5d89mQRq";
    banner.className =
      "mb-6 rounded-2xl border border-emerald-700 bg-emerald-900/30 px-4 py-3";
    banner.innerHTML = `<div class="font-semibold">Payment received ✅</div>
      <div class="text-sm text-slate-200 mt-1">Your Ticket ID: <span class="font-mono font-semibold">${order}</span></div>
      <div class="text-sm text-slate-200 mt-2">Join our Discord and open a support ticket with this ID so we can start your order.</div>
      <a href="${discordUrl}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mt-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold">Join Discord →</a>`;
    banner.classList.remove("hidden");
  } else if (params.get("canceled") === "1") {
    banner.className =
      "mb-6 rounded-2xl border border-rose-700 bg-rose-900/30 px-4 py-3";
    banner.innerHTML = `<div class="font-semibold">Checkout canceled</div>
      <div class="text-sm text-slate-200 mt-1">No charge was made.</div>`;
    banner.classList.remove("hidden");
  }
}
// ================= Banner (success / canceled) =================
function showBanner() {
  const params = new URLSearchParams(window.location.search);
  const banner = document.getElementById("banner");
  if (!banner) return;

  if (params.get("success") === "1") {
    const order = params.get("order") || "";
    const discordUrl = "https://discord.gg/rF5d89mQRq";
    banner.className =
      "mb-6 rounded-2xl border border-emerald-700 bg-emerald-900/30 px-4 py-3";
    banner.innerHTML = `<div class="font-semibold">Payment received ✅</div>
      <div class="text-sm text-slate-200 mt-1">Your Ticket ID: <span class="font-mono font-semibold">${order}</span></div>
      <div class="text-sm text-slate-200 mt-2">Join our Discord and open a support ticket with this ID so we can start your order.</div>
      <a href="${discordUrl}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mt-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold">Join Discord →</a>`;
    banner.classList.remove("hidden");
  } else if (params.get("canceled") === "1") {
    banner.className =
      "mb-6 rounded-2xl border border-rose-700 bg-rose-900/30 px-4 py-3";
    banner.innerHTML = `<div class="font-semibold">Checkout canceled</div>
      <div class="text-sm text-slate-200 mt-1">No charge was made.</div>`;
    banner.classList.remove("hidden");
  }
}

/* ================= Count-up stats (runs once when visible) ================= */
function initCountups() {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatNumber(value, decimals) {
    const factor = Math.pow(10, decimals);
    return (Math.round(value * factor) / factor).toFixed(decimals);
  }

  function animateCount(el, to, decimals, suffix, duration) {
    if (prefersReducedMotion) {
      el.textContent = formatNumber(to, decimals) + suffix;
      return;
    }

    const start = 0;
    const startTime = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = easeOutCubic(t);
      const current = start + (to - start) * eased;
      el.textContent = formatNumber(current, decimals) + suffix;

      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const statEls = Array.from(document.querySelectorAll("[data-countup='1']"));
  if (!statEls.length) return;

  // If IntersectionObserver isn't supported, just run immediately.
  if (!("IntersectionObserver" in window)) {
    statEls.forEach((el) => {
      const to = parseFloat(el.getAttribute("data-to") || "0");
      const decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      const suffix = el.getAttribute("data-suffix") || "";
      animateCount(el, to, decimals, suffix, 900);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const el = entry.target;
        const to = parseFloat(el.getAttribute("data-to") || "0");
        const decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
        const suffix = el.getAttribute("data-suffix") || "";
        animateCount(el, to, decimals, suffix, 900);

        obs.unobserve(el); // run once
      }
    },
    { threshold: 0.6 }
  );

  statEls.forEach((el) => observer.observe(el));
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

// ================= Add-ons / UI helpers =================
function setHeroVisibility() {
  const wrap = document.getElementById("heroWrap");
  const heroChecked = document.getElementById("addonHero")?.checked;
  if (wrap) wrap.classList.toggle("hidden", !heroChecked);
}

function getAddOns() {
  return {
    priority: !!document.getElementById("addonPriority")?.checked,
    specificHero: !!document.getElementById("addonHero")?.checked,
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

  // restore if still valid
  if (prevTo && idx(prevTo) > fromIndex) {
    to.value = prevTo;
  }
}

// ================= Rank icons (main tier only) =================
function getMainTier(rank) {
  if (!rank) return "placeholder";
  // main tier only, ignores 1/2/3
  return rank.split(" ")[0].toLowerCase();
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

// ================= Backend-powered Pricing Preview =================
let previewAbort = null;

async function updatePreview() {
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
  const heroName = document.getElementById("heroName")?.value?.trim() || "";

  const divisionPointsRaw = document.getElementById("divisionPoints")?.value ?? "";
  const divisionPoints = divisionPointsRaw === "" ? null : Number(divisionPointsRaw);

  // If user types something invalid, just treat as null for preview
  const safeDivisionPoints = Number.isFinite(divisionPoints) && divisionPoints >= 0 ? divisionPoints : null;

  const pkg = buildPackageValue(fromRank, toRank);
  hiddenPkg.value = pkg;

  // UI while loading
  totalEl.textContent = "…";
  summaryEl.textContent = `${buildPackageLabel(fromRank, toRank)} (preview)`;

  // Cancel previous request if user changes fast
  if (previewAbort) previewAbort.abort();
  previewAbort = new AbortController();

  try {
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: previewAbort.signal,
      body: JSON.stringify({
        quote: true,
        game: GAME_KEY,
        package: pkg,
        rankFrom: fromRank,
        rankTo: toRank,
        divisionPoints: safeDivisionPoints,
        addons,
        heroName,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Preview failed");

    totalEl.textContent = `$${data.amount}`;
  } catch (e) {
    if (e.name === "AbortError") return;
    totalEl.textContent = "$0.00";
    summaryEl.textContent = `Preview error: ${e.message}`;
  }
}

// ================= Wiring / init =================
function init() {
  showBanner();
  initCountups();
  
  populateRankFrom();
  populateRankToFiltered();

  setHeroVisibility();
  setRankImages();
  updatePreview();

  // Rank listeners
  document.getElementById("rankFrom")?.addEventListener("change", () => {
    populateRankToFiltered();
    setRankImages();
    updatePreview();
  });

  document.getElementById("rankTo")?.addEventListener("change", () => {
    setRankImages();
    updatePreview();
  });

  // Add-on listeners
  ["addonPriority", "addonHero", "addonLowRR"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      setHeroVisibility();
      updatePreview();
    });
  });

  // Division points affects metadata (not price), but we can still refresh preview for consistency
  document.getElementById("divisionPoints")?.addEventListener("input", () => {
    updatePreview();
  });

  // Hero name input affects validation if Specific Hero is on
  document.getElementById("heroName")?.addEventListener("input", () => {
    updatePreview();
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
      const discord = document.getElementById("discord")?.value?.trim() || "";
      const platform = document.getElementById("platform")?.value || "";
      const ign = document.getElementById("ign")?.value?.trim() || "";
      const region = document.getElementById("region")?.value || "";
      const notes = document.getElementById("notes")?.value?.trim() || "";

      const rankFrom = document.getElementById("rankFrom")?.value || "";
      const rankTo = document.getElementById("rankTo")?.value || "";
      const pkg = document.getElementById("package")?.value || "";

      // Optional division points (only under current)
      const divisionPointsRaw = document.getElementById("divisionPoints")?.value ?? "";
      const divisionPoints = divisionPointsRaw === "" ? null : Number(divisionPointsRaw);
      if (divisionPoints !== null && (!Number.isFinite(divisionPoints) || divisionPoints < 0)) {
        throw new Error("Division points must be a valid number (0 or higher).");
      }

      if (!discord || !ign) throw new Error("Please fill out Discord username and In-game name.");
      if (!platform) throw new Error("Please select your platform.");
      if (!region) throw new Error("Please select your region.");
      if (!rankFrom) throw new Error("Please select your current rank.");
      if (!rankTo) throw new Error("Please select your desired rank.");
      if (stepsUp(rankFrom, rankTo) <= 0) throw new Error("Desired rank must be higher than current rank.");
      if (!pkg) throw new Error("Package selection is invalid. Please re-select ranks.");

      const addons = getAddOns();

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
