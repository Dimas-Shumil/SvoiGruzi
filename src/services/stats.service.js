const prisma = require('../lib/prisma');

function sum(rows, field) {
  return rows.reduce((total, row) => total + (row[field] || 0), 0);
}

async function periodStats(from, to) {
  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { completedAt: { gte: from, lt: to }, status: 'COMPLETED' },
      select: { amountCents: true, paidAmountCents: true, source: true, completedAt: true },
      orderBy: { completedAt: 'asc' },
    }),
    prisma.expense.findMany({
      where: { occurredAt: { gte: from, lt: to } },
      select: { amountCents: true, category: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    }),
  ]);

  const revenueCents = sum(orders, 'amountCents');
  const paidCents = sum(orders, 'paidAmountCents');
  const expenseCents = sum(expenses, 'amountCents');
  const sourceMap = new Map();
  for (const order of orders) sourceMap.set(order.source, (sourceMap.get(order.source) || 0) + 1);

  return {
    orderCount: orders.length,
    revenueCents,
    paidCents,
    debtCents: Math.max(revenueCents - paidCents, 0),
    expenseCents,
    profitCents: revenueCents - expenseCents,
    averageCheckCents: orders.length ? Math.round(revenueCents / orders.length) : 0,
    sources: [...sourceMap.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}

module.exports = { periodStats };
