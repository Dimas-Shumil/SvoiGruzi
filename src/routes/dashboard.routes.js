const express = require('express');
const prisma = require('../lib/prisma');
const { asyncRoute } = require('../lib/async-route');
const { dateRange } = require('../lib/validation');
const { periodStats } = require('../services/stats.service');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  const { from, to } = dateRange(req.query, 1);
  const [stats, planned, activeTasks, recentOrders, vehicles] = await Promise.all([
    periodStats(from, to),
    prisma.order.findMany({
      where: { status: 'PLANNED', scheduledAt: { gte: new Date() } },
      include: { client: true, vehicleRecord: true },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    }),
    prisma.task.findMany({
      where: { status: { not: 'DONE' } },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      take: 5,
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      include: { client: true, vehicleRecord: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.vehicle.findMany({
      include: { carrier: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: 8,
    }),
  ]);

  res.json({ success: true, from, to, stats, planned, activeTasks, recentOrders, vehicles });
}));

module.exports = router;
