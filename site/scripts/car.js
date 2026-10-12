"use strict";

(() => {
  const revealItems = document.querySelectorAll("[data-car-reveal]");
  const pathMatch = window.location.pathname.match(/^\/autopark\/([^/]+)\/?$/);
  let pathSlug = null;
  if (pathMatch) {
    try { pathSlug = decodeURIComponent(pathMatch[1]); } catch { pathSlug = pathMatch[1]; }
  }
  const slug = pathSlug || new URLSearchParams(window.location.search).get("slug") || "gazelle-next-4-2";

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const attr = (value) => escapeHtml(value).replace(/`/g, "&#096;");

  const formatCapacity = (kg) => !kg ? "—" : kg >= 1000 ? `${String(kg / 1000).replace(".", ",")} т` : `${kg} кг`;
  const formatVolume = (v) => v == null ? "—" : `${String(v).replace(".", ",")} м³`;
  const formatMeters = (v) => v == null ? "—" : `${String(v).replace(".", ",")} м`;
  const categoryLabels = { van: "фургон", moving: "переезды", loaders: "грузчики", partner: "партнёрский транспорт" };

  function initReveal() {
    if (!revealItems.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    document.body.classList.add("has-car-motion");
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -5% 0px", threshold: 0.05 });
    revealItems.forEach((item) => observer.observe(item));
  }

  function initGallery() {
    const mainImage = document.querySelector("[data-car-main-image]");
    const galleryMain = document.querySelector("[data-car-gallery-main]");
    const counter = document.querySelector("[data-car-counter]");
    const previousButton = document.querySelector("[data-car-prev]");
    const nextButton = document.querySelector("[data-car-next]");
    const thumbs = [...document.querySelectorAll("[data-car-thumb]")];
    let currentIndex = Math.max(0, thumbs.findIndex((thumb) => thumb.classList.contains("is-active")));

    const normalize = (index) => thumbs.length ? ((index % thumbs.length) + thumbs.length) % thumbs.length : 0;
    const show = (index) => {
      if (!mainImage || !thumbs.length) return;
      currentIndex = normalize(index);
      const activeThumb = thumbs[currentIndex];
      thumbs.forEach((thumb, thumbIndex) => {
        const active = thumbIndex === currentIndex;
        thumb.classList.toggle("is-active", active);
        thumb.setAttribute("aria-pressed", String(active));
      });
      mainImage.classList.add("is-changing");
      window.setTimeout(() => {
        mainImage.src = activeThumb.dataset.src || mainImage.src;
        mainImage.alt = activeThumb.dataset.alt || "Фотография автомобиля";
        if (counter) counter.textContent = `${currentIndex + 1} / ${thumbs.length}`;
        mainImage.classList.remove("is-changing");
        activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }, 150);
    };

    thumbs.forEach((thumb, index) => thumb.addEventListener("click", () => show(index)));
    previousButton?.addEventListener("click", () => show(currentIndex - 1));
    nextButton?.addEventListener("click", () => show(currentIndex + 1));

    if (galleryMain) {
      let startX = null;
      let startY = null;
      galleryMain.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1 || thumbs.length <= 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
      }, { passive: true });
      galleryMain.addEventListener("touchend", (event) => {
        if (startX === null || startY === null || !window.matchMedia("(max-width: 760px)").matches) { startX = startY = null; return; }
        const deltaX = event.changedTouches[0].clientX - startX;
        const deltaY = event.changedTouches[0].clientY - startY;
        startX = startY = null;
        if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
        show(deltaX < 0 ? currentIndex + 1 : currentIndex - 1);
      }, { passive: true });
      galleryMain.setAttribute("tabindex", "0");
      galleryMain.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); show(currentIndex - 1); }
        if (event.key === "ArrowRight") { event.preventDefault(); show(currentIndex + 1); }
      });
    }
  }

  function buildGallery(vehicle) {
    const stage = document.querySelector(".car-gallery__main");
    const thumbsRoot = document.querySelector(".car-gallery__thumbs");
    if (!stage || !thumbsRoot) return;
    let images = Array.isArray(vehicle.images) ? vehicle.images.filter((item) => item.image) : [];
    if (!images.length && vehicle.previewImage) images = [{ image: vehicle.previewImage, alt: vehicle.name }];
    if (!images.length) return;

    const mainImage = stage.querySelector("[data-car-main-image]");
    const counter = stage.querySelector("[data-car-counter]");
    if (mainImage) {
      mainImage.src = images[0].image;
      mainImage.alt = images[0].alt || vehicle.name;
    }
    if (counter) counter.textContent = `1 / ${images.length}`;
    thumbsRoot.innerHTML = images.map((image, index) => `<button class="car-gallery__thumb${index === 0 ? " is-active" : ""}" type="button" data-car-thumb data-src="${attr(image.image)}" data-alt="${attr(image.alt || vehicle.name)}" aria-label="Показать фото ${index + 1}" aria-pressed="${index === 0 ? "true" : "false"}"><img src="${attr(image.image)}" alt="" loading="lazy" decoding="async" draggable="false" /></button>`).join("");
    document.querySelectorAll("[data-car-prev], [data-car-next]").forEach((button) => { button.hidden = images.length <= 1; });
  }

  function updateVehicle(vehicle) {
    document.title = `${vehicle.name} — Свои грузы | Автопарк`;
    const description = vehicle.shortDescription || vehicle.description || `${vehicle.name} для грузоперевозок по Абакану и Хакасии.`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    const currentCrumb = document.querySelector('.car-breadcrumbs [aria-current="page"]');
    if (currentCrumb) currentCrumb.textContent = vehicle.name;
    const title = document.querySelector('#car-title');
    if (title) title.textContent = vehicle.name;
    const eyebrow = document.querySelector('.car-card__eyebrow');
    if (eyebrow) eyebrow.textContent = vehicle.ownershipType === "PARTNER" ? "Автопарк / партнёрская машина" : "Автопарк / своя машина";
    const desc = document.querySelector('.car-card__description');
    if (desc) desc.textContent = description;

    const facts = document.querySelector('.car-facts');
    if (facts) facts.innerHTML = `<div class="car-facts__item"><dt>Грузоподъёмность</dt><dd>${escapeHtml(formatCapacity(vehicle.capacityKg))}</dd></div><div class="car-facts__item"><dt>Объём кузова</dt><dd>${escapeHtml(formatVolume(vehicle.volumeM3))}</dd></div><div class="car-facts__item"><dt>Тип кузова</dt><dd>${escapeHtml(vehicle.bodyType || "—")}</dd></div><div class="car-facts__item"><dt>Зона работы</dt><dd>${escapeHtml(vehicle.serviceArea || "—")}</dd></div>`;

    const primary = document.querySelector('.car-card__button--primary');
    if (primary) primary.href = `index.html?vehicle=${encodeURIComponent(vehicle.slug)}#calculator`;

    const specs = document.querySelector('.car-spec-table');
    if (specs) {
      const categories = String(vehicle.categories || "").split(",").map((item) => categoryLabels[item.trim()] || item.trim()).filter(Boolean).join(", ");
      specs.innerHTML = [
        ["Грузоподъёмность", formatCapacity(vehicle.capacityKg)],
        ["Объём кузова", formatVolume(vehicle.volumeM3)],
        ["Длина кузова", formatMeters(vehicle.bodyLengthM)],
        ["Ширина кузова", formatMeters(vehicle.bodyWidthM)],
        ["Высота кузова", formatMeters(vehicle.bodyHeightM)],
        ["Тип кузова", vehicle.bodyType || "—"],
        ["Погрузка", vehicle.loadingType || "—"],
        ["Подходит для", categories || "Разные задачи"]
      ].map(([label, value]) => `<div class="car-spec-table__row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    }

    const specsIntro = document.querySelector('.car-section-heading__text');
    if (specsIntro) specsIntro.textContent = vehicle.specsDescription || vehicle.description || vehicle.shortDescription || "—";
    const cargoDescription = document.querySelector('.car-cargo__description');
    if (cargoDescription) cargoDescription.textContent = vehicle.cargoDescription || vehicle.description || "—";
    const cargoList = document.querySelector('.car-cargo__list');
    if (cargoList) {
      const items = String(vehicle.cargoItems || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
      cargoList.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      cargoList.hidden = items.length === 0;
    }
    const cargoImage = document.querySelector('.car-cargo__visual img');
    if (cargoImage && vehicle.previewImage) { cargoImage.src = vehicle.previewImage; cargoImage.alt = `${vehicle.name} — Свои грузы`; }

    buildGallery(vehicle);
  }

  async function loadVehicle() {
    try {
      const response = await fetch(`/api/vehicles/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || !data.vehicle) throw new Error(data.message || "Машина не найдена");
      updateVehicle(data.vehicle);
    } catch (error) {
      console.warn("Vehicle API fallback:", error.message);
    } finally {
      initGallery();
      initReveal();
    }
  }

  loadVehicle();
})();
