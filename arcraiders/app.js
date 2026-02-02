(() => {
  const API = "/api/create-checkout";
  const el = (id) => document.getElementById(id);

  const PACKS = {
    starter: {
      title: "🟢 Starter — $42",
      bullets: [
        "Level 15 • 15 Skill Points",
        "All Benches L1 • Scrappy L2",
        "100K Coins + Random Epic",
        "5× Uncommon Loadouts",
        "Daily Feats, Achievements & Raider Deck progress",
      ],
    },
    advanced: {
      title: "🔵 Advanced — $115",
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
      title: "🟣 Epic — $235",
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
      title: "🟡 Legendary — $450",
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
    return {
      game: "arcraiders",
      quote: !!quote,
      package: `arcraiders:${el("pack").value}`,
      discord: el("discord").value.trim(),
      ign: el("ign").value.trim(),
      platform: el("platform").value,
      region: el("region").value,
      notes: el("notes").value.trim(),
    };
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

    el("pack").addEventListener("change", () => {
      renderPackDetails(el("pack").value);
      preview();
    });

    el("previewBtn").addEventListener("click", preview);
    el("checkoutBtn").addEventListener("click", checkout);
  });
})();
