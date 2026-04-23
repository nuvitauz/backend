/**
 * One-time cleanup: turn fake "tg_<id>" placeholder numbers into NULL
 * now that `User.number` is nullable. Safe to run multiple times.
 */
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

(async () => {
  try {
    const before = await prisma.user.findMany({
      where: { number: { startsWith: 'tg_' } },
      select: { id: true, number: true, userId: true, fullName: true },
    });
    console.log(`Found ${before.length} placeholder users:`);
    for (const u of before) {
      console.log(`  id=${u.id} number=${u.number} userId=${u.userId} name=${u.fullName || '-'}`);
    }

    if (before.length === 0) {
      console.log('Nothing to clean up.');
      return;
    }

    const result = await prisma.user.updateMany({
      where: { number: { startsWith: 'tg_' } },
      data: { number: null },
    });
    console.log(`Updated ${result.count} rows: number → NULL`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
