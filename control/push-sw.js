"use strict";
// Only handles CRM notifications; intentionally no fetch/cache interception.
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* ignore malformed payload */ }
  const path = String(payload.url || "");
  const safePath = /^\/control\/app\.html(?:\?openOrder=\d+)?#\/requests(?:\?order=\d+)?$/.test(path)
    ? path : "/control/app.html#/requests";
  event.waitUntil(self.registration.showNotification(String(payload.title || "СВОИ ГРУЗЫ").slice(0, 120), {
    body: String(payload.body || "Новая заявка").slice(0, 240),
    icon: "/site/img/push-icon-192.png",
    badge: "/site/img/push-icon-192.png",
    tag: String(payload.tag || "sg-order").slice(0, 80),
    renotify: true,
    data: { url: safePath },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = String(event.notification.data?.url || "");
  const safePath = /^\/control\/app\.html(?:\?openOrder=\d+)?#\/requests(?:\?order=\d+)?$/.test(path)
    ? path : "/control/app.html#/requests";
  const target = new URL(safePath, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((win) => {
      try { return new URL(win.url).origin === self.location.origin && new URL(win.url).pathname.startsWith("/control/"); }
      catch { return false; }
    });
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  })());
});
