const { rateLimit } = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, code: "RATE_LIMIT", message: "Слишком много попыток. Попробуйте позже." }
});

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, code: "RATE_LIMIT", message: "Слишком много заявок. Попробуйте позже." }
});

module.exports = { apiLimiter, loginLimiter, requestLimiter };
