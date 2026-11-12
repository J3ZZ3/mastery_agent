import "dotenv/config";
import { closePool } from "../db/postgres.js";
import { setTeacherPlanByEmail } from "../services/planService.js";

const [email, plan, trialEndsAt] = process.argv.slice(2);

const usage = () => {
  console.error(
    [
      "Usage: node server/scripts/setPlan.js <teacher-email> <pilot|paid> [trial-ends-at]",
      "",
      "Examples:",
      "  node server/scripts/setPlan.js teacher@school.example paid",
      "  node server/scripts/setPlan.js teacher@school.example pilot 2026-12-31T00:00:00Z",
      "",
      "A pilot without a trial date expires immediately. Requires DATABASE_URL.",
    ].join("\n"),
  );
};

if (!email || !["pilot", "paid"].includes(plan)) {
  usage();
  process.exit(1);
}

if (trialEndsAt && Number.isNaN(new Date(trialEndsAt).getTime())) {
  console.error(`Invalid trial end date: ${trialEndsAt}`);
  process.exit(1);
}

try {
  const teacher = await setTeacherPlanByEmail({
    email,
    plan,
    trialEndsAt: trialEndsAt || undefined,
  });
  console.log(
    `${teacher.email} is now on the ${teacher.plan} plan${
      teacher.trialEndsAt ? ` (trial ends ${teacher.trialEndsAt})` : ""
    }.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
