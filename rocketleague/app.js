// /rocketleague/app.js

// ================= Count-up Stats (top strip) =================
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateCountUp(el) {
  if (!el || el.dataset.counted === "1") return;

  const to = Number(el.dataset.to ?? "0");
  const decimals = Number(el.dataset.decimals ?? "0");
  const suffix = el.dataset.suffix ?? "";
  const duration = Number(el.dataset.duration ?? "900");

  if (!Number.isFinite(to)) return;

  el.dataset.counted = "1";

  const start = performance.now();
  const from = 0;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = easeOutCubic(t);
    const value = from + (to - from) * eased;
    el.textContent = `${value.toFixed(decimals)}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function initCountUps() {
  const els = Array.from(document.querySelectorAll('[data-countup="1"]'));
  if (!els.length) return;

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            animateCountUp(entry.target);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.35 }
    );

    els.forEach((el) => io.observe(el));
    return;
  }

  els.forEach(animateCountUp);
}

// ================= Banner (success / canceled) =================
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function showBanner() {
  const params = new URLSearchParams(window.location.search);
  const banner = document.getElementById("banner");
  if (!banner) return;

  if (params.get("success") === "1") {
    const order = params.get("order") || "";
    const discordUrl = "https://discord.gg/rF5d89mQRq";
    banner.className =
      "mb-6 rounded-2xl border border-emerald-700 bg-emerald-900/30 px-4 py-3";
    banner.innerHTML = `
      <div class="font-semibold">Payment received ✅</div>
      <div class="text-sm text-slate-200 mt-1">
        Your Ticket ID:
        <span id="orderIdText" class="font-mono font-semibold">${order}</span>
      </div>
      <div class="text-sm text-slate-200 mt-2">
        Join our Discord and open a support ticket with this ID so we can start your order.
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-3">
        <a href="${discordUrl}" target="_blank" rel="noopener"
          class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold">
          Join Discord →
        </a>
        <button id="copyOrderBtn" type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 px-4 py-2 text-sm font-semibold">
          Copy ID
        </button>
        <span id="copyMsg" class="text-xs text-slate-300"></span>
      </div>
    `;
    banner.classList.remove("hidden");

    const btn = document.getElementById("copyOrderBtn");
    const msg = document.getElementById("copyMsg");
    btn?.addEventListener("click", async () => {
      if (!order) return;
      const ok = await copyText(order);
      if (msg) msg.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => {
        if (msg) msg.textContent = "";
      }, 1400);
    });
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
  for (const tier of DIVISION_TIERS) out.push(`${tier} 3`, `${tier} 2`, `${tier} 1`);
  for (const r of SINGLE_RANKS) out.push(r);
  return out;
}

const RANKS = buildRanks();
const idx = (rank) => RANKS.indexOf(rank);

function stepsUp(fromRank, toRank) {
  const i = idx(fromRank);
  const j = idx(toRank);
  if (i < 0 || j < 0) return 0;
  return j - i;
}

function buildPackageValue(fromRank, toRank) {
  return `${GAME_KEY}:${fromRank}->${toRank}`;
}
function buildPackageLabel(fromRank, toRank) {
  return `${fromRank} → ${toRank}`;
}

// ================= Add-ons / UI helpers =================
function getAddOns() {
  return {
    priority: !!document.getElementById("addonPriority")?.checked,
    lowRR: !!document.getElementById("addonLowRR")?.checked,
  };
}

function addonsLabel(addons) {
  const list = [];
  if (addons.priority) list.push("Priority");
  if (addons.lowRR) list.push("Low RR");
  return list.length ? list.join(", ") : "—";
}

// ================= Rank dropdown populate =================
function populateRankFrom() {
  const from = document.getElementById("rankFrom");
  if (!from) return;
  if (from.querySelectorAll("option").length > 1) return;

  for (const r of RANKS) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    from.appendChild(opt);
  }
}

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

  if (prevTo && idx(prevTo) > fromIndex) to.value = prevTo;
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

// ================= Promo UI (client-side placeholder) =================
const PROMO_STORAGE_KEY = "td_promo_rl";

function normalizePromo(code) {
  return String(code || "").trim().toUpperCase();
}

// UI-only fake promos for now (safe)
const PROMO_RULES = {
  SAVE10: { type: "percent", value: 10 },
  SAVE5: { type: "percent", value: 5 },
  WELCOME5: { type: "flat", value: 5 },
};

function getAppliedPromo() {
  try {
    const raw = localStorage.getItem(PROMO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAppliedPromo(obj) {
  try {
    if (!obj) localStorage.removeItem(PROMO_STORAGE_KEY);
    else localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

function applyPromoToAmount(baseAmount, promo) {
  if (!promo) return { base: baseAmount, discount: 0, total: baseAmount };

  const rule = PROMO_RULES[promo.code];
  if (!rule) return { base: baseAmount, discount: 0, total: baseAmount };

  let discount = 0;
  if (rule.type === "percent") {
    discount = (baseAmount * rule.value) / 100;
  } else if (rule.type === "flat") {
    discount = rule.value;
  }

  discount = Math.max(0, Math.min(discount, baseAmount));
  const total = baseAmount - discount;
  return { base: baseAmount, discount, total };
}

function renderPromoUI(baseAmount) {
  const promoInput = document.getElementById("promoCode");
  const promoMsg = document.getElementById("promoMsg");
  const breakdown = document.getElementById("promoBreakdown");
  const baseEl = document.getElementById("promoBase");
  const discEl = document.getElementById("promoDiscount");
  const totalEl = document.getElementById("promoTotal");

  if (!promoInput || !promoMsg || !breakdown || !baseEl || !discEl || !totalEl) return;

  const promo = getAppliedPromo();
  if (!promo) {
    promoMsg.textContent = "";
    breakdown.classList.add("hidden");
    promoInput.value = "";
    return;
  }

  promoInput.value = promo.code;

  const rule = PROMO_RULES[promo.code];
  if (!rule) {
    promoMsg.textContent = "Promo code applied (will validate at checkout).";
    breakdown.classList.add("hidden");
    return;
  }

  const { base, discount, total } = applyPromoToAmount(baseAmount, promo);

  promoMsg.textContent =
    rule.type === "percent"
      ? `${promo.code} applied: ${rule.value}% off (preview)`
      : `${promo.code} applied: $${rule.value.toFixed(2)} off (preview)`;

  baseEl.textContent = `$${base.toFixed(2)}`;
  discEl.textContent = `-$${discount.toFixed(2)}`;
  totalEl.textContent = `$${total.toFixed(2)}`;
  breakdown.classList.remove("hidden");
}

// ================= Sidebar Summary =================
function renderSidebarSummary(pkgLabel, addons, displayTotal) {
  const pkgEl = document.getElementById("summaryPackage");
  const addonsEl = document.getElementById("summaryAddons");
  const totalEl = document.getElementById("summaryTotal");

  if (pkgEl) pkgEl.textContent = pkgLabel || "—";
  if (addonsEl) addonsEl.textContent = addonsLabel(addons);
  if (totalEl) totalEl.textContent = displayTotal || "$0.00";
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

  const addons = getAddOns();

  if (!fromRank || !toRank) {
    totalEl.textContent = "$0.00";
    hiddenPkg.value = "";
    summaryEl.textContent = "Choose ranks above.";
    renderSidebarSummary("—", addons, "$0.00");
    renderPromoUI(0);
    return;
  }

  if (stepsUp(fromRank, toRank) <= 0) {
    totalEl.textContent = "$0.00";
    hiddenPkg.value = "";
    summaryEl.textContent = "Desired rank must be higher than current rank.";
    renderSidebarSummary("—", addons, "$0.00");
    renderPromoUI(0);
    return;
  }

  const pkg = buildPackageValue(fromRank, toRank);
  hiddenPkg.value = pkg;

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
        addons,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Preview failed");

    const baseAmount = Number(data.amountCents || 0) / 100;
    const promo = getAppliedPromo();
    const { total } = applyPromoToAmount(baseAmount, promo);

    const displayTotal = `$${total.toFixed(2)}`;
    totalEl.textContent = displayTotal;

    renderSidebarSummary(buildPackageLabel(fromRank, toRank), addons, displayTotal);
    renderPromoUI(baseAmount);
  } catch (e) {
    if (e.name === "AbortError") return;
    totalEl.textContent = "$0.00";
    summaryEl.textContent = `Preview error: ${e.message}`;
    renderSidebarSummary("—", addons, "$0.00");
    renderPromoUI(0);
  }
}

// ================= Wiring / init =================
function initPromoButtons() {
  const input = document.getElementById("promoCode");
  const btn = document.getElementById("applyPromoBtn");
  const msg = document.getElementById("promoMsg");
  if (!input || !btn || !msg) return;

  btn.addEventListener("click", () => {
    const code = normalizePromo(input.value);
    if (!code) {
      setAppliedPromo(null);
      msg.textContent = "Promo cleared.";
      updatePreview();
      return;
    }

    // UI-only validation for now
    setAppliedPromo({ code });

    if (PROMO_RULES[code]) msg.textContent = `${code} applied (preview).`;
    else msg.textContent = `${code} saved (will validate at checkout).`;

    updatePreview();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn.click();
    }
  });
}

function init() {
  showBanner();
  initCountUps();

  populateRankFrom();
  populateRankToFiltered();
  setRankImages();

  initPromoButtons();
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
      const promoCode = normalizePromo(document.getElementById("promoCode")?.value || "");

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
          promoCode, // forward for later server-side validation
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
