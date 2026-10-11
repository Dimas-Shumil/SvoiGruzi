const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = "3119";
process.env.APP_ORIGIN = "http://127.0.0.1:3119";
process.env.SESSION_SECRET = "test-secret-" + "x".repeat(80);
process.env.TRUST_PROXY = "0";
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.TO_EMAIL = "";

const app = require("../server");
const { personName, safeSlug } = require("../src/lib/validation");

let server;
const ORIGIN = "http://127.0.0.1:3119";

async function request(path, options = {}) {
  return fetch(`${ORIGIN}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(3119, "127.0.0.1", resolve);
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("закрытый API не доступен без сессии", async () => {
  const response = await request("/api/control/dashboard");
  assert.equal(response.status, 401);
});

test("мутация публичного API без Origin блокируется", async () => {
  const response = await request("/api/requests", {
    method: "POST",
    body: {}
  });
  assert.equal(response.status, 403);
});



test("локальные localhost и 127.0.0.1 разрешены в development/test", async () => {
  for (const origin of ["http://localhost:3119", "http://127.0.0.1:3119"]) {
    const response = await request("/api/requests", {
      method: "POST",
      headers: { Origin: origin },
      body: {}
    });
    assert.notEqual(response.status, 403, origin);
  }
});

test("автопарк и загрузки закрыты без сессии", async () => {
  for (const path of ["/api/control/vehicles", "/api/control/uploads/vehicle-image"]) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
  }
});
test("чужой Origin блокируется", async () => {
  const response = await request("/api/requests", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
    body: {}
  });
  assert.equal(response.status, 403);
});

test("control app требует авторизацию", async () => {
  const response = await request("/control/app.html");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/control/login.html");
});

test("служебные файлы не раздаются как static", async () => {
  for (const path of ["/.env", "/prisma/schema.prisma", "/src/config/env.js", "/package.json"]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
  }
});

test("валидация имени и slug отклоняет мусор", () => {
  assert.equal(personName("Павел"), "Павел");
  assert.throws(() => personName("П\nавел"));
  assert.equal(safeSlug("gazelle-next-4-2"), "gazelle-next-4-2");
  assert.throws(() => safeSlug("../../.env"));
});
