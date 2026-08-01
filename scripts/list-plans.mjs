import { PrismaClient } from "@prisma/client";
import { format } from "date-fns";

const prisma = new PrismaClient();

const today = format(new Date(), "yyyy-MM-dd");
console.log("serverToday", today, "tzOffset", new Date().getTimezoneOffset());

const plans = await prisma.dailyPlan.findMany({
  include: { tasks: true, child: true },
  orderBy: { date: "desc" },
  take: 5,
});

console.log(
  JSON.stringify(
    plans.map((x) => ({
      date: x.date,
      child: x.child.name,
      tasks: x.tasks.length,
      types: x.tasks.map((t) => t.type),
    })),
    null,
    2,
  ),
);

await prisma.$disconnect();
