const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { optionalDate } = require("../lib/validation");
const { dashboardStats } = require("../services/stats.service");

const router = express.Router();

router.get("/", asyncRoute(async (req, res) => {
  const from = req.query.from ? optionalDate(req.query.from, "Начало периода") : null;
  const to = req.query.to ? optionalDate(req.query.to, "Конец периода") : null;

  const [stats, latestOrders, planned, activeTasks, vehicles] = await Promise.all([
    dashboardStats(from, to),
    prisma.order.findMany({
      include: { client: true, vehicleRecord: true },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.order.findMany({
      where: { status: "PLANNED", scheduledAt: { not: null } },
      include: { client: true, vehicleRecord: true },
      orderBy: { scheduledAt: "asc" },
      take: 5
    }),
    prisma.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: [{ dueAt: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 6
    }),
    prisma.vehicle.findMany({
      include: { carrier: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: 8
    })
  ]);

  res.json({ success: true, stats, latestOrders, planned, activeTasks, vehicles });
}));

module.exports = router;
