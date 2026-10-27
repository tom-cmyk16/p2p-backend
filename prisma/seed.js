import "dotenv/config";
import { prisma } from "../src/config/db.js";

const subjects = [
  {
    name: "Mathematics",
    topics: [
      "Algebra",
      "Geometry",
      "Statistics",
    ],
  },
  {
    name: "Physics",
    topics: [
      "Mechanics",
      "Waves",
      "Electricity",
    ],
  },
  {
    name: "Chemistry",
    topics: [
      "Atomic Structure",
      "Chemical Bonding",
      "Organic Chemistry",
    ],
  },
];

const quizQuestions = [
  {
    subjectName: "Mathematics",
    topicName: "Algebra",
    gradeLevel: "GRADE_10",
    questionText: "What is the value of x in 2x + 4 = 10?",
    explanation: "Subtract 4 from both sides and divide the result by 2.",
    options: [
      { optionText: "2", isCorrect: false },
      { optionText: "3", isCorrect: true },
      { optionText: "4", isCorrect: false },
      { optionText: "5", isCorrect: false },
    ],
  },
  {
    subjectName: "Mathematics",
    topicName: "Algebra",
    gradeLevel: "GRADE_10",
    questionText: "If x = 5, what is the value of 3x?",
    explanation: "Substitute 5 for x: 3 × 5 = 15.",
    options: [
      { optionText: "10", isCorrect: false },
      { optionText: "12", isCorrect: false },
      { optionText: "15", isCorrect: true },
      { optionText: "20", isCorrect: false },
    ],
  },
];

const seed = async () => {
  for (const subjectData of subjects) {
    const subject = await prisma.subject.upsert({
      where: {
        name: subjectData.name,
      },
      update: {},
      create: {
        name: subjectData.name,
      },
    });

    for (const topicName of subjectData.topics) {
      await prisma.topic.upsert({
        where: {
          subjectId_name: {
            subjectId: subject.id,
            name: topicName,
          },
        },
        update: {},
        create: {
          name: topicName,
          subjectId: subject.id,
        },
      });
    }
  }

  for (const questionData of quizQuestions) {
    const subject = await prisma.subject.findUnique({
      where: {
        name: questionData.subjectName,
      },
    });

    if (!subject) {
      throw new Error(
        `Subject "${questionData.subjectName}" not found`
      );
    }

    const topic = await prisma.topic.findUnique({
      where: {
        subjectId_name: {
          subjectId: subject.id,
          name: questionData.topicName,
        },
      },
    });

    if (!topic) {
      throw new Error(
        `Topic "${questionData.topicName}" not found`
      );
    }

    let question = await prisma.question.findFirst({
      where: {
        topicId: topic.id,
        gradeLevel: questionData.gradeLevel,
        questionText: questionData.questionText,
      },
    });

    if (!question) {
      question = await prisma.question.create({
        data: {
          topicId: topic.id,
          gradeLevel: questionData.gradeLevel,
          questionText: questionData.questionText,
          explanation: questionData.explanation,

          options: {
            create: questionData.options,
          },
        },
      });
    }
  }

  console.log("Subject, topic, question, and option seed completed successfully.");
};

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });