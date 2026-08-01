import { PrismaClient } from "@prisma/client";

const base = process.env.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const url = base.includes("connect_timeout=")
  ? base
  : `${base}${base.includes("?") ? "&" : "?"}connect_timeout=30`;

const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const rows = await prisma.$queryRawUnsafe("SELECT 1::int as ok");
  const child = await prisma.childProfile.findFirst();
  console.log("OK", { rows, child: child?.name ?? null });
} catch (e) {
  console.error("FAIL", e.code || "", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
