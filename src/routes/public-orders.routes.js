const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const {
  singleLineText,
  personName,
  publicServiceDate,
  safeSlug,
  normalizeSearch
} = require("../lib/validation");
const { upsertClient } = require("../services/client.service");
const { sendNewOrderNotification } = require("../services/push.service");

const router = express.Router();

const CARGO_LABELS = {
  furniture: "Мебель",
  appliances: "Бытовая техника",
  personal: "Личные вещи",
  business: "Груз для бизнеса",
  other: "Другое"
};

function loadersValue(value) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

router.post("/", asyncRoute(async (req, res) => {
  // Honeypot: обычный пользователь это поле не видит и не заполняет.
  // Боту отвечаем успешно, но в БД ничего не создаём.
  if (String(req.body.website || "").trim()) {
    return res.status(202).json({
      success: true,
      message: "Заявка принята. Свяжемся с вами в ближайшее время."
    });
  }

  const clientName = personName(req.body.clientName, "Имя");
  const pickupAddress = singleLineText(req.body.from, "Откуда", 300, true);
  const destinationAddress = singleLineText(req.body.to, "Куда", 300, true);
  const cargoCode = singleLineText(req.body.cargo, "Что перевозим", 80);
  const cargoType = cargoCode && Object.hasOwn(CARGO_LABELS, cargoCode)
    ? CARGO_LABELS[cargoCode]
    : null;
  const loadersRequired = loadersValue(req.body.loaders);
  const scheduledAt = publicServiceDate(req.body.date);
  const vehicleSlug = safeSlug(req.body.vehicleSlug, "Машина");

  const order = await prisma.$transaction(async (tx) => {
    const client = await upsertClient(tx, {
      phone: req.body.phone,
      name: clientName,
      vehicle: null
    });

    let vehicle = null;
    if (vehicleSlug) {
      vehicle = await tx.vehicle.findFirst({
        where: { slug: vehicleSlug, published: true }
      });
    }

    const vehicleName = vehicle?.name || null;
    const source = "Сайт";

    return tx.order.create({
      data: {
        type: scheduledAt ? "SCHEDULED" : "REGULAR",
        status: "NEW",
        clientId: client.id,
        pickupAddress,
        destinationAddress,
        cargoType,
        loadersRequired,
        vehicle: vehicleName,
        vehicleId: vehicle?.id || null,
        source,
        scheduledAt,
        createdById: null,
        searchText: normalizeSearch(
          client.name,
          client.phone,
          pickupAddress,
          destinationAddress,
          cargoType,
          vehicleName,
          source
        )
      },
      include: {
        client: true,
        vehicleRecord: {
          include: { carrier: true }
        }
      }
    });
  });

  // Заявка уже записана в SQLite; доставка push не блокирует ответ клиенту.
  sendNewOrderNotification(order).catch((error) => {
    console.error("Не удалось отправить Web Push:", error.message);
  });

  return res.status(201).json({
    success: true,
    message: "Заявка принята. Свяжемся с вами в ближайшее время."
  });
}));

module.exports = router;
