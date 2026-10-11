const prisma = require("../lib/prisma");
const {
  SESSION_COOKIE,
  hashToken,
  csrfTokenForSession,
  safeEqual,
  clearCookieOptions
} = require("../lib/security");
const { HttpError } = require("../lib/http-error");

async function loadSession(req, res, next) {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (!rawToken) return next();

  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true }
    });

    if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
      res.clearCookie(SESSION_COOKIE, clearCookieOptions());
      return next();
    }

    req.user = session.user;
    req.sessionRecord = session;
    req.sessionToken = rawToken;

    const age = Date.now() - session.lastSeenAt.getTime();
    if (age > 15 * 60 * 1000) {
      prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() }
      }).catch(() => {});
    }
  } catch (error) {
    console.error("session load error:", error.message);
  }

  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Требуется авторизация", "AUTH_REQUIRED"));
  next();
}

function requireOwner(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Требуется авторизация", "AUTH_REQUIRED"));
  if (req.user.role !== "OWNER") return next(new HttpError(403, "Недостаточно прав", "FORBIDDEN"));
  next();
}

function requireCsrf(req, _res, next) {
  if (!req.sessionToken) return next(new HttpError(403, "CSRF token invalid", "CSRF_INVALID"));
  const expected = csrfTokenForSession(req.sessionToken);
  const provided = req.get("x-csrf-token");
  if (!safeEqual(expected, provided)) {
    return next(new HttpError(403, "CSRF token invalid", "CSRF_INVALID"));
  }
  next();
}

module.exports = { loadSession, requireAuth, requireOwner, requireCsrf };
