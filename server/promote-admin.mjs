import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const defaultAdminEmail = "jamiecee20.1999@gmail.com";
const configuredAdminEmails = new Set(
  [defaultAdminEmail, ...(process.env.ADMIN_EMAILS ?? "").split(",")]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const email = process.argv[2]?.trim().toLowerCase();

if (!email || !configuredAdminEmails.has(email)) {
  console.error(
    `Usage: node server/promote-admin.mjs ${defaultAdminEmail}`,
  );
  process.exitCode = 2;
} else {
  const databaseFile = resolve(
    process.env.ACCOUNT_DB_FILE ?? "./data/account-progress.sqlite",
  );
  const database = new DatabaseSync(databaseFile);
  try {
    const result = database
      .prepare(
        "UPDATE users SET role = 'admin', account_status = 'active' WHERE email = ? COLLATE NOCASE",
      )
      .run(email);
    if (result.changes === 0) {
      console.error(`No account found for ${email}. Register it first.`);
      process.exitCode = 1;
    } else {
      console.log(`Promoted ${email} to administrator.`);
    }
  } finally {
    database.close();
  }
}
