"use strict";

// Только анимация страницы «О компании»; main.js и главная не меняются.
(() => {
  const section = document.querySelector(".about-scene");
  const items = section?.querySelectorAll("[data-about-reveal]");
  if (!section || !items?.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

  document.body.classList.add("has-about-motion");

  const observer = new IntersectionObserver((entries, current) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      current.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -5% 0px", threshold: 0.04 });

  items.forEach((item) => observer.observe(item));
})();
