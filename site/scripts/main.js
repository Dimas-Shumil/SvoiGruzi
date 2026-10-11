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


// ------------------------------------------------------------
// Публичная заявка: форма главной → POST /api/requests.
// ------------------------------------------------------------
(() => {
  const form = document.querySelector("[data-estimate-form]");
  if (!form) return;

  const submitButton = form.querySelector("[data-estimate-submit]");
  const statusBox = form.querySelector("[data-estimate-status]");
  const vehicleInput = form.querySelector("[data-estimate-vehicle]");
  const dateInput = form.querySelector('input[name="date"]');

  const query = new URLSearchParams(window.location.search);
  const selectedVehicle = query.get("vehicle");

  if (vehicleInput && selectedVehicle) {
    vehicleInput.value = selectedVehicle.slice(0, 120);
  }

  if (dateInput) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    dateInput.min = `${year}-${month}-${day}`;
  }

  const setStatus = (message, type = "") => {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.classList.toggle("is-success", type === "success");
    statusBox.classList.toggle("is-error", type === "error");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Отправляем...";
    }

    setStatus("");

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Не удалось отправить заявку");
      }

      const preservedVehicle = vehicleInput?.value || "";
      form.reset();

      if (vehicleInput) vehicleInput.value = preservedVehicle;

      setStatus(
        data.message || "Заявка принята. Свяжемся с вами в ближайшее время.",
        "success"
      );
    } catch (error) {
      console.error("estimate request error:", error);
      setStatus(
        error.message || "Не удалось отправить заявку. Попробуйте ещё раз.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Рассчитать стоимость";
      }
    }
  });
})();
