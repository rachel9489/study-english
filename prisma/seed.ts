import { PrismaClient } from "@prisma/client";
import { format } from "date-fns";

const prisma = new PrismaClient();

function todayKey(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

function tomorrowKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return format(d, "yyyy-MM-dd");
}

async function main() {
  await prisma.learningSession.deleteMany();
  await prisma.taskItem.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.vocabularyItem.deleteMany();
  await prisma.learningMaterial.deleteMany();
  await prisma.childProfile.deleteMany();

  const child = await prisma.childProfile.create({
    data: { name: "豆豆", phaseWeek: 1, streak: 0 },
  });

  const fruit = await prisma.learningMaterial.create({
    data: {
      title: "Buying Fruit at the Market",
      category: "easy_conversations",
      description: "Easy English Conversations · 买水果",
      scriptText: [
        "A: Good morning! Can I help you?",
        "B: Yes, please. I'd like some apples.",
        "A: How many apples would you like?",
        "B: Six apples, please. And some bananas too.",
        "A: OK. Anything else?",
        "B: No, that's all. How much is it?",
        "A: That will be five dollars.",
        "B: Here you are. Thank you!",
        "A: You're welcome. Have a nice day!",
      ].join("\n"),
      levelTag: "Week 1-2",
      vocabularies: {
        create: [
          { word: "apples", meaning: "苹果", phonetic: "/ˈæplz/" },
          { word: "bananas", meaning: "香蕉", phonetic: "/bəˈnɑːnəz/" },
          { word: "market", meaning: "市场", phonetic: "/ˈmɑːkɪt/" },
          { word: "dollars", meaning: "美元", phonetic: "/ˈdɒləz/" },
          { word: "welcome", meaning: "不客气", phonetic: "/ˈwelkəm/" },
        ],
      },
    },
  });

  const peppa = await prisma.learningMaterial.create({
    data: {
      title: "Peppa Pig: Muddy Puddles",
      category: "peppa",
      description: "小猪佩奇 · 泥坑（示范文本）",
      scriptText: [
        "Narrator: It is raining today.",
        "Peppa: I love rainy days!",
        "George: Dine-saw!",
        "Daddy Pig: Peppa, George, would you like to go outside?",
        "Peppa: Yes, please!",
        "Peppa: Look! A muddy puddle!",
        "Everyone: Jumping up and down in muddy puddles!",
        "Mummy Pig: Oh, Peppa. You are covered in mud.",
        "Peppa: I love muddy puddles!",
      ].join("\n"),
      levelTag: "Week 1-2",
      vocabularies: {
        create: [
          { word: "raining", meaning: "下雨", phonetic: "/ˈreɪnɪŋ/" },
          { word: "muddy", meaning: "泥泞的", phonetic: "/ˈmʌdi/" },
          { word: "puddle", meaning: "水坑", phonetic: "/ˈpʌdl/" },
          { word: "jumping", meaning: "跳", phonetic: "/ˈdʒʌmpɪŋ/" },
          { word: "covered", meaning: "覆盖着", phonetic: "/ˈkʌvəd/" },
        ],
      },
    },
  });

  await prisma.learningMaterial.create({
    data: {
      title: "Robin Hood (Little Fox L4 sample)",
      category: "little_fox",
      description: "第3-4周长段落听力示范",
      scriptText: [
        "Long ago in England, there lived a brave young man named Robin Hood.",
        "He lived in Sherwood Forest with his friends.",
        "Robin Hood took from the rich and gave to the poor.",
        "The Sheriff of Nottingham wanted to catch him.",
        "But Robin was clever and kind, and the people loved him.",
      ].join("\n"),
      levelTag: "L4-L5",
      vocabularies: {
        create: [
          { word: "brave", meaning: "勇敢的", phonetic: "/breɪv/" },
          { word: "forest", meaning: "森林", phonetic: "/ˈfɒrɪst/" },
          { word: "sheriff", meaning: "治安官", phonetic: "/ˈʃerɪf/" },
        ],
      },
    },
  });

  const date = todayKey();
  const tomorrow = tomorrowKey();

  await prisma.dailyPlan.create({
    data: {
      date,
      phaseWeek: 1,
      childId: child.id,
      forceOrder: true,
      nightUnlock: "00:00",
      tasks: {
        create: [
          {
            type: "PREVIEW",
            sortOrder: 1,
            materialId: fruit.id,
            durationMin: 5,
            status: "available",
            progressJson: JSON.stringify({ followedLines: [], vocabOpened: [] }),
          },
          {
            type: "AI_LESSON",
            sortOrder: 2,
            materialId: fruit.id,
            durationMin: 25,
            status: "locked",
            progressJson: JSON.stringify({
              stage: "read_aloud",
              readAloudDone: false,
              retellDone: false,
              qaDone: false,
              qaAnswers: [],
              wrongWords: [],
            }),
          },
          {
            type: "LISTENING_LADDER",
            sortOrder: 3,
            materialId: peppa.id,
            durationMin: 20,
            status: "locked",
            progressJson: JSON.stringify({
              mode: "text_then_blind_x3",
              followDone: false,
              blindPlays: 0,
            }),
          },
          {
            type: "NIGHT_SHADOW",
            sortOrder: 4,
            materialId: fruit.id,
            durationMin: 5,
            status: "locked",
            unlockAfter: "00:00",
            progressJson: JSON.stringify({ plays: 0, required: 3 }),
          },
          {
            type: "BREAKFAST_REVIEW",
            sortOrder: 5,
            materialId: fruit.id,
            durationMin: 5,
            status: "locked",
            scheduledFor: tomorrow,
            progressJson: JSON.stringify({ plays: 0 }),
          },
        ],
      },
    },
  });

  console.log("Seed OK:", { date, preview: fruit.title, listening: peppa.title });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
