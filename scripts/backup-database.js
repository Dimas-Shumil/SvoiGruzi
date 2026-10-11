const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../src/config/env");

async function main() {
  const source = env.databaseUrl.replace(/^file:/, "");
  const absoluteSource = path.resolve(__dirname, "..", "prisma", source.replace(/^\.\//, ""));
  const backupDir = path.resolve(__dirname, "..", "backups");
  await fs.mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `svoi-gruzi-${stamp}.db`);
  await fs.copyFile(absoluteSource, target);

  console.log(target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
