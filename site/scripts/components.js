"use strict";

// Единый загрузчик HTML-компонентов.
// Разметка: /components/header.html и /components/footer.html
// Стили: site/sass/header.fixed.scss и site/sass/footer.scss
(() => {
  const componentsDir = new URL("../../components/", document.currentScript.src);
  const templates = new Map();

  function loadHTML(filename) {
    if (!templates.has(filename)) {
      const request = fetch(new URL(filename, componentsDir)).then((response) => {
        if (!response.ok) {
          throw new Error(`${filename}: HTTP ${response.status}`);
        }
        return response.text();
      }).catch((error) => {
        // После ошибки разрешаем повторную попытку загрузки.
        templates.delete(filename);
        throw error;
      });
      templates.set(filename, request);
    }
    return templates.get(filename);
  }

  // Hash-ссылки общих компонентов относятся к секциям главной.
  // На внутренних страницах #contacts остаётся локальным для футера,
  // остальные якоря общего компонента ведём обратно на index.html.
  function normalizeLinks(component) {
    const isAbout = document.body.classList.contains("page-about");
    const isAutopark = document.body.classList.contains("page-autopark");
    const isCar = document.body.classList.contains("page-car");
    if (!isAbout && !isAutopark && !isCar) return;

    component.querySelectorAll('a[href^="#"]').forEach((link) => {
      const hash = link.getAttribute("href");
      if (hash === "#contacts") return;

      if (link.classList.contains("site-footer__to-top")) {
        if (isAbout) link.setAttribute("href", "#about");
        else if (isCar) link.setAttribute("href", "#car");
        else link.setAttribute("href", "#autopark");
        return;
      }

      link.setAttribute("href", `index.html${hash}`);
    });

    if (isAbout) {
      component.querySelectorAll('a[href="about.html"]').forEach((link) => {
        link.setAttribute("aria-current", "page");
      });
    }

    if (isAutopark || isCar) {
      component.querySelectorAll('a[href="autopark.html"]').forEach((link) => {
        link.setAttribute("aria-current", "page");
      });
    }
  }

  class HTMLComponent extends HTMLElement {
    async load(filename, initialize) {
      if (this._loading || this._loaded) return;
      this._loading = true;
      try {
        const html = await loadHTML(filename);
        if (!this.isConnected) return;
        this.innerHTML = html;
        normalizeLinks(this);
        this._loaded = true;
        this._cleanup = initialize?.(this);
      } catch (error) {
        console.error(`Не удалось подключить components/${filename}`, error);
      } finally {
        this._loading = false;
      }
    }

    disconnectedCallback() {
      this._cleanup?.();
      this._cleanup = null;
    }
  }

  function initHeader(component) {
    const header = component.querySelector("[data-site-header]");
    const burger = component.querySelector(".site-header__burger");
    const mobileNav = component.querySelector(".site-header__mobile");
    if (!header || !burger || !mobileNav) return;

    const desktop = window.matchMedia("(min-width: 1101px)");
    let prevY = Math.max(0, window.scrollY);
    let accumulated = 0;
    let direction = 0;
    let scrollScheduled = false;
    let menuOpen = false;
    let keepVisibleUntil = 0;

    function updateHeader() {
      scrollScheduled = false;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - prevY;
      prevY = currentY;
      header.classList.toggle("is-scrolled", currentY > 24);

      if (currentY < 105 || menuOpen || Date.now() < keepVisibleUntil) {
        header.classList.remove("is-hidden");
        accumulated = 0;
        direction = 0;
        return;
      }
      if (Math.abs(delta) < 1) return;

      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) accumulated = 0;
      direction = nextDirection;
      accumulated += delta;

      if (accumulated >= 25) {
        header.classList.add("is-hidden");
        accumulated = 0;
      } else if (accumulated <= -14) {
        header.classList.remove("is-hidden");
        accumulated = 0;
      }
    }

    function onScroll() {
      if (scrollScheduled) return;
      scrollScheduled = true;
      window.requestAnimationFrame(updateHeader);
    }

    function toggleMenu(open, returnFocus = false) {
      if (menuOpen === open) return;
      menuOpen = open;
      header.classList.toggle("is-menu-open", open);
      header.classList.remove("is-hidden");
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
      mobileNav.setAttribute("aria-hidden", String(!open));
      mobileNav.inert = !open;
      document.body.classList.toggle("is-menu-open", open);

      if (open) {
        mobileNav.querySelector("a[href]")?.focus({ preventScroll: true });
      } else {
        keepVisibleUntil = Date.now() + 800;
        if (returnFocus) burger.focus({ preventScroll: true });
      }
    }

    function onBurgerClick() {
      toggleMenu(!menuOpen);
    }

    function onMobileClick(event) {
      if (event.target.closest("a[href]")) toggleMenu(false);
    }

    function onKeyDown(event) {
      if (!menuOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        toggleMenu(false, true);
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = [burger, ...mobileNav.querySelectorAll("a[href]")];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onBreakpointChange() {
      if (desktop.matches) toggleMenu(false);
    }

    burger.addEventListener("click", onBurgerClick);
    mobileNav.addEventListener("click", onMobileClick);
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpointChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    updateHeader();

    return () => {
      toggleMenu(false);
      burger.removeEventListener("click", onBurgerClick);
      mobileNav.removeEventListener("click", onMobileClick);
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpointChange);
      window.removeEventListener("scroll", onScroll);
    };
  }

  function initFooter(component) {
    const year = component.querySelector("[data-footer-year]");
    if (year) year.textContent = new Date().getFullYear();

    const actions = component.querySelector("[data-mobile-contact-actions]");
    const callLink = component.querySelector("[data-mobile-call-link]");
    const footer = component.querySelector(".site-footer");
    const firstScene = document.querySelector("main > section:first-of-type");
    if (!actions || !footer || !firstScene) return;

    // Номер берётся из data-phone в components/footer.html.
    const phone = String(actions.dataset.phone || "").trim();
    if (callLink && phone) {
      callLink.href = `tel:${phone.replace(/[^+\d]/g, "")}`;
      callLink.setAttribute("aria-label", "Позвонить");
    }

    const mobile = window.matchMedia("(max-width: 767px)");
    let frame = 0;

    function updateMobileActions() {
      frame = 0;

      if (!mobile.matches) {
        actions.classList.remove("is-visible");
        actions.setAttribute("aria-hidden", "true");
        actions.inert = true;
        return;
      }

      const heroBottom = firstScene.getBoundingClientRect().bottom;
      const footerTop = footer.getBoundingClientRect().top;

      // Показываем после выхода с первого экрана.
      // Скрываем чуть раньше, чем футер начнёт занимать экран.
      const heroPassed = heroBottom <= 82;
      const footerStarted = footerTop <= window.innerHeight - 18;
      const visible = heroPassed && !footerStarted;

      actions.classList.toggle("is-visible", visible);
      actions.setAttribute("aria-hidden", String(!visible));
      actions.inert = !visible;
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateMobileActions);
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    mobile.addEventListener("change", scheduleUpdate);
    updateMobileActions();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      mobile.removeEventListener("change", scheduleUpdate);
    };
  }

  class SiteHeader extends HTMLComponent {
    connectedCallback() {
      if (this._loaded) {
        if (!this._cleanup) this._cleanup = initHeader(this);
        return;
      }
      this.load("header.html", initHeader);
    }
  }

  class SiteFooter extends HTMLComponent {
    connectedCallback() {
      this.load("footer.html", initFooter);
    }
  }

  if (!customElements.get("site-header")) customElements.define("site-header", SiteHeader);
  if (!customElements.get("site-footer")) customElements.define("site-footer", SiteFooter);
})();
