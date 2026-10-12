const express = require('express');
const prisma = require('../lib/prisma');
const { asyncRoute } = require('../lib/async-route');
const { HttpError } = require('../lib/http-error');
const { env } = require('../config/env');
const { loginLimiter } = require('../middleware/rate-limits');
const { requireAuth, requireCsrf } = require('../middleware/auth');
const {
  SESSION_COOKIE,
  verifyPassword,
  generateSessionToken,
  hashToken,
  csrfTokenForSession,
  cookieOptions,
  clearCookieOptions,
  normalizeEmail,
  publicUser,
} = require('../lib/security');

const router = express.Router();

router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = Boolean(user?.isActive) && await verifyPassword(password, user.passwordHash);

  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    throw new HttpError(401, 'Неверный email или пароль', 'LOGIN_FAILED');
  }

  const rawToken = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.sessionDays * 86400000);
  await prisma.$transaction([
    prisma.session.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId: user.id,
        expiresAt,
        lastSeenAt: now,
        ipAddress: String(req.ip || '').slice(0, 80) || null,
        userAgent: String(req.get('user-agent') || '').slice(0, 400) || null,
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  res.cookie(SESSION_COOKIE, rawToken, cookieOptions(expiresAt));
  res.json({ success: true, user: publicUser(user), csrfToken: csrfTokenForSession(rawToken), idleMinutes: env.sessionIdleMinutes });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: publicUser(req.user), csrfToken: csrfTokenForSession(req.sessionToken), idleMinutes: env.sessionIdleMinutes });
});

router.post('/logout', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  await prisma.session.delete({ where: { id: req.sessionRecord.id } }).catch(() => {});
  res.clearCookie(SESSION_COOKIE, clearCookieOptions());
  res.json({ success: true });
}));

module.exports = router;
