const prisma = require('../lib/prisma');
const { HttpError } = require('../lib/http-error');
const {
  text,
  enumValue,
  optionalDate,
  moneyToCents,
  normalizeSearch,
  positiveId,
} = require('../lib/validation');
const { upsertClient } = require('./client.service');

const TYPES = new Set(['REGULAR', 'SCHEDULED']);
const STATUSES = new Set(['NEW', 'PLANNED', 'COMPLETED', 'CANCELLED']);
const PAYMENT_STATUSES = new Set(['UNPAID', 'PARTIAL', 'PAID']);
const PAYMENT_METHODS = new Set(['CASH', 'TRANSFER', 'CARD', 'OTHER']);

function booleanOrNull(value) {
  if (value === true || value === 'true' || value === 'yes' || value === '1') return true;
  if (value === false || value === 'false' || value === 'no' || value === '0') return false;
  return null;
}

function paymentData(body, amountCents) {
  if (amountCents == null) return { paymentStatus: 'UNPAID', paymentMethod: null, paidAmountCents: 0 };
  const paymentStatus = enumValue(body.paymentStatus, PAYMENT_STATUSES, 'Статус оплаты', 'PAID');
  const paymentMethod = body.paymentMethod
    ? enumValue(body.paymentMethod, PAYMENT_METHODS, 'Способ оплаты')
    : null;
  let paidAmountCents = moneyToCents(body.paidAmount, 'Оплаченная сумма') ?? 0;
  if (paymentStatus === 'PAID') paidAmountCents = amountCents;
  if (paymentStatus === 'UNPAID') paidAmountCents = 0;
  if (paidAmountCents > amountCents) {
    throw new HttpError(400, 'Оплаченная сумма не может превышать стоимость заказа', 'VALIDATION_ERROR');
  }
  if (paymentStatus === 'PARTIAL' && (paidAmountCents <= 0 || paidAmountCents >= amountCents)) {
    throw new HttpError(400, 'Для частичной оплаты укажите сумму меньше полной стоимости', 'VALIDATION_ERROR');
  }
  return { paymentStatus, paymentMethod, paidAmountCents };
}

function orderSearchText({ client, pickupAddress, destinationAddress, cargoType, vehicle, source, notes }) {
  return normalizeSearch(
    client?.name,
    client?.phone,
    client?.phoneNormalized,
    pickupAddress,
    destinationAddress,
    cargoType,
    vehicle,
    source,
    notes,
  );
}

async function resolveVehicle(tx, vehicleIdValue, vehicleText) {
  if (vehicleIdValue === null || vehicleIdValue === '') {
    return { vehicleId: null, vehicle: text(vehicleText, 'Автомобиль', 180) };
  }
  if (vehicleIdValue === undefined) return null;
  const vehicleId = positiveId(vehicleIdValue);
  const vehicleRecord = await tx.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicleRecord) throw new HttpError(400, 'Выбранная машина не найдена', 'VALIDATION_ERROR');
  return { vehicleId, vehicle: vehicleRecord.name };
}

async function createControlOrder(body, userId) {
  const type = enumValue(body.type, TYPES, 'Тип заявки', 'REGULAR');
  const status = body.status
    ? enumValue(body.status, STATUSES, 'Статус')
    : type === 'SCHEDULED' ? 'PLANNED' : 'NEW';
  const pickupAddress = text(body.pickupAddress, 'Откуда забрать', 300);
  const destinationAddress = text(body.destinationAddress, 'Куда отвезти', 300);
  const clientName = text(body.clientName, 'Имя клиента', 120, true);
  const cargoType = text(body.cargoType, 'Груз', 120);
  const notes = text(body.notes, 'Комментарий', 2000);
  const source = text(body.source, 'Источник', 80) || 'Другое';
  const amountCents = moneyToCents(body.amount, 'Стоимость', true);
  const scheduledAt = type === 'SCHEDULED' ? optionalDate(body.scheduledAt, 'Дата и время') : null;
  if (type === 'SCHEDULED' && !scheduledAt) {
    throw new HttpError(400, 'Укажите дату и время запланированной заявки', 'VALIDATION_ERROR');
  }
  const loadersRequired = booleanOrNull(body.loadersRequired);

  return prisma.$transaction(async (tx) => {
    const vehicleData = await resolveVehicle(tx, body.vehicleId, body.vehicle);
    const vehicleName = vehicleData?.vehicle || text(body.vehicle, 'Автомобиль', 180);
    const client = await upsertClient(tx, {
      phone: body.phone,
      name: clientName,
      vehicle: vehicleName,
      clientId: body.clientId || null,
    });
    const payments = paymentData(body, amountCents);
    const now = new Date();

    return tx.order.create({
      data: {
        type,
        status,
        clientId: client.id,
        pickupAddress,
        destinationAddress,
        cargoType,
        loadersRequired,
        vehicle: vehicleName,
        vehicleId: vehicleData?.vehicleId || null,
        amountCents,
        ...payments,
        source,
        notes,
        scheduledAt,
        startedAt: null,
        completedAt: status === 'COMPLETED' ? now : null,
        cancelledAt: status === 'CANCELLED' ? now : null,
        createdById: userId,
        searchText: orderSearchText({
          client,
          pickupAddress,
          destinationAddress,
          cargoType,
          vehicle: vehicleName,
          source,
          notes,
        }),
      },
      include: { client: true, vehicleRecord: { include: { carrier: true } } },
    });
  });
}

async function updateOrder(id, body) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id },
      include: { client: true, vehicleRecord: true },
    });
    if (!existing) throw new HttpError(404, 'Заявка не найдена', 'NOT_FOUND');

    const type = body.type !== undefined ? enumValue(body.type, TYPES, 'Тип заявки') : existing.type;
    const status = body.status !== undefined ? enumValue(body.status, STATUSES, 'Статус') : existing.status;
    const pickupAddress = body.pickupAddress !== undefined ? text(body.pickupAddress, 'Откуда забрать', 300) : existing.pickupAddress;
    const destinationAddress = body.destinationAddress !== undefined ? text(body.destinationAddress, 'Куда отвезти', 300) : existing.destinationAddress;
    const cargoType = body.cargoType !== undefined ? text(body.cargoType, 'Груз', 120) : existing.cargoType;
    const notes = body.notes !== undefined ? text(body.notes, 'Комментарий', 2000) : existing.notes;
    const source = body.source !== undefined ? text(body.source, 'Источник', 80, true) : existing.source;
    const scheduledAt = type === 'SCHEDULED'
      ? body.scheduledAt !== undefined ? optionalDate(body.scheduledAt, 'Дата и время') : existing.scheduledAt
      : null;
    if (type === 'SCHEDULED' && !scheduledAt) {
      throw new HttpError(400, 'Укажите дату и время запланированной заявки', 'VALIDATION_ERROR');
    }
    const loadersRequired = body.loadersRequired !== undefined
      ? booleanOrNull(body.loadersRequired)
      : existing.loadersRequired;

    let vehicleId = existing.vehicleId;
    let vehicle = existing.vehicle;
    if (body.vehicleId !== undefined || body.vehicle !== undefined) {
      const resolved = await resolveVehicle(tx, body.vehicleId, body.vehicle);
      if (resolved) {
        vehicleId = resolved.vehicleId;
        vehicle = resolved.vehicle;
      } else if (body.vehicle !== undefined) {
        vehicle = text(body.vehicle, 'Автомобиль', 180);
      }
    }

    const clientName = body.clientName !== undefined
      ? text(body.clientName, 'Имя клиента', 120, true)
      : existing.client.name;
    const client = body.phone !== undefined || body.clientName !== undefined || body.clientId !== undefined || body.vehicleId !== undefined || body.vehicle !== undefined
      ? await upsertClient(tx, {
          phone: body.phone !== undefined ? body.phone : existing.client.phone,
          name: clientName,
          vehicle,
          clientId: body.clientId || existing.client.id,
        })
      : existing.client;

    const amountCents = body.amount !== undefined
      ? moneyToCents(body.amount, 'Стоимость', true)
      : existing.amountCents;
    if (status === 'COMPLETED' && amountCents == null) {
      throw new HttpError(400, 'Перед завершением заявки укажите стоимость перевозки', 'VALIDATION_ERROR');
    }

    const payments = body.amount !== undefined || body.paymentStatus !== undefined || body.paymentMethod !== undefined || body.paidAmount !== undefined
      ? paymentData({
          paymentStatus: body.paymentStatus ?? existing.paymentStatus,
          paymentMethod: body.paymentMethod ?? existing.paymentMethod,
          paidAmount: body.paidAmount ?? existing.paidAmountCents / 100,
        }, amountCents)
      : {
          paymentStatus: existing.paymentStatus,
          paymentMethod: existing.paymentMethod,
          paidAmountCents: existing.paidAmountCents,
        };

    const now = new Date();
    return tx.order.update({
      where: { id },
      data: {
        type,
        status,
        clientId: client.id,
        pickupAddress,
        destinationAddress,
        cargoType,
        loadersRequired,
        vehicle,
        vehicleId,
        amountCents,
        ...payments,
        source,
        notes,
        scheduledAt,
        startedAt: existing.startedAt,
        completedAt: status === 'COMPLETED' ? existing.completedAt || now : null,
        cancelledAt: status === 'CANCELLED' ? existing.cancelledAt || now : null,
        searchText: orderSearchText({ client, pickupAddress, destinationAddress, cargoType, vehicle, source, notes }),
      },
      include: { client: true, vehicleRecord: { include: { carrier: true } } },
    });
  });
}

module.exports = {
  TYPES,
  STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  createControlOrder,
  updateOrder,
  orderSearchText,
};
