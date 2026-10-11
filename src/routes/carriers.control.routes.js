const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { recordActivity } = require("../lib/activity");
const { text, singleLineText, positiveId, normalizePhone, normalizeSearch } = require("../lib/validation");

const router = express.Router();

function optionalEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Email: некорректное значение", "VALIDATION_ERROR");
  }
  return email;
}

function commissionValue(value) {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new HttpError(400, "Комиссия должна быть от 0 до 100%", "VALIDATION_ERROR");
  }
  return Math.round(number * 100) / 100;
}

function boolValue(value, fallback = true) {
  if (value === true || value === "true" || value === "1" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === "") return false;
  return fallback;
}

router.get("/", asyncRoute(async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const includeInactive = req.query.includeInactive === "true";
  const carriers = await prisma.carrier.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search ? { OR: [
        { name: { contains: search } },
        { companyName: { contains: search } },
        { phone: { contains: search } }
      ] } : {})
    },
    include: { _count: { select: { vehicles: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 300
  });
  res.json({ success: true, carriers });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const carrier = await prisma.carrier.findUnique({
    where: { id },
    include: { vehicles: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } }
  });
  if (!carrier) throw new HttpError(404, "Партнёр не найден", "NOT_FOUND");
  res.json({ success: true, carrier });
}));

router.post("/", asyncRoute(async (req, res) => {
  const parsedPhone = normalizePhone(req.body.phone);
  const duplicate = await prisma.carrier.findFirst({ where: { phoneNormalized: parsedPhone.normalized } });
  if (duplicate) throw new HttpError(409, "Партнёр с таким телефоном уже существует", "CARRIER_EXISTS");

  const carrier = await prisma.carrier.create({
    data: {
      name: singleLineText(req.body.name, "Имя", 120, false),
      companyName: singleLineText(req.body.companyName, "Компания", 180),
      phone: parsedPhone.raw,
      phoneNormalized: parsedPhone.normalized,
      email: optionalEmail(req.body.email),
      notes: text(req.body.notes, "Заметка", 2000),
      commissionPercent: commissionValue(req.body.commissionPercent),
      isActive: boolValue(req.body.isActive, true)
    }
  });
  await recordActivity({ req, action: "CREATE", entityType: "CARRIER", entityId: carrier.id, title: `Добавлен партнёр ${carrier.name}` });
  res.status(201).json({ success: true, carrier });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.carrier.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Партнёр не найден", "NOT_FOUND");

  const parsedPhone = req.body.phone !== undefined ? normalizePhone(req.body.phone) : null;
  if (parsedPhone) {
    const duplicate = await prisma.carrier.findFirst({ where: { phoneNormalized: parsedPhone.normalized } });
    if (duplicate && duplicate.id !== id) throw new HttpError(409, "Партнёр с таким телефоном уже существует", "CARRIER_EXISTS");
  }

  const carrier = await prisma.carrier.update({
    where: { id },
    data: {
      name: req.body.name !== undefined ? singleLineText(req.body.name, "Имя", 120, false) : existing.name,
      companyName: req.body.companyName !== undefined ? singleLineText(req.body.companyName, "Компания", 180) : existing.companyName,
      phone: parsedPhone ? parsedPhone.raw : existing.phone,
      phoneNormalized: parsedPhone ? parsedPhone.normalized : existing.phoneNormalized,
      email: req.body.email !== undefined ? optionalEmail(req.body.email) : existing.email,
      notes: req.body.notes !== undefined ? text(req.body.notes, "Заметка", 2000) : existing.notes,
      commissionPercent: req.body.commissionPercent !== undefined ? commissionValue(req.body.commissionPercent) : existing.commissionPercent,
      isActive: req.body.isActive !== undefined ? boolValue(req.body.isActive, existing.isActive) : existing.isActive
    }
  });
  await recordActivity({ req, action: "UPDATE", entityType: "CARRIER", entityId: id, title: `Обновлён партнёр ${carrier.name}` });
  res.json({ success: true, carrier });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const carrier = await prisma.carrier.findUnique({ where: { id }, include: { _count: { select: { vehicles: true } } } });
  if (!carrier) throw new HttpError(404, "Партнёр не найден", "NOT_FOUND");

  let archived = false;
  if (carrier._count.vehicles > 0) {
    archived = true;
    await prisma.$transaction([
      prisma.carrier.update({ where: { id }, data: { isActive: false } }),
      prisma.vehicle.updateMany({ where: { carrierId: id }, data: { published: false, status: "UNAVAILABLE" } })
    ]);
  } else {
    await prisma.carrier.delete({ where: { id } });
  }

  await recordActivity({
    req,
    action: "DELETE",
    entityType: "CARRIER",
    entityId: id,
    title: archived ? `Партнёр ${carrier.name} отключён` : `Удалён партнёр ${carrier.name}`,
    metadata: { archived, vehicles: carrier._count.vehicles }
  });
  res.json({ success: true, archived });
}));

module.exports = router;
