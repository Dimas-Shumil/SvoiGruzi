const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

function intValue(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  host: String(process.env.HOST || "127.0.0.1").trim(),
  port: intValue(process.env.PORT, 3000, 1, 65535),
  databaseUrl: process.env.DATABASE_URL || "file:./dev.db",
  sessionSecret: process.env.SESSION_SECRET || "",
  sessionDays: intValue(process.env.SESSION_DAYS, 14, 1, 30),
  sessionIdleMinutes: intValue(process.env.SESSION_IDLE_MINUTES, 15, 5, 120),
  appOrigin: parseOrigin(process.env.APP_ORIGIN),
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
  backupRetentionDays: intValue(process.env.BACKUP_RETENTION_DAYS, 30, 1, 365),

  vapidPublicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
  vapidPrivateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim(),
  vapidSubject: String(process.env.VAPID_SUBJECT || "").trim(),

  isProduction: process.env.NODE_ENV === "production"
});

function validateEnv() {
  if (env.sessionSecret.length < 64 || env.sessionSecret.includes("replace-with")) {
    throw new Error("SESSION_SECRET должен быть случайным секретом длиной минимум 64 символа");
  }

  if (!["127.0.0.1", "::1", "localhost"].includes(env.host)) {
    throw new Error("HOST должен быть loopback-адресом (127.0.0.1/::1), чтобы Node.js не был открыт в интернет");
  }

  if (env.isProduction) {
    if (!env.appOrigin) {
      throw new Error("В production необходимо указать корректный APP_ORIGIN");
    }
    if (!env.appOrigin.startsWith("https://")) {
      throw new Error("В production APP_ORIGIN должен использовать HTTPS");
    }
    if (env.trustProxy !== 1) {
      throw new Error("В production за Nginx установите TRUST_PROXY=1");
    }
  }

  const pushValues = [env.vapidPublicKey, env.vapidPrivateKey, env.vapidSubject];
  const configuredCount = pushValues.filter(Boolean).length;
  if (configuredCount > 0 && configuredCount < pushValues.length) {
    throw new Error("Web Push настроен частично: заполните все VAPID_* переменные");
  }
  if (configuredCount === pushValues.length) {
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(env.vapidPublicKey) ||
        !/^[A-Za-z0-9_-]{35,80}$/.test(env.vapidPrivateKey) ||
        !/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(env.vapidSubject)) {
      throw new Error("Некорректные VAPID-ключи или VAPID_SUBJECT");
    }
  }
}

module.exports = { env, validateEnv };
