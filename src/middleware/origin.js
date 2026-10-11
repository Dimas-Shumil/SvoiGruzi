const { env } = require("../config/env");
const { HttpError } = require("../lib/http-error");

function requestOrigin(req) {
  const origin = req.get("origin");
  if (origin) return origin;
  const referer = req.get("referer");
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
}

function verifyOrigin(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = requestOrigin(req);
  if (!origin) return next(new HttpError(403, "Origin отсутствует", "ORIGIN_REJECTED"));

  const allowed = new Set([env.appOrigin].filter(Boolean));
  if (!env.isProduction) {
    allowed.add(`http://localhost:${env.port}`);
    allowed.add(`http://127.0.0.1:${env.port}`);
  }
  if (!allowed.has(origin)) {
    return next(new HttpError(403, "Origin отклонён", "ORIGIN_REJECTED"));
  }
  next();
}

module.exports = { verifyOrigin };
