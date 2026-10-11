const crypto = require("crypto");
const argon2 = require("argon2");
const { env } = require("../config/env");

const SESSION_COOKIE = env.isProduction ? "__Host-sg_session" : "sg_session";
const MIN_PASSWORD_LENGTH = 12;

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

async function verifyPassword(password, hash) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function csrfTokenForSession(token) {
  return crypto.createHmac("sha256", env.sessionSecret).update(token).digest("hex");
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "strict",
    path: "/",
    expires: expiresAt
  };
}

function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "strict",
    path: "/"
  };
}

function validPassword(value) {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH && value.length <= 128;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    lastLoginAt: user.lastLoginAt
  };
}

module.exports = {
  SESSION_COOKIE,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  csrfTokenForSession,
  safeEqual,
  cookieOptions,
  clearCookieOptions,
  validPassword,
  normalizeEmail,
  validEmail,
  publicUser
};
