"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("мобильное и обычное меню ведут на реальные публичные маршруты", () => {
  const header = read("components/header.html");
  assert.doesNotMatch(header, /href="\/index\.html/);
  for (const url of ["/", "/#services", "/#prices", "/autopark.html", "/about.html", "/#calculator"]) {
    assert.ok(header.includes(`href="${url}"`), url);
  }
});

test("внутренние страницы и футер не используют относительные ссылки на index.html", () => {
  for (const file of ["about.html", "autopark.html", "components/footer.html"]) {
    const body = read(file);
    assert.doesNotMatch(body, /href="(?:\/)?index\.html(?:[?#]|")/, file);
  }
  assert.match(read("site/scripts/components.js"), /`\/\$\{hash\}`/);
  const footer = read("components/footer.html");
  assert.match(footer, /href="\/autopark\.html"/);
  assert.match(footer, /href="\/about\.html"/);
  assert.match(footer, /class="site-footer__to-top"/);
});

test("кнопка машины и SSR ведут к форме и сохраняют выбранный slug", () => {
  const js = read("site/scripts/car.js");
  assert.match(js, /primary\.href = `\/\?vehicle=\$\{encodeURIComponent\(vehicle\.slug\)\}#calculator`/);
  const { vehicleHtml } = require("../src/services/seo.service");
  const rendered = vehicleHtml({slug:"gazelle-next-4-2",name:"ГАЗель",published:true});
  assert.match(rendered, /href="\/\?vehicle=gazelle-next-4-2#calculator"/);
  assert.match(read("index.html"), /id="calculator"/);
  assert.match(read("site/scripts/main.js"), /query\.get\("vehicle"\)/);
});

test("старый адрес /index.html сохраняет query для формы", () => {
  const server = read("server.js");
  assert.match(server, /originalUrl\.replace\(\/\^\\\/index/);
});
