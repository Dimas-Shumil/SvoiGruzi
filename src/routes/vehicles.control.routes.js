const express = require('express');
const prisma = require('../lib/prisma');
const { asyncRoute } = require('../lib/async-route');
const { HttpError } = require('../lib/http-error');
const {
  text,
  singleLineText,
  positiveId,
  safeSlug,
  enumValue,
  normalizePhone,
  formatPhone,
} = require('../lib/validation');

const router = express.Router();
const OWNERSHIP_TYPES = new Set(['OWN', 'PARTNER']);
const STATUSES = new Set(['AVAILABLE', 'BUSY', 'MAINTENANCE', 'UNAVAILABLE']);

function optionalNumber(value, label, min = 0, max = 1000000) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new HttpError(400, `${label}: некорректное значение`, 'VALIDATION_ERROR');
  }
  return number;
}

function optionalInt(value, label, min = 0, max = 1000000) {
  const number = optionalNumber(value, label, min, max);
  if (number == null) return null;
  if (!Number.isInteger(number)) throw new HttpError(400, `${label}: требуется целое число`, 'VALIDATION_ERROR');
  return number;
}

function boolValue(value, fallback = false) {
  if (value === true || value === 'true' || value === '1' || value === 'on') return true;
  if (value === false || value === 'false' || value === '0' || value === '') return false;
  return fallback;
}

function localImagePath(value, label = 'Изображение') {
  const result = singleLineText(value, label, 300);
  if (!result) return null;
  if (!result.startsWith('/site/img/') || result.includes('..') || result.includes('\\')) {
    throw new HttpError(400, `${label}: используйте путь вида /site/img/file.webp`, 'VALIDATION_ERROR');
  }
  return result;
}

function categoriesValue(value) {
  if (Array.isArray(value)) value = value.join(',');
  const raw = singleLineText(value, 'Категории', 400) || '';
  return [...new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))].join(',');
}

function galleryValue(value, vehicleName) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, 'Галерея: некорректный формат', 'VALIDATION_ERROR');
  if (value.length > 12) throw new HttpError(400, 'Галерея: максимум 12 изображений', 'VALIDATION_ERROR');
  return value.map((item, index) => {
    const image = localImagePath(typeof item === 'string' ? item : item?.image, `Фото ${index + 1}`);
    if (!image) throw new HttpError(400, `Фото ${index + 1}: укажите изображение`, 'VALIDATION_ERROR');
    const alt = singleLineText(typeof item === 'string' ? `${vehicleName}, фото ${index + 1}` : item?.alt, 'Alt', 180)
      || `${vehicleName}, фото ${index + 1}`;
    return { image, alt, sortOrder: index * 10 };
  });
}

function optionalEmail(value) {
  const email = singleLineText(value, 'Email партнёра', 180);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Email партнёра указан неверно', 'VALIDATION_ERROR');
  }
  return email.toLowerCase();
}

function partnerPayload(body) {
  const name = singleLineText(body.partnerName, 'Имя партнёра', 120, true);
  const phoneDigits = normalizePhone(body.partnerPhone);
  return {
    name,
    companyName: singleLineText(body.partnerCompanyName, 'Компания партнёра', 180),
    phone: formatPhone(phoneDigits),
    phoneNormalized: phoneDigits,
    email: optionalEmail(body.partnerEmail),
    notes: text(body.partnerNotes, 'Заметка о партнёре', 1000),
    commissionPercent: optionalNumber(body.partnerCommissionPercent, 'Комиссия', 0, 100),
    isActive: true,
  };
}

async function resolveCarrier(tx, ownershipType, body, existingCarrierId = null) {
  if (ownershipType === 'OWN') return null;
  const data = partnerPayload(body);
  if (existingCarrierId) {
    const existing = await tx.carrier.findUnique({ where: { id: existingCarrierId } });
    if (existing) {
      const carrier = await tx.carrier.update({ where: { id: existingCarrierId }, data });
      return carrier.id;
    }
  }
  const carrier = await tx.carrier.create({ data });
  return carrier.id;
}

function vehiclePayload(body, existing = null) {
  const name = body.name !== undefined ? singleLineText(body.name, 'Название', 160, true) : existing?.name;
  const ownershipType = body.ownershipType !== undefined
    ? enumValue(body.ownershipType, OWNERSHIP_TYPES, 'Тип автомобиля')
    : existing?.ownershipType || 'OWN';

  return {
    name,
    slug: body.slug !== undefined ? safeSlug(body.slug, 'Slug', true) : existing?.slug,
    shortDescription: body.shortDescription !== undefined ? text(body.shortDescription, 'Краткое описание', 400) : existing?.shortDescription,
    description: body.description !== undefined ? text(body.description, 'Описание', 4000) : existing?.description,
    specsDescription: body.specsDescription !== undefined ? text(body.specsDescription, 'Описание характеристик', 2000) : existing?.specsDescription,
    cargoDescription: body.cargoDescription !== undefined ? text(body.cargoDescription, 'Описание перевозок', 2000) : existing?.cargoDescription,
    cargoItems: body.cargoItems !== undefined ? text(body.cargoItems, 'Что можно перевозить', 3000) : existing?.cargoItems,
    serviceArea: body.serviceArea !== undefined ? singleLineText(body.serviceArea, 'Зона работы', 180) : existing?.serviceArea,
    capacityKg: body.capacityKg !== undefined ? optionalInt(body.capacityKg, 'Грузоподъёмность', 0, 100000) : existing?.capacityKg,
    volumeM3: body.volumeM3 !== undefined ? optionalNumber(body.volumeM3, 'Объём', 0, 1000) : existing?.volumeM3,
    bodyLengthM: body.bodyLengthM !== undefined ? optionalNumber(body.bodyLengthM, 'Длина кузова', 0, 50) : existing?.bodyLengthM,
    bodyWidthM: body.bodyWidthM !== undefined ? optionalNumber(body.bodyWidthM, 'Ширина кузова', 0, 20) : existing?.bodyWidthM,
    bodyHeightM: body.bodyHeightM !== undefined ? optionalNumber(body.bodyHeightM, 'Высота кузова', 0, 20) : existing?.bodyHeightM,
    bodyType: body.bodyType !== undefined ? singleLineText(body.bodyType, 'Тип кузова', 120) : existing?.bodyType,
    loadingType: body.loadingType !== undefined ? singleLineText(body.loadingType, 'Погрузка', 160) : existing?.loadingType,
    categories: body.categories !== undefined ? categoriesValue(body.categories) : existing?.categories || '',
    ownershipType,
    status: body.status !== undefined ? enumValue(body.status, STATUSES, 'Статус') : existing?.status || 'AVAILABLE',
    published: body.published !== undefined ? boolValue(body.published) : existing?.published ?? true,
    sortOrder: body.sortOrder !== undefined ? optionalInt(body.sortOrder, 'Порядок', -10000, 10000) ?? 0 : existing?.sortOrder || 0,
  };
}

router.get('/', asyncRoute(async (req, res) => {
  const ownershipType = OWNERSHIP_TYPES.has(req.query.ownershipType) ? req.query.ownershipType : null;
  const status = STATUSES.has(req.query.status) ? req.query.status : null;
  const published = req.query.published === 'true' ? true : req.query.published === 'false' ? false : null;
  const search = String(req.query.search || '').trim().toLowerCase();

  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(ownershipType ? { ownershipType } : {}),
      ...(status ? { status } : {}),
      ...(published !== null ? { published } : {}),
      ...(search ? { OR: [
        { name: { contains: search } },
        { slug: { contains: search } },
        { bodyType: { contains: search } },
      ] } : {}),
    },
    include: {
      carrier: true,
      images: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { orders: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 300,
  });
  res.json({ success: true, vehicles });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { carrier: true, images: { orderBy: { sortOrder: 'asc' } }, _count: { select: { orders: true } } },
  });
  if (!vehicle) throw new HttpError(404, 'Машина не найдена', 'NOT_FOUND');
  res.json({ success: true, vehicle });
}));

router.post('/', asyncRoute(async (req, res) => {
  const payload = vehiclePayload(req.body);
  const duplicate = await prisma.vehicle.findUnique({ where: { slug: payload.slug } });
  if (duplicate) throw new HttpError(409, 'Машина с таким slug уже существует', 'VEHICLE_EXISTS');
  const gallery = galleryValue(req.body.images, payload.name) || [];

  const vehicle = await prisma.$transaction(async (tx) => {
    const carrierId = await resolveCarrier(tx, payload.ownershipType, req.body);
    return tx.vehicle.create({
      data: {
        ...payload,
        previewImage: gallery[0]?.image || null,
        carrierId,
        images: gallery.length ? { create: gallery } : undefined,
      },
      include: { carrier: true, images: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  res.status(201).json({ success: true, vehicle });
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.vehicle.findUnique({ where: { id }, include: { images: true, carrier: true } });
  if (!existing) throw new HttpError(404, 'Машина не найдена', 'NOT_FOUND');
  const payload = vehiclePayload(req.body, existing);

  if (payload.slug !== existing.slug) {
    const duplicate = await prisma.vehicle.findUnique({ where: { slug: payload.slug } });
    if (duplicate && duplicate.id !== id) throw new HttpError(409, 'Машина с таким slug уже существует', 'VEHICLE_EXISTS');
  }
  const gallery = galleryValue(req.body.images, payload.name);

  const vehicle = await prisma.$transaction(async (tx) => {
    const carrierId = await resolveCarrier(tx, payload.ownershipType, req.body, existing.carrierId);
    if (gallery !== undefined) await tx.vehicleImage.deleteMany({ where: { vehicleId: id } });
    return tx.vehicle.update({
      where: { id },
      data: {
        ...payload,
        carrierId,
        ...(gallery !== undefined ? {
          previewImage: gallery[0]?.image || null,
          images: { create: gallery },
        } : {}),
      },
      include: { carrier: true, images: { orderBy: { sortOrder: 'asc' } }, _count: { select: { orders: true } } },
    });
  });

  res.json({ success: true, vehicle });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
  if (!vehicle) throw new HttpError(404, 'Машина не найдена', 'NOT_FOUND');

  let archived = false;
  if (vehicle._count.orders > 0) {
    archived = true;
    await prisma.vehicle.update({ where: { id }, data: { published: false, status: 'UNAVAILABLE' } });
  } else {
    await prisma.vehicle.delete({ where: { id } });
  }

  res.json({ success: true, archived });
}));

module.exports = router;
