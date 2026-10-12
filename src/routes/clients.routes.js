const express = require('express');
const prisma = require('../lib/prisma');
const { asyncRoute } = require('../lib/async-route');
const { HttpError } = require('../lib/http-error');
const { text, positiveId, normalizeSearch, normalizePhone, formatPhone } = require('../lib/validation');
const { clientSearchText } = require('../services/client.service');

const router = express.Router();

function clientSearchVariants(value) {
  const raw = String(value ?? '').trim();
  const normalized = normalizeSearch(text(raw, 'Поиск', 120));
  if (!normalized) return [];

  const variants = new Set([normalized]);
  const digits = raw.replace(/\D/g, '');
  if (digits) {
    variants.add(digits);
    // В базе российские номера хранятся нормализованно с 7.
    // Поэтому поиск должен одинаково понимать 8..., 7..., +7... и частичный ввод.
    if (digits.startsWith('8')) variants.add(`7${digits.slice(1)}`);
    if (digits.length === 10) variants.add(`7${digits}`);
  }
  return [...variants].filter(Boolean);
}

router.get('/', asyncRoute(async (req, res) => {
  const searchVariants = clientSearchVariants(req.query.search);
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(searchVariants.length ? {
        OR: searchVariants.map((search) => ({ searchText: { contains: search } })),
      } : {}),
    },
    include: {
      _count: { select: { orders: true } },
      orders: {
        where: { status: 'COMPLETED' },
        select: { amountCents: true, paidAmountCents: true },
        orderBy: { completedAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  const rows = clients.map(({ orders, ...client }) => ({
    ...client,
    totalCents: orders.reduce((sum, order) => sum + (order.amountCents || 0), 0),
    debtCents: orders.reduce((sum, order) => sum + Math.max((order.amountCents || 0) - order.paidAmountCents, 0), 0),
  }));
  res.json({ success: true, clients: rows });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: { orders: { orderBy: { createdAt: 'desc' }, take: 100 } },
  });
  if (!client) throw new HttpError(404, 'Клиент не найден', 'NOT_FOUND');
  res.json({ success: true, client });
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new HttpError(404, 'Клиент не найден', 'NOT_FOUND');

  let phone = existing.phone;
  let phoneNormalized = existing.phoneNormalized;
  if (req.body.phone !== undefined) {
    const rawPhone = String(req.body.phone ?? '').trim();
    phoneNormalized = rawPhone ? normalizePhone(rawPhone) : null;
    phone = phoneNormalized ? formatPhone(phoneNormalized) : null;
  }

  const data = {
    name: req.body.name !== undefined ? text(req.body.name, 'Имя', 120, true) : existing.name,
    phone,
    phoneNormalized,
    defaultVehicle: req.body.defaultVehicle !== undefined ? text(req.body.defaultVehicle, 'Автомобиль', 180) : existing.defaultVehicle,
    notes: req.body.notes !== undefined ? text(req.body.notes, 'Заметка', 2000) : existing.notes,
  };
  data.searchText = clientSearchText(data);

  const client = await prisma.client.update({ where: { id }, data });
  res.json({ success: true, client });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { orders: true } } },
  });
  if (!existing) throw new HttpError(404, 'Клиент не найден', 'NOT_FOUND');

  await prisma.client.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  res.json({ success: true });
}));

module.exports = router;
