const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const prisma = require("./src/lib/prisma");
const { sitemap, vehicleHtml } = require("./src/services/seo.service");
const { asyncRoute } = require("./src/lib/async-route");
const { env, validateEnv } = require("./src/config/env");
const { loadSession } = require("./src/middleware/auth");
const { verifyOrigin } = require("./src/middleware/origin");
const { apiLimiter, requestLimiter } = require("./src/middleware/rate-limits");
const { notFound, errorHandler } = require("./src/middleware/error-handler");

const controlRoutes = require("./src/routes/control.routes");
const publicOrdersRoutes = require("./src/routes/public-orders.routes");
const publicVehiclesRoutes = require("./src/routes/vehicles.public.routes");

validateEnv();

const app = express();
const root = __dirname;

app.disable("x-powered-by");
app.set("trust proxy", env.trustProxy);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  strictTransportSecurity: env.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false
}));

app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
});

app.use(express.json({ limit: "64kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 50 }));
app.use(cookieParser());
app.use(loadSession);

const publicCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'"
].join("; ");

const controlCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'"
].join("; ");

app.use((req, res, next) => {
  if (!req.path.startsWith("/control") && !req.path.startsWith("/api/")) {
    res.setHeader("Content-Security-Policy", publicCsp);
  }
  next();
});

app.use("/api", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

// Публичный API.
app.use("/api/requests", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, verifyOrigin, requestLimiter, publicOrdersRoutes);
app.use("/api/vehicles", apiLimiter, publicVehiclesRoutes);

// Закрытая CRM API.
app.use("/api/control", (req, res, next) => {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
  next();
}, verifyOrigin, apiLimiter, controlRoutes);

const publicStatic = {
  dotfiles: "deny",
  index: false,
  maxAge: env.isProduction ? "1h" : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  }
};

// Раздаём только необходимые публичные каталоги, а не весь /site целиком.
app.use("/site/css", express.static(path.join(root, "site", "css"), publicStatic));
app.use("/site/img", express.static(path.join(root, "site", "img"), publicStatic));
app.use("/site/scripts", express.static(path.join(root, "site", "scripts"), publicStatic));
app.use("/components", express.static(path.join(root, "components"), publicStatic));
app.get("/site/privacy-policy.html", (_req, res) => res.sendFile(path.join(root, "site", "privacy-policy.html")));
app.get("/site/offer.html", (_req, res) => res.sendFile(path.join(root, "site", "offer.html")));

const vehicleSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Published vehicles have their own SEO URL and server-rendered HTML.
app.get('/autopark/:slug', asyncRoute(async (req, res, next) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!vehicleSlugPattern.test(slug)) return next();
  const vehicle = await prisma.vehicle.findUnique({ where: { slug }, select: {
    name: true, slug: true, published: true, shortDescription: true, description: true,
    previewImage: true, capacityKg: true, volumeM3: true, bodyType: true, serviceArea: true
  }});
  if (!vehicle?.published) return res.status(404).send('Машина не найдена');
  res.set('Cache-Control', 'public, max-age=60');
  res.type('html').send(vehicleHtml(vehicle));
}));

app.get('/car.html', (req, res) => {
  const legacySlug = String(req.query.slug || '').trim().toLowerCase();
  if (legacySlug && vehicleSlugPattern.test(legacySlug)) {
    return res.redirect(301, `/autopark/${encodeURIComponent(legacySlug)}`);
  }
  return res.redirect(301, '/autopark.html');
});

app.get('/index.html', (_req, res) => res.redirect(301, '/'));
app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
for (const file of ['about.html', 'autopark.html']) {
  app.get(`/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
}

app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(root, 'favicon.ico')));
app.get('/robots.txt', (_req, res) => res.sendFile(path.join(root, 'robots.txt')));
app.get('/sitemap.xml', asyncRoute(async (_req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { published: true }, select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' }
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/xml').send(sitemap(vehicles));
}));

// Control: HTML приложения нельзя получить без действующей сессии.
app.use("/control", (_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": controlCsp
  });
  next();
});

app.use("/control/vendor/tabler", express.static(
  path.join(root, "node_modules", "@tabler", "icons-webfont", "dist"),
  { dotfiles: "deny", index: false, maxAge: env.isProduction ? "7d" : 0 }
));
app.use("/control/assets", express.static(path.join(root, "control", "assets"), {
  dotfiles: "deny",
  index: false,
  maxAge: env.isProduction ? "1h" : 0
}));
app.get("/control/manifest.webmanifest", (_req, res) => {
  res.sendFile(path.join(root, "control", "manifest.webmanifest"));
});
// Scope is restricted to /control/, no public-site cache/fetch interception.
app.get("/control/push-sw.js", (_req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("application/javascript").sendFile(path.join(root, "control", "push-sw.js"));
});
app.get(["/control", "/control/"], (req, res) => {
  res.redirect(req.user ? "/control/app.html" : "/control/login.html");
});
app.get("/control/login.html", (req, res) => {
  if (req.user) {
    const orderId = String(req.query.openOrder || '');
    return res.redirect(/^[1-9]\d{0,9}$/.test(orderId)
      ? `/control/app.html?openOrder=${orderId}#/requests?order=${orderId}`
      : "/control/app.html");
  }
  return res.sendFile(path.join(root, "control", "login.html"));
});
app.get("/control/app.html", (req, res) => {
  if (!req.user) {
    const orderId = String(req.query.openOrder || '');
    return res.redirect(/^[1-9]\d{0,9}$/.test(orderId)
      ? `/control/login.html?openOrder=${orderId}` : "/control/login.html");
  }
  return res.sendFile(path.join(root, "control", "app.html"));
});

// Health предназначен для локальной проверки/Nginx monitoring.
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, status: "ok" });
  } catch {
    res.status(503).json({ success: false, status: "database_unavailable" });
  }
});

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  const server = app.listen(env.port, env.host, () => {
    console.log(`Свои грузы: ${env.appOrigin || `http://localhost:${env.port}`}`);


  });

  const shutdown = (signal) => {
    console.log(`${signal}: корректная остановка`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
