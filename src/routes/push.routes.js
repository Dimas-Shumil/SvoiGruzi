"use strict";

const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { env } = require("../config/env");
const { pushConfigured, sendTestNotification } = require("../services/push.service");

const router = express.Router();

function validEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 2500) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
    const hostname = url.hostname.toLowerCase();
    // Don't let authenticated clients turn push delivery into an SSRF request.
    return hostname === "fcm.googleapis.com" ||
      hostname === "updates.push.services.mozilla.com" ||
      hostname === "web.push.apple.com" ||
      hostname === "api.push.apple.com" ||
      hostname === "push.services.mozilla.com" ||
      /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/.test(hostname);
  } catch { return false; }
}

function subscriptionFrom(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !validEndpoint(body.endpoint)) {
    throw new HttpError(400, "Некорректный Push endpoint", "VALIDATION_ERROR");
  }
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{40,400}$/.test(p256dh) ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{8,200}$/.test(auth)) {
    throw new HttpError(400, "Некорректные ключи подписки", "VALIDATION_ERROR");
  }
  return { endpoint: body.endpoint, p256dh, auth };
}

router.get("/status", asyncRoute(async (req, res) => {
  const subscriptions = await prisma.pushSubscription.count({ where: { userId: req.user.id } });
  res.json({ success: true, configured: pushConfigured(),
    publicKey: pushConfigured() ? env.vapidPublicKey : null, subscriptions });
}));

router.post("/subscribe", asyncRoute(async (req, res) => {
  if (!pushConfigured()) throw new HttpError(503, "Web Push не настроен на сервере", "PUSH_NOT_CONFIGURED");
  const sub = subscriptionFrom(req.body);
  // Avoid unlimited subscriptions for a user (including different browser installations).
  const count = await prisma.pushSubscription.count({ where: { userId: req.user.id } });
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint }, select: { id: true, userId: true } });
  if (existing && existing.userId !== req.user.id) {
    throw new HttpError(409, "Подписка уже используется другим аккаунтом", "PUSH_CONFLICT");
  }
  if (!existing && count >= 15) throw new HttpError(409, "Превышен лимит устройств (15)", "PUSH_LIMIT");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: req.user.id, ...sub, userAgent: String(req.get("user-agent") || "").slice(0, 300) },
    update: { ...sub, userAgent: String(req.get("user-agent") || "").slice(0, 300) },
  });
  res.status(201).json({ success: true });
}));

router.delete("/subscribe", asyncRoute(async (req, res) => {
  if (!validEndpoint(req.body?.endpoint)) throw new HttpError(400, "Некорректный endpoint", "VALIDATION_ERROR");
  await prisma.pushSubscription.deleteMany({ where: { userId: req.user.id, endpoint: req.body.endpoint } });
  res.json({ success: true });
}));

router.post("/test", asyncRoute(async (req, res) => {
  if (!pushConfigured()) throw new HttpError(503, "Web Push не настроен на сервере", "PUSH_NOT_CONFIGURED");
  const result = await sendTestNotification(req.user.id);
  if (!result.sent) throw new HttpError(409, "Нет активных Push-подписок или отправка не удалась", "PUSH_NOT_DELIVERED");
  res.json({ success: true, sent: result.sent });
}));

module.exports = router;
