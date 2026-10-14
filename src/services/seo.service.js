"use strict";

const fs = require("node:fs");
const path = require("node:path");
const BASE = "https://svoi-perevozki.ru";

function xmlEscape(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
}
function htmlEscape(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function safeJson(obj) { return JSON.stringify(obj).replace(/</g, "\\u003c"); }
function sitemap(vehicles) {
  const entries = [
    { url: BASE + '/', priority: '1.0' },
    { url: BASE + '/autopark.html', priority: '0.8' },
    { url: BASE + '/about.html', priority: '0.6' },
    ...vehicles.map(({ slug, updatedAt }) => ({
      url: BASE + '/autopark/' + encodeURIComponent(slug),
      priority: '0.7',
      lastmod: updatedAt instanceof Date && Number.isFinite(updatedAt.getTime()) ? updatedAt.toISOString().slice(0, 10) : undefined
    }))
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((entry) => `<url><loc>${xmlEscape(entry.url)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>';
}
function vehicleHtml(vehicle) {
  let template = fs.readFileSync(path.join(__dirname, '../../car.html'), 'utf8');
  const name = String(vehicle.name || 'Автомобиль').slice(0, 130);
  const short = String(vehicle.shortDescription || vehicle.description || `${name} для грузоперевозок по Абакану и Хакасии.`).replace(/\s+/g,' ').trim().slice(0, 220);
  const canonical = `${BASE}/autopark/${encodeURIComponent(vehicle.slug)}`;
  const title = `${name} — грузоперевозки в Абакане | СВОИ ГРУЗЫ`;
  const image = vehicle.previewImage && /^\/site\/img\/[a-zA-Z0-9/_.-]+$/.test(vehicle.previewImage)
    ? BASE + vehicle.previewImage : BASE + '/site/img/autopark-hero.webp';
  const graph = {
    '@context':'https://schema.org', '@graph':[
      { '@type':'BreadcrumbList', itemListElement:[
        { '@type':'ListItem',position:1,name:'Главная',item:BASE+'/' },
        { '@type':'ListItem',position:2,name:'Автопарк',item:BASE+'/autopark.html' },
        { '@type':'ListItem',position:3,name,item:canonical },
      ] },
      { '@type':'WebPage', name:title, url:canonical, description:short, inLanguage:'ru-RU', about:{'@id':BASE+'/#organization'} }
    ]
  };
  const meta = `    <meta name="robots" content="index, follow, max-image-preview:large" />\n`+
    `    <link rel="canonical" href="${htmlEscape(canonical)}" />\n`+
    `    <link rel="icon" href="/favicon.ico" sizes="any" />\n`+
    `    <meta property="og:locale" content="ru_RU" />\n`+
    `    <meta property="og:type" content="website" />\n`+
    `    <meta property="og:site_name" content="СВОИ ГРУЗЫ" />\n`+
    `    <meta property="og:title" content="${htmlEscape(title)}" />\n`+
    `    <meta property="og:description" content="${htmlEscape(short)}" />\n`+
    `    <meta property="og:image" content="${htmlEscape(image)}" />\n`+
    `    <meta property="og:url" content="${htmlEscape(canonical)}" />\n`+
    `    <meta name="twitter:card" content="summary_large_image" />\n`+
    `    <script type="application/ld+json">${safeJson(graph)}</script>\n`;
  template=template.replace(/<title>[^<]*<\/title>/, `<title>${htmlEscape(title)}</title>`);
  template=template.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/,`<meta name="description" content="${htmlEscape(short)}" />`);
  template=template.replace('  </head>',meta+'  </head>');
  template=template.replace('id="car-title">Автомобиль</h1>',`id="car-title">${htmlEscape(name)}</h1>`);
  template=template.replace('<span aria-current="page">Автомобиль</span>',`<span aria-current="page">${htmlEscape(name)}</span>`);
  template=template.replace('Данные автомобиля загружаются из автопарка.',htmlEscape(short));
  // Real server-rendered facts, so crawlers and users without JS can see vehicle specs.
  template=template.replace('<dd>—</dd>',`<dd>${vehicle.capacityKg ? htmlEscape(String(vehicle.capacityKg)+' кг') : 'По запросу'}</dd>`);
  template=template.replace('<dd>—</dd>',`<dd>${vehicle.volumeM3 ? htmlEscape(String(vehicle.volumeM3).replace('.',',')+' м³') : 'По запросу'}</dd>`);
  template=template.replace('<dd>—</dd>',`<dd>${htmlEscape(vehicle.bodyType || 'Уточняется')}</dd>`);
  template=template.replace('<dd>—</dd>',`<dd>${htmlEscape(vehicle.serviceArea || 'Абакан и Хакасия')}</dd>`);
  return template;
}
module.exports = { sitemap, vehicleHtml };
