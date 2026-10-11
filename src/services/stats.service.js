const prisma = require("../lib/prisma");

async function dashboardStats(from, to) {
  const period = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
  const completedWhere = { status: "COMPLETED", ...(period ? { completedAt: period } : {}) };
  const createdWhere = period ? { createdAt: period } : {};

  const [
    completedCount,
    revenue,
    paid,
    expenses,
    requestCount,
    newCount,
    plannedCount,
    clientCount,
    vehicleCount
  ] = await Promise.all([
    prisma.order.count({ where: completedWhere }),
    prisma.order.aggregate({ where: completedWhere, _sum: { amountCents: true } }),
    prisma.order.aggregate({ where: completedWhere, _sum: { paidAmountCents: true } }),
    prisma.expense.aggregate({ where: period ? { occurredAt: period } : {}, _sum: { amountCents: true } }),
    prisma.order.count({ where: createdWhere }),
    prisma.order.count({ where: { status: "NEW" } }),
    prisma.order.count({ where: { status: "PLANNED" } }),
    prisma.client.count({ where: { deletedAt: null } }),
    prisma.vehicle.count()
  ]);

  const revenueCents = revenue._sum.amountCents || 0;
  const paidCents = paid._sum.paidAmountCents || 0;
  const expenseCents = expenses._sum.amountCents || 0;

  return {
    completedCount,
    requestCount,
    newCount,
    plannedCount,
    revenueCents,
    paidCents,
    expenseCents,
    profitCents: paidCents - expenseCents,
    debtCents: Math.max(revenueCents - paidCents, 0),
    averageCheckCents: completedCount ? Math.round(revenueCents / completedCount) : 0,
    clientCount,
    vehicleCount
  };
}

module.exports = { dashboardStats };
