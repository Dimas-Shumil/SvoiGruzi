(() => {
  'use strict';
  const KEY = 'svoi-pwa-v1';
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const mode = matchMedia('(display-mode: standalone)');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = value => { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch {} };
  let promptEvent, banner;
  const installed = () => mode.matches || navigator.standalone === true || read().installed;
  const hide = () => { banner?.remove(); banner = null; };
  const markInstalled = () => { save({installed: true}); hide(); };
  const later = () => { save({laterUntil: Date.now() + TWO_DAYS}); hide(); };
  const show = () => {
    if (!document.body || banner || installed() || Number(read().laterUntil) > Date.now()) return;
    banner = document.createElement('aside');
    banner.className = 'pwa-banner';
    banner.setAttribute('aria-label', 'Установка приложения');
    banner.innerHTML = '<img class="pwa-banner__icon" src="/site/img/push-icon-192.png" width="48" height="48" alt=""><div class="pwa-banner__copy"><strong>Свои перевозки — всегда под рукой</strong><p>Установите приложение на телефон</p></div><div class="pwa-banner__actions"><button class="pwa-banner__install" type="button">Установить</button><button class="pwa-banner__later" type="button">Позже</button></div>';
    document.body.append(banner);
    banner.querySelector('.pwa-banner__later').addEventListener('click', later);
    banner.querySelector('.pwa-banner__install').addEventListener('click', async () => {
      if (!promptEvent) {
        banner.querySelector('p').textContent = ios
          ? 'Откройте меню «Поделиться» → «На экран Домой» → «Добавить». Если пункта нет, откройте сайт в Safari.'
          : 'В меню браузера выберите «Установить приложение» или «Добавить на главный экран». Если пункта нет, откройте сайт в Chrome.';
        return;
      }
      const current = promptEvent;
      promptEvent = null;
      try {
        await current.prompt();
        const choice = await current.userChoice;
        if (choice.outcome === 'accepted') markInstalled(); else later();
      } catch { show(); }
    });
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event;
    // A fresh install event also handles a previously uninstalled app.
    const state = read(); delete state.installed; save(state); show();
  });
  window.addEventListener('appinstalled', markInstalled);
  mode.addEventListener('change', () => { if (mode.matches) markInstalled(); });
  window.addEventListener('storage', event => { if (event.key === KEY && (installed() || Number(read().laterUntil) > Date.now())) hide(); });
  const init = () => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    if (mode.matches || navigator.standalone === true) markInstalled();
    navigator.serviceWorker.register('/pwa-sw.js', {scope: '/', updateViaCache: 'none'}).catch(console.error);
    show();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true}); else init();
})();
