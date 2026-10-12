const express = require('express');
const prisma = require('../lib/prisma');
const { asyncRoute } = require('../lib/async-route');
const { HttpError } = require('../lib/http-error');
const { text, positiveId, enumValue, optionalDate, moneyToCents, dateRange } = require('../lib/validation');
const { periodStats } = require('../services/stats.service');

const router = express.Router();
const CATEGORIES = new Set(['FUEL', 'REPAIR', 'ADVERTISING', 'WASH', 'SERVICE', 'TAX', 'OTHER']);

router.get('/summary', asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query);
  const stats = await periodStats(from, to);
  res.json({ success: true, from, to, stats });
}));

router.get('/expenses', asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query);
  const expenses = await prisma.expense.findMany({
    where: { occurredAt: { gte: from, lt: to } },
    orderBy: { occurredAt: 'desc' },
    take: 500,
  });
  res.json({ success: true, expenses });
}));

router.post('/expenses', asyncRoute(async (req, res) => {
  const expense = await prisma.expense.create({
    data: {
      amountCents: moneyToCents(req.body.amount, 'Сумма', true),
      category: enumValue(req.body.category, CATEGORIES, 'Категория', 'OTHER'),
      occurredAt: optionalDate(req.body.occurredAt, 'Дата') || new Date(),
      note: text(req.body.note, 'Комментарий', 1000),
      createdById: req.user.id,
    },
  });
  res.status(201).json({ success: true, expense });
}));

router.patch('/expenses/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Расход не найден', 'NOT_FOUND');
  const expense = await prisma.expense.update({
    where: { id },
    data: {
      amountCents: req.body.amount !== undefined ? moneyToCents(req.body.amount, 'Сумма', true) : existing.amountCents,
      category: req.body.category !== undefined ? enumValue(req.body.category, CATEGORIES, 'Категория') : existing.category,
      occurredAt: req.body.occurredAt !== undefined ? optionalDate(req.body.occurredAt, 'Дата') : existing.occurredAt,
      note: req.body.note !== undefined ? text(req.body.note, 'Комментарий', 1000) : existing.note,
    },
  });
  res.json({ success: true, expense });
}));

router.delete('/expenses/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new HttpError(404, 'Расход не найден', 'NOT_FOUND');
  await prisma.expense.delete({ where: { id } });
  res.json({ success: true });
}));

router.get('/export.csv', asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query, 90);
  const orders = await prisma.order.findMany({
    where: { completedAt: { gte: from, lt: to }, status: 'COMPLETED' },
    include: { client: true, vehicleRecord: true },
    orderBy: { completedAt: 'asc' },
    take: 5000,
  });
  const safe = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
  const rows = [
    ['Номер', 'Дата', 'Клиент', 'Телефон', 'Откуда', 'Куда', 'Груз', 'Автомобиль', 'Стоимость', 'Оплачено', 'Источник'],
    ...orders.map((order) => [
      order.id,
      order.completedAt?.toISOString() || '',
      order.client.name || '',
      order.client.phone || '',
      order.pickupAddress || '',
      order.destinationAddress || '',
      order.cargoType || '',
      order.vehicleRecord?.name || order.vehicle || '',
      (order.amountCents || 0) / 100,
      (order.paidAmountCents || 0) / 100,
      order.source,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(safe).join(';')).join('\r\n')}`;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="svoi-gruzi-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
}));

module.exports = router;
