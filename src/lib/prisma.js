const { PrismaClient } = require("@prisma/client");

const prisma = global.__svoiGruziPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__svoiGruziPrisma = prisma;
}

module.exports = prisma;
