"use strict";

(() => {
  const body = document.body;
  const revealItems = document.querySelectorAll("[data-fleet-reveal]");
  const filterButtons = document.querySelectorAll("[data-fleet-filter]");
  const cards = document.querySelectorAll("[data-fleet-card]");

  if (
    revealItems.length &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    "IntersectionObserver" in window
  ) {
    body.classList.add("has-fleet-motion");

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );

    revealItems.forEach((item) => observer.observe(item));
  }

  function applyFilter(filter) {
    cards.forEach((card) => {
      const categories = (card.dataset.category || "").split(/\s+/).filter(Boolean);
      const visible = filter === "all" || categories.includes(filter);
      card.classList.toggle("is-filtered-out", !visible);
    });
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      applyFilter(button.dataset.fleetFilter || "all");
    });
  });
})();
