"use strict";

// Появление отдельных элементов, а не целых колонок одним блоком.
// Никакого автоскролла: каждая анимация зависит только от реальной прокрутки.
(() => {
  const scenes = document.querySelectorAll(".story, .prices, .estimate");
  const revealItems = document.querySelectorAll(".story [data-reveal], .prices [data-reveal], .estimate [data-reveal]");
  if (!scenes.length || !revealItems.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;

  // До включения JS контент не скрывается (progressive enhancement).
  document.documentElement.classList.add("has-motion");

  // Медленное появление фотографий на границе кадров.
  const sceneObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );

  // На длинной мобильной секции каждая колонка открывается в своё время.
  // В тарифах и форме элементы идут каскадом по мере появления в зоне просмотра.
  const elementObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  scenes.forEach((scene) => sceneObserver.observe(scene));
  revealItems.forEach((item) => elementObserver.observe(item));
})();
