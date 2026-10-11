const prisma = require("./prisma");

async function recordActivity({ req, actorId, action, entityType, entityId, title, metadata }) {
  try {
    await prisma.activity.create({
      data: {
        actorId: actorId ?? req?.user?.id ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        title,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: req ? String(req.ip || "").slice(0, 80) || null : null
      }
    });
  } catch (error) {
    console.error("activity log error:", error.message);
  }
}

module.exports = { recordActivity };
