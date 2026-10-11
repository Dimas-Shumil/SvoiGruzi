const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { recordActivity } = require("../lib/activity");
const { text, positiveId, enumValue, optionalDate, moneyToCents } = require("../lib/validation");

const router = express.Router();
const CATEGORIES = new Set(["FUEL", "REPAIR", "ADVERTISING", "WASH", "SERVICE", "TAX", "OTHER"]);

function dateRange(query, defaultDays = 30) {
  const to = query.to ? optionalDate(query.to, "Конец периода") : new Date();
  const from = query.from ? optionalDate(query.from, "Начало периода") : new Date(to.getTime() - defaultDays * 86400000);
  if (from >= to) throw new HttpError(400, "Некорректный период", "VALIDATION_ERROR");
  return { from, to };
}

async function summaryFor(from, to) {
  const [orders, revenue, paid, expenses] = await Promise.all([
    prisma.order.count({ where: { status: "COMPLETED", completedAt: { gte: from, lt: to } } }),
    prisma.order.aggregate({ where: { status: "COMPLETED", completedAt: { gte: from, lt: to } }, _sum: { amountCents: true } }),
    prisma.order.aggregate({ where: { status: "COMPLETED", completedAt: { gte: from, lt: to } }, _sum: { paidAmountCents: true } }),
    prisma.expense.aggregate({ where: { occurredAt: { gte: from, lt: to } }, _sum: { amountCents: true } })
  ]);
  const revenueCents = revenue._sum.amountCents || 0;
  const paidCents = paid._sum.paidAmountCents || 0;
  const expenseCents = expenses._sum.amountCents || 0;
  return {
    orderCount: orders,
    revenueCents,
    paidCents,
    expenseCents,
    profitCents: paidCents - expenseCents,
    debtCents: Math.max(revenueCents - paidCents, 0),
    averageCheckCents: orders ? Math.round(revenueCents / orders) : 0
  };
}

router.get("/summary", asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query);
  const stats = await summaryFor(from, to);
  res.json({ success: true, from, to, stats });
}));

router.get("/expenses", asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query, 3650);
  const expenses = await prisma.expense.findMany({
    where: { occurredAt: { gte: from, lt: to } },
    orderBy: { occurredAt: "desc" },
    take: 500
  });
  res.json({ success: true, expenses });
}));

router.post("/expenses", asyncRoute(async (req, res) => {
  const expense = await prisma.expense.create({
    data: {
      amountCents: moneyToCents(req.body.amount, "Сумма"),
      category: enumValue(req.body.category, CATEGORIES, "Категория", "OTHER"),
      occurredAt: optionalDate(req.body.occurredAt, "Дата") || new Date(),
      note: text(req.body.note, "Комментарий", 1000),
      createdById: req.user.id
    }
  });
  await recordActivity({ req, action: "CREATE", entityType: "EXPENSE", entityId: expense.id, title: `Добавлен расход ${expense.amountCents / 100} ₽` });
  res.status(201).json({ success: true, expense });
}));

router.patch("/expenses/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Расход не найден", "NOT_FOUND");
  const expense = await prisma.expense.update({
    where: { id },
    data: {
      amountCents: req.body.amount !== undefined ? moneyToCents(req.body.amount, "Сумма") : existing.amountCents,
      category: req.body.category !== undefined ? enumValue(req.body.category, CATEGORIES, "Категория") : existing.category,
      occurredAt: req.body.occurredAt !== undefined ? optionalDate(req.body.occurredAt, "Дата") : existing.occurredAt,
      note: req.body.note !== undefined ? text(req.body.note, "Комментарий", 1000) : existing.note
    }
  });
  await recordActivity({ req, action: "UPDATE", entityType: "EXPENSE", entityId: id, title: `Обновлён расход ${expense.amountCents / 100} ₽` });
  res.json({ success: true, expense });
}));

router.delete("/expenses/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new HttpError(404, "Расход не найден", "NOT_FOUND");
  await prisma.expense.delete({ where: { id } });
  await recordActivity({ req, action: "DELETE", entityType: "EXPENSE", entityId: id, title: `Удалён расход ${expense.amountCents / 100} ₽` });
  res.json({ success: true });
}));

router.get("/export.csv", asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query, 90);
  const orders = await prisma.order.findMany({
    where: { completedAt: { gte: from, lt: to }, status: "COMPLETED" },
    include: { client: true, vehicleRecord: true },
    orderBy: { completedAt: "asc" },
    take: 5000
  });
  const safe = (value) => `"${String(value ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
  const rows = [
    ["Номер", "Дата", "Клиент", "Телефон", "Откуда", "Куда", "Груз", "Автомобиль", "Стоимость", "Оплачено", "Источник"],
    ...orders.map((order) => [
      order.id,
      order.completedAt?.toISOString() || "",
      order.client.name || "",
      order.client.phone || "",
      order.pickupAddress || "",
      order.destinationAddress || "",
      order.cargoType || "",
      order.vehicleRecord?.name || order.vehicle || "",
      (order.amountCents || 0) / 100,
      (order.paidAmountCents || 0) / 100,
      order.source
    ])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(safe).join(";")).join("\r\n")}`;
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="svoi-gruzi-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store"
  });
  res.send(csv);
}));

module.exports = router;
