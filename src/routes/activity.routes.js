const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");

const router = express.Router();

router.get("/", asyncRoute(async (_req, res) => {
  const activities = await prisma.activity.findMany({
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  res.json({ success: true, activities });
}));

module.exports = router;
