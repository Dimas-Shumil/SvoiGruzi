const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const prisma = require("../src/lib/prisma");
const { hashPassword, validPassword, normalizeEmail, validEmail } = require("../src/lib/security");

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    const name = (await rl.question("Имя владельца: ")).trim() || "Владелец";
    const email = normalizeEmail(await rl.question("Email: "));
    const password = await rl.question("Пароль (минимум 12 символов): ");

    if (!validEmail(email)) throw new Error("Укажите корректный email");
    if (!validPassword(password)) throw new Error("Пароль должен содержать 12–128 символов");

    const passwordHash = await hashPassword(password);

    const owner = await prisma.user.upsert({
      where: { email },
      update: { name, passwordHash, role: "OWNER", isActive: true },
      create: { name, email, passwordHash, role: "OWNER" }
    });

    console.log(`OWNER #${owner.id} создан/обновлён.`);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
