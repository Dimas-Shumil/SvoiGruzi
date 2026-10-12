const express = require("express");
const prisma = require("../lib/prisma");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");
const { text, positiveId, enumValue, optionalDate } = require("../lib/validation");

const router = express.Router();
const STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

router.get("/", asyncRoute(async (_req, res) => {
  const tasks = await prisma.task.findMany({
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: 300
  });
  res.json({ success: true, tasks });
}));

router.post("/", asyncRoute(async (req, res) => {
  const status = enumValue(req.body.status, STATUSES, "Статус", "TODO");
  const task = await prisma.task.create({
    data: {
      title: text(req.body.title, "Название", 240, true),
      description: text(req.body.description, "Описание", 2000),
      status,
      priority: enumValue(req.body.priority, PRIORITIES, "Приоритет", "MEDIUM"),
      dueAt: optionalDate(req.body.dueAt, "Срок"),
      completedAt: status === "DONE" ? new Date() : null,
      createdById: req.user.id
    }
  });
  res.status(201).json({ success: true, task });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Задача не найдена", "NOT_FOUND");
  const status = req.body.status !== undefined ? enumValue(req.body.status, STATUSES, "Статус") : existing.status;
  const task = await prisma.task.update({
    where: { id },
    data: {
      title: req.body.title !== undefined ? text(req.body.title, "Название", 240, true) : existing.title,
      description: req.body.description !== undefined ? text(req.body.description, "Описание", 2000) : existing.description,
      status,
      priority: req.body.priority !== undefined ? enumValue(req.body.priority, PRIORITIES, "Приоритет") : existing.priority,
      dueAt: req.body.dueAt !== undefined ? optionalDate(req.body.dueAt, "Срок") : existing.dueAt,
      completedAt: status === "DONE" ? existing.completedAt || new Date() : null
    }
  });
  res.json({ success: true, task });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new HttpError(404, "Задача не найдена", "NOT_FOUND");
  await prisma.task.delete({ where: { id } });
  res.json({ success: true });
}));

module.exports = router;
