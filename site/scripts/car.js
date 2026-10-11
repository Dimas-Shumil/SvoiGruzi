"use strict";

(() => {
  const mainImage = document.querySelector("[data-car-main-image]");
  const galleryMain = document.querySelector("[data-car-gallery-main]");
  const counter = document.querySelector("[data-car-counter]");
  const previousButton = document.querySelector("[data-car-prev]");
  const nextButton = document.querySelector("[data-car-next]");
  const thumbs = [...document.querySelectorAll("[data-car-thumb]")];
  const revealItems = document.querySelectorAll("[data-car-reveal]");

  let currentGalleryIndex = Math.max(
    0,
    thumbs.findIndex((thumb) => thumb.classList.contains("is-active")),
  );

  const normalizeGalleryIndex = (index) => {
    if (!thumbs.length) return 0;
    return ((index % thumbs.length) + thumbs.length) % thumbs.length;
  };

  const showGalleryImage = (index) => {
    if (!mainImage || !thumbs.length) return;

    currentGalleryIndex = normalizeGalleryIndex(index);
    const activeThumb = thumbs[currentGalleryIndex];

    thumbs.forEach((thumb, thumbIndex) => {
      const active = thumbIndex === currentGalleryIndex;
      thumb.classList.toggle("is-active", active);
      thumb.setAttribute("aria-pressed", String(active));
    });

    mainImage.classList.add("is-changing");

    window.setTimeout(() => {
      mainImage.src = activeThumb.dataset.src || mainImage.src;
      mainImage.alt = activeThumb.dataset.alt || "Фотография автомобиля";

      if (counter) {
        counter.textContent = `${currentGalleryIndex + 1} / ${thumbs.length}`;
      }

      mainImage.classList.remove("is-changing");

      activeThumb.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }, 150);
  };

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener("click", () => {
      showGalleryImage(index);
    });
  });

  previousButton?.addEventListener("click", () => {
    showGalleryImage(currentGalleryIndex - 1);
  });

  nextButton?.addEventListener("click", () => {
    showGalleryImage(currentGalleryIndex + 1);
  });

  // На телефоне — поведение как в AutoZavoz:
  // горизонтальный свайп листает фото, вертикальный скролл страницы не ломаем.
  if (galleryMain) {
    let swipeStartX = null;
    let swipeStartY = null;

    galleryMain.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1 || thumbs.length <= 1) return;

        const touch = event.touches[0];
        swipeStartX = touch.clientX;
        swipeStartY = touch.clientY;
      },
      { passive: true },
    );

    galleryMain.addEventListener(
      "touchend",
      (event) => {
        if (
          swipeStartX === null ||
          swipeStartY === null ||
          !window.matchMedia("(max-width: 760px)").matches
        ) {
          swipeStartX = null;
          swipeStartY = null;
          return;
        }

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - swipeStartX;
        const deltaY = touch.clientY - swipeStartY;

        swipeStartX = null;
        swipeStartY = null;

        const minimumSwipeDistance = 45;

        if (
          Math.abs(deltaX) < minimumSwipeDistance ||
          Math.abs(deltaX) <= Math.abs(deltaY)
        ) {
          return;
        }

        if (deltaX < 0) {
          showGalleryImage(currentGalleryIndex + 1);
          return;
        }

        showGalleryImage(currentGalleryIndex - 1);
      },
      { passive: true },
    );

    // На десктопе дополнительно поддерживаем клавиши,
    // когда пользователь навёлся/сфокусировался на галерее.
    galleryMain.setAttribute("tabindex", "0");

    galleryMain.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showGalleryImage(currentGalleryIndex - 1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showGalleryImage(currentGalleryIndex + 1);
      }
    });
  }

  if (
    revealItems.length &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    "IntersectionObserver" in window
  ) {
    document.body.classList.add("has-car-motion");

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -5% 0px", threshold: 0.05 },
    );

    revealItems.forEach((item) => observer.observe(item));
  }
})();
