"use strict";

const webpush = require("web-push");
const prisma = require("../lib/prisma");
const { env } = require("../config/env");

const configured = Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);
if (configured) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

function pushConfigured() { return configured; }

// A fixed service-worker origin and a hash route: no external redirect in notification click.
function makePayload({ title, body, id, test = false }) {
  return JSON.stringify({
    title, body,
    url: test ? "/control/app.html#/requests" : `/control/app.html?openOrder=${id}#/requests?order=${id}`,
    tag: test ? `sg-push-test-${Date.now()}` : `sg-order-${id}`,
  });
}

async function deliver(subscriptions, payload, ttl = 3600) {
  if (!configured || !subscriptions.length) return { sent: 0, total: subscriptions.length };
  const results = await Promise.allSettled(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: ttl, timeout: 7000 },
      );
      return 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error("Web Push СВОИ ГРУЗЫ:", String(error.message || error).slice(0, 240));
      }
      return 0;
    }
  }));
  return {
    sent: results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value : 0), 0),
    total: subscriptions.length,
  };
}

async function sendNewOrderNotification(order) {
  if (!configured) return { sent: 0, disabled: true };
  const subs = await prisma.pushSubscription.findMany({
    where: { user: { isActive: true, role: "OWNER" } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const cargo = String(order.cargoType || "Грузоперевозка").slice(0, 70);
  // No phone or route/address in system lock-screen notifications.
  return deliver(subs, makePayload({
    title: `СВОИ ГРУЗЫ · Новая заявка №${order.id}`,
    body: `${cargo}. Откройте заявку в панели управления.`,
    id: order.id,
  }));
}

async function sendTestNotification(userId) {
  if (!configured) return { sent: 0, disabled: true };
  const subs = await prisma.pushSubscription.findMany({
    where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  return deliver(subs, makePayload({
    title: "СВОИ ГРУЗЫ · Проверка Web Push",
    body: "Уведомления настроены. Новые заявки будут появляться здесь.",
    test: true,
  }), 300);
}

module.exports = { pushConfigured, sendNewOrderNotification, sendTestNotification };
