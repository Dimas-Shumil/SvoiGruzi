const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { recordActivity } = require("../lib/activity");
const { text, positiveId, optionalDate, normalizeSearch } = require("../lib/validation");
const { createControlOrder, updateOrder, STATUSES, TYPES } = require("../services/order.service");

const router = express.Router();

router.get("/", asyncRoute(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const search = normalizeSearch(text(req.query.search, "Поиск", 120));
  const status = STATUSES.has(req.query.status) ? req.query.status : null;
  const type = TYPES.has(req.query.type) ? req.query.type : null;
  const from = req.query.from ? optionalDate(req.query.from, "Начало периода") : null;
  const to = req.query.to ? optionalDate(req.query.to, "Конец периода") : null;

  const where = {
    ...(search ? { searchText: { contains: search } } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {})
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { client: true, vehicleRecord: { include: { carrier: true } } },
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.order.count({ where })
  ]);

  res.json({ success: true, orders, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}));

router.post("/", asyncRoute(async (req, res) => {
  const order = await createControlOrder(req.body, req.user.id);
  await recordActivity({
    req,
    action: "CREATE",
    entityType: "ORDER",
    entityId: order.id,
    title: `Создана заявка №${order.id}`
  });
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
  await recordActivity({
    req,
    action: "UPDATE",
    entityType: "ORDER",
    entityId: id,
    title: `Обновлена заявка №${id}`,
    metadata: { status: order.status }
  });
  res.json({ success: true, order });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const order = await prisma.order.findUnique({ where: { id }, include: { client: true } });
  if (!order) throw new HttpError(404, "Заявка не найдена", "NOT_FOUND");

  await prisma.order.delete({ where: { id } });
  await recordActivity({
    req,
    action: "DELETE",
    entityType: "ORDER",
    entityId: id,
    title: `Удалена заявка №${id}`,
    metadata: { clientId: order.clientId }
  });

  res.json({ success: true });
}));

module.exports = router;
