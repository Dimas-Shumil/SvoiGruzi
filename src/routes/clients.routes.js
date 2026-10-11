const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { recordActivity } = require("../lib/activity");
const { text, positiveId, normalizeSearch } = require("../lib/validation");
const { clientSearchText, optionalPhone } = require("../services/client.service");

const router = express.Router();

function totals(orders) {
  return orders.reduce((acc, order) => {
    if (order.status === "COMPLETED") {
      acc.totalCents += order.amountCents || 0;
      acc.paidCents += order.paidAmountCents || 0;
      acc.debtCents += Math.max((order.amountCents || 0) - (order.paidAmountCents || 0), 0);
    }
    return acc;
  }, { totalCents: 0, paidCents: 0, debtCents: 0 });
}

router.get("/", asyncRoute(async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, ...(search ? { searchText: { contains: search } } : {}) },
    include: {
      _count: { select: { orders: true } },
      orders: { select: { status: true, amountCents: true, paidAmountCents: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 300
  });

  res.json({
    success: true,
    clients: clients.map(({ orders, ...client }) => ({ ...client, ...totals(orders) }))
  });
}));

router.post("/", asyncRoute(async (req, res) => {
  const name = text(req.body.name, "Имя", 120, false);
  const parsedPhone = optionalPhone(req.body.phone);
  let deletedDuplicate = null;
  if (parsedPhone.normalized) {
    const duplicate = await prisma.client.findUnique({ where: { phoneNormalized: parsedPhone.normalized } });
    if (duplicate && !duplicate.deletedAt) {
      throw new HttpError(409, "Клиент с таким телефоном уже существует", "CLIENT_EXISTS");
    }
    if (duplicate?.deletedAt) deletedDuplicate = duplicate;
  }

  const draft = {
    name,
    phone: parsedPhone.raw,
    phoneNormalized: parsedPhone.normalized,
    defaultVehicle: text(req.body.defaultVehicle, "Автомобиль", 180),
    notes: text(req.body.notes, "Заметка", 2000)
  };
  draft.searchText = clientSearchText(draft);

  const client = deletedDuplicate
    ? await prisma.client.update({ where: { id: deletedDuplicate.id }, data: { ...draft, deletedAt: null } })
    : await prisma.client.create({ data: draft });
  await recordActivity({ req, action: "CREATE", entityType: "CLIENT", entityId: client.id, title: `Добавлен клиент ${client.name}` });
  res.status(201).json({ success: true, client });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      orders: {
        include: { vehicleRecord: true },
        orderBy: { createdAt: "desc" },
        take: 100
      }
    }
  });
  if (!client) throw new HttpError(404, "Клиент не найден", "NOT_FOUND");
  res.json({ success: true, client: { ...client, ...totals(client.orders) } });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new HttpError(404, "Клиент не найден", "NOT_FOUND");

  const parsedPhone = req.body.phone !== undefined ? optionalPhone(req.body.phone) : null;
  if (parsedPhone?.normalized) {
    const duplicate = await prisma.client.findUnique({ where: { phoneNormalized: parsedPhone.normalized } });
    if (duplicate && duplicate.id !== id) {
      throw new HttpError(409, duplicate.deletedAt
        ? "Этот телефон закреплён за удалённым клиентом. Создайте клиента заново с этим номером или используйте другой телефон"
        : "Клиент с таким телефоном уже существует", "CLIENT_EXISTS");
    }
  }

  const data = {
    name: req.body.name !== undefined ? text(req.body.name, "Имя", 120, false) : existing.name,
    phone: parsedPhone ? parsedPhone.raw : existing.phone,
    phoneNormalized: parsedPhone ? parsedPhone.normalized : existing.phoneNormalized,
    defaultVehicle: req.body.defaultVehicle !== undefined ? text(req.body.defaultVehicle, "Автомобиль", 180) : existing.defaultVehicle,
    notes: req.body.notes !== undefined ? text(req.body.notes, "Заметка", 2000) : existing.notes
  };
  data.searchText = clientSearchText(data);

  const client = await prisma.client.update({ where: { id }, data });
  await recordActivity({ req, action: "UPDATE", entityType: "CLIENT", entityId: id, title: `Обновлён клиент ${client.name || `#${client.id}`}` });
  res.json({ success: true, client });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { orders: true } } }
  });
  if (!existing) throw new HttpError(404, "Клиент не найден", "NOT_FOUND");

  await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordActivity({
    req,
    action: "DELETE",
    entityType: "CLIENT",
    entityId: id,
    title: `Удалён клиент ${existing.name || existing.phone || `#${id}`}`,
    metadata: { preservedOrders: existing._count.orders }
  });
  res.json({ success: true });
}));

module.exports = router;
