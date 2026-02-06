(() => {
  const API = "/api/create-checkout";
  const el = (id) => document.getElementById(id);

  const PACKS = {
    starter: {
      title: "🟢 Starter",
      bullets: [
        "Level 15 • 15 Skill Points",
        "All Benches L1 • Scrappy L2",
        "100K Coins + Random Epic",
        "5× Uncommon Loadouts",
        "Daily Feats, Achievements & Raider Deck progress",
      ],
    },
    advanced: {
      title: "🔵 Advanced ",
      bullets: [
        "Level 20 • 20 Skill Points",
        "All Benches L2 • Scrappy L2",
        "200K Coins + Random Epic",
        "10× Uncommon • 3× Rare Loadouts",
        "2× Rare Blueprints",
        "Non-epic quests, Daily Feats, Achievements & Raider Deck progress",
      ],
    },
    epic: {
      title: "🟣 Epic ",
      bullets: [
        "Level 25 • 25 Skill Points",
        "Refiner L2 • Other Benches L3 • Scrappy L3",
        "400K Coins + Random Epic",
        "20× Uncommon • 5× Rare • 3× Epic Loadouts",
        "3× Rare • 2× Epic Blueprints",
        "60% non-epic quests, Daily Feats, Achievements, Raider Deck & Expedition progress",
      ],
    },
    legendary: {
      title: "🟡 Legendary ",
      bullets: [
        "Level 37 • Final skill perk unlocked",
        "All Benches L3 • Scrappy L5",
        "1M Coins + Random Epic",
        "15× Rare • 6× Epic Loadouts",
        "3× Rare • 2× Epic Blueprints",
        "90%+ non-epic quests, Daily Feats, Achievements, Raider Deck & Expedition progress",
      ],
    },
  };

  function renderPackDetails(key) {
    const pack = PACKS[key];
    if (!pack) {
      el("packDetails").innerHTML = `
        <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <p class="text-sm text-slate-300">Pick a pack to see details.</p>
        </div>
      `;
      return;
    }

    el("packDetails").innerHTML = `
      <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <p class="text-sm font-semibold">${pack.title}</p>
        <ul class="mt-3 space-y-2 text-sm text-slate-300">
          ${pack.bullets
            .map(
              (b) => `
                <li class="flex gap-3">
                  <span class="mt-2 h-2 w-2 rounded-full bg-indigo-400"></span>
                  ${b}
                </li>`
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  function showSuccessIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const order = params.get("order");

    if (success === "1" && order) {
      const banner = el("successBanner");
      const orderText = el("orderIdText");
      if (banner && orderText) {
        orderText.textContent = order;
        banner.classList.remove("hidden");
        banner.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

function payload(quote) {
  const packVal = el("pack").value;

  // quote payload should be minimal so it doesn't fail required field validation
  if (quote) {
    return {
      game: "arcraiders",
      quote: true,
      package: `arcraiders:${packVal}`,
    };
  }

  // checkout payload includes everything
  return {
    game: "arcraiders",
    quote: false,
    package: `arcraiders:${packVal}`,
    discord: el("discord").value.trim(),
    ign: el("ign").value.trim(),
    platform: el("platform").value,
    region: el("region").value,
    notes: el("notes").value.trim(),
  };
}


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

  async function preview() {
    if (!el("pack").value) return;

    el("pricePreview").textContent = "Calculating…";

    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(true)),
      });

      const d = await r.json();
      el("pricePreview").innerHTML = r.ok
        ? `<div class="text-xl font-extrabold">$${d.amount}</div>`
        : `<span class="text-red-400">${d.error || "Quote failed"}</span>`;
    } catch {
      el("pricePreview").innerHTML = `<span class="text-red-400">Network error</span>`;
    }
  }

  async function checkout() {
    for (const f of ["pack", "discord", "ign", "platform", "region"]) {
      if (!el(f).value) return alert("Please complete all required fields.");
    }

    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(false)),
      });

      const d = await r.json();
      if (!r.ok) return alert(d.error || "Checkout failed");

      const url = d.checkoutUrl || d.url;
      if (!url) return alert("No checkout URL returned");
      window.location.href = url;
    } catch {
      alert("Network error");
    }
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    renderPackDetails("");
    showSuccessIfPresent();
    initCountUps()

    el("pack").addEventListener("change", () => {
      renderPackDetails(el("pack").value);
      preview();
    });

    el("previewBtn").addEventListener("click", preview);
    el("checkoutBtn").addEventListener("click", checkout);
  });
})();
