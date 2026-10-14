'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { sitemap, vehicleHtml } = require('../src/services/seo.service');

test('dynamic sitemap has only canonical public paths and includes published vehicles', () => {
  const xml = sitemap([{ slug: 'gazelle-next', updatedAt: new Date('2026-10-14T12:00:00.000Z') }]);
  assert.match(xml, /https:\/\/svoi-perevozki\.ru\/autopark\/gazelle-next/);
  assert.match(xml, /<lastmod>2026-10-14<\/lastmod>/);
  assert.doesNotMatch(xml, /(?:\/index\.html|\/control\/)/);
});

test('vehicle SSR provides unique canonical, useful body content and safe escaping', () => {
  const rendered = vehicleHtml({
    slug: 'test-truck', published: true, name: 'ГАЗель <script>alert(1)</script>',
    shortDescription: 'Для перевозки мебели',
    capacityKg: 1500, volumeM3: 12, bodyType: 'Фургон', serviceArea: 'Абакан',
  });
  assert.match(rendered, /<link rel="canonical" href="https:\/\/svoi-perevozki\.ru\/autopark\/test-truck"/);
  assert.match(rendered, /<h1 class="car-card__title" id="car-title">ГАЗель &lt;script&gt;/);
  assert.match(rendered, /<dd>1500 кг<\/dd>/);
  assert.match(rendered, /<dd>12 м³<\/dd>/);
  assert.doesNotMatch(rendered, /<script>alert\(1\)<\/script>/);
});

test('static landing pages have unique canonical and parseable JSON-LD', () => {
  const files = ['index.html', 'about.html', 'autopark.html'];
  const canonicals = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    const canon = content.match(/<link rel="canonical" href="([^"]+)"/);
    assert.ok(canon, file);
    canonicals.add(canon[1]);
    const graphs = [...content.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)];
    assert.ok(graphs.length > 0, file);
    for (const graph of graphs) assert.doesNotThrow(() => JSON.parse(graph[1]));
  }
  assert.equal(canonicals.size, files.length);
});

test('public request pipeline no longer sends SMTP email and push stays behind CRM auth', () => {
  const source = fs.readFileSync(path.join(root, 'src/routes/public-orders.routes.js'), 'utf8');
  assert.match(source, /sendNewOrderNotification\(order\)/);
  assert.doesNotMatch(source, /sendNewRequestNotification|mail\.service|nodemailer/);
  const routes = fs.readFileSync(path.join(root, 'src/routes/control.routes.js'), 'utf8');
  assert.ok(routes.indexOf('router.use(requireAuth, requireOwner)') < routes.indexOf('router.use("/push", pushRoutes)'));
  const sw = fs.readFileSync(path.join(root, 'control/push-sw.js'), 'utf8');
  assert.match(sw, /notificationclick/);
  assert.doesNotMatch(sw, /addEventListener\("fetch"/);
});

test('npm lockfile has web-push exact version and SMTP library has been removed', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(manifest.dependencies['web-push'], '3.6.7');
  assert.equal(lock.packages['node_modules/web-push'].version, '3.6.7');
  assert.equal(lock.packages[''].dependencies['web-push'], '3.6.7');
  assert.equal(manifest.dependencies.nodemailer, undefined);
});
