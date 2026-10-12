const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { text, positiveId, optionalDate, normalizeSearch } = require("../lib/validation");
const { createControlOrder, updateOrder, STATUSES, TYPES } = require("../services/order.service");

const router = express.Router();

router.get("/", asyncRoute(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const rawSearch = String(req.query.search ?? "").trim();
  const searchVariants = new Set();
  const normalizedSearch = normalizeSearch(text(rawSearch, "Поиск", 120));
  if (normalizedSearch) searchVariants.add(normalizedSearch);
  const searchDigits = rawSearch.replace(/\D/g, "");
  if (searchDigits) {
    searchVariants.add(searchDigits);
    // Российские номера в searchText содержат нормализованный вариант с 7,
    // поэтому 8..., 7..., +7... и частичный ввод должны искать одинаково.
    if (searchDigits.startsWith("8")) searchVariants.add(`7${searchDigits.slice(1)}`);
    if (searchDigits.length === 10) searchVariants.add(`7${searchDigits}`);
  }
  const searches = [...searchVariants].filter(Boolean);
  const status = STATUSES.has(req.query.status) ? req.query.status : null;
  const type = TYPES.has(req.query.type) ? req.query.type : null;
  const from = req.query.from ? optionalDate(req.query.from, "Начало периода") : null;
  const to = req.query.to ? optionalDate(req.query.to, "Конец периода") : null;

  const dateField = req.query.scope === 'scheduled' ? 'scheduledAt' : 'createdAt';
  const where = {
    ...(searches.length ? { OR: searches.map((search) => ({ searchText: { contains: search } })) } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...((from || to) ? { [dateField]: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { client: true, vehicleRecord: { include: { carrier: true } } },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.order.count({ where })
  ]);

  res.json({ success: true, orders, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}));

router.post("/", asyncRoute(async (req, res) => {
  const order = await createControlOrder(req.body, req.user.id);
  res.status(201).json({ success: true, order });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const order = await prisma.order.findUnique({
    where: { id },
    include: { client: true, vehicleRecord: { include: { carrier: true } } }
  });
  if (!order) throw new HttpError(404, "Заявка не найдена", "NOT_FOUND");
  res.json({ success: true, order });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const order = await updateOrder(id, req.body);
  res.json({ success: true, order });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const order = await prisma.order.findUnique({ where: { id }, include: { client: true } });
  if (!order) throw new HttpError(404, "Заявка не найдена", "NOT_FOUND");

  await prisma.order.delete({ where: { id } });

  res.json({ success: true });
}));

module.exports = router;
