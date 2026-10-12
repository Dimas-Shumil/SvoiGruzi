"use strict";

(() => {
  const body = document.body;
  const filterButtons = [...document.querySelectorAll("[data-fleet-filter]")];
  const list = document.querySelector("[data-fleet-list]");
  let currentFilter = "all";
  let observer = null;

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const attr = (value) => escapeHtml(value).replace(/`/g, "&#096;");

  const formatCapacity = (kg) => {
    if (!kg) return "—";
    return kg >= 1000 ? `${String(kg / 1000).replace(".", ",")} т` : `${kg} кг`;
  };
  const formatVolume = (value) => value == null ? "—" : `${String(value).replace(".", ",")} м³`;
  const formatLength = (value) => value == null ? "—" : `${String(value).replace(".", ",")} м`;

  function observeRevealItems(scope = document) {
    const items = scope.querySelectorAll("[data-fleet-reveal]:not(.is-visible)");
    if (!items.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    body.classList.add("has-fleet-motion");
    if (!observer) {
      observer = new IntersectionObserver((entries, currentObserver) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
    }
    items.forEach((item) => observer.observe(item));
  }

  function applyFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll("[data-fleet-card]").forEach((card) => {
      const categories = (card.dataset.category || "").split(/\s+/).filter(Boolean);
      card.classList.toggle("is-filtered-out", filter !== "all" && !categories.includes(filter));
    });
  }

  function vehicleCard(vehicle) {
    const rawCategories = String(vehicle.categories || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const categories = new Set(rawCategories.map((item) => item.toLowerCase()));
    const bodyType = String(vehicle.bodyType || "").trim().toLowerCase();

    // Фильтры каталога должны работать от данных, которые владелец реально
    // заполняет в админке, а не требовать скрытых служебных значений.
    if (bodyType.includes("фургон") || categories.has("фургон") || categories.has("фургоны") || categories.has("van")) {
      categories.add("van");
    }
    if (categories.has("переезд") || categories.has("переезды") || categories.has("moving")) {
      categories.add("moving");
    }
    if (categories.has("грузчики") || categories.has("с грузчиками") || categories.has("loaders")) {
      categories.add("loaders");
    }
    if (vehicle.ownershipType === "PARTNER") categories.add("partner");

    const typeLabel = vehicle.ownershipType === "PARTNER"
      ? `Партнёрский транспорт${vehicle.bodyType ? ` · ${vehicle.bodyType}` : ""}`
      : vehicle.bodyType || "Грузовой автомобиль";
    const image = vehicle.previewImage || "/site/img/fleet-next.webp";
    const availability = vehicle.status === "AVAILABLE" ? "Доступна" : vehicle.status === "BUSY" ? "Занята" : "По запросу";

    return `<article class="fleet-card" data-fleet-card data-category="${attr([...categories].join(" "))}" data-fleet-reveal>
      <div class="fleet-card__media"><img src="${attr(image)}" alt="${attr(`${vehicle.name} — Свои грузы`)}" loading="lazy" decoding="async" /></div>
      <div class="fleet-card__body">
        <div><p class="fleet-card__type">${escapeHtml(typeLabel)}</p><h3 class="fleet-card__title">${escapeHtml(vehicle.name)}</h3><p class="fleet-card__description">${escapeHtml(vehicle.shortDescription || "Подберём машину под вашу задачу и маршрут.")}</p></div>
        <dl class="fleet-card__specs">
          <div><dt>Грузоподъёмность</dt><dd>${escapeHtml(formatCapacity(vehicle.capacityKg))}</dd></div>
          <div><dt>Объём кузова</dt><dd>${escapeHtml(formatVolume(vehicle.volumeM3))}</dd></div>
          <div><dt>Длина кузова</dt><dd>${escapeHtml(formatLength(vehicle.bodyLengthM))}</dd></div>
          <div><dt>Доступность</dt><dd>${escapeHtml(availability)}</dd></div>
        </dl>
        <a class="fleet-card__button" href="/autopark/${encodeURIComponent(vehicle.slug)}">Подробнее о машине</a>
      </div>
    </article>`;
  }

  async function loadFleet() {
    if (!list) return;
    try {
      const response = await fetch("/api/vehicles", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.vehicles)) throw new Error("Не удалось загрузить автопарк");
      list.innerHTML = data.vehicles.length
        ? data.vehicles.map(vehicleCard).join("")
        : '<p class="fleet-catalog__intro">Сейчас машины временно скрыты. Оставьте заявку — подберём транспорт вручную.</p>';
      observeRevealItems(list);
      applyFilter(currentFilter);
    } catch (error) {
      console.warn("Fleet API fallback:", error.message);
      observeRevealItems(document);
    }
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

  observeRevealItems(document);
  loadFleet();
})();
