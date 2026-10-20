import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import packSetConfig from "../config/pack-sets.json" with { type: "json" };

const PORT = Number(process.env.PORT ?? 3002);
const DATABASE_FILE = resolve(
  process.env.ACCOUNT_DB_FILE ?? "./data/account-progress.sqlite",
);
const COOKIE_NAME = "card_atlas_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SET_AVAILABILITY_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 32 * 1024;
const COOKIE_SECURE =
  process.env.ACCOUNT_COOKIE_SECURE === "true" ||
  (process.env.ACCOUNT_COOKIE_SECURE !== "false" &&
    process.env.NODE_ENV === "production");
const scryptAsync = promisify(scrypt);
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const AVATARS = ["⚡", "🔥", "🌿", "💧", "⭐", "👾"];
const RARITIES = new Set([
  "common",
  "uncommon",
  "rare",
  "aceSpecRare",
  "doubleRare",
  "ultraRare",
  "shinyRare",
  "shinyUltraRare",
  "illustrationRare",
  "specialIllustrationRare",
  "hyperRare",
  "megaAttackRare",
  "megaHyperRare",
  "blackWhiteRare",
  "classicCollection",
  "futureRare",
  "pikachu",
  "energy",
]);
const FULL_ART_RARITIES = new Set([
  "ultraRare",
  "illustrationRare",
  "specialIllustrationRare",
  "hyperRare",
  "megaAttackRare",
  "megaHyperRare",
  "shinyUltraRare",
  "blackWhiteRare",
  "futureRare",
]);
const GOD_PACK_RARITIES = new Set([
  "illustrationRare",
  "ultraRare",
  "shinyUltraRare",
  "megaAttackRare",
  "specialIllustrationRare",
  "hyperRare",
  "megaHyperRare",
  "blackWhiteRare",
  "futureRare",
]);
const GOD_PACK_BASE_XP_COST = 1_000;
const GOD_PACK_XP_COST_STEP = 500;
const GOD_PACK_DEFAULT_LIMIT = 1;
const GOD_PACK_DEFAULT_WINDOW_DAYS = 7;
const GOD_PACK_FREE_UNLOCK_CHANCE = 1 / 1_000;
const PACK_SET_DEFINITIONS = packSetConfig;
let PACK_SETS = PACK_SET_DEFINITIONS;
const setAvailabilityCache = new Map();
const authAttempts = new Map();
const authWindowMs = 15 * 60 * 1000;
const authAttemptLimit = 12;
const DUMMY_SALT = Buffer.from("card-atlas-dummy-salt", "utf8");
const DUMMY_HASH = Buffer.alloc(64, 7);

await mkdir(dirname(DATABASE_FILE), { recursive: true });
const database = new DatabaseSync(DATABASE_FILE);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('pending_approval', 'active', 'suspended'))
  ) STRICT;

  CREATE TABLE IF NOT EXISTS account_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS user_progress (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0),
    lifetime_xp INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_xp >= 0),
    streak_days INTEGER NOT NULL DEFAULT 0 CHECK(streak_days >= 0),
    last_activity_date TEXT,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS user_unlocks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY(user_id, set_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS user_collection (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    first_collected_at TEXT NOT NULL,
    PRIMARY KEY(user_id, set_id, card_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    PRIMARY KEY(user_id, achievement_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS pack_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    total_cards INTEGER NOT NULL CHECK(total_cards BETWEEN 1 AND 20),
    pack_type TEXT NOT NULL DEFAULT 'standard' CHECK(pack_type IN ('standard', 'god')),
    revealed_count INTEGER NOT NULL DEFAULT 0 CHECK(revealed_count >= 0),
    complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0, 1)),
    started_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS pack_sessions_user_idx ON pack_sessions(user_id, started_at);

  CREATE TABLE IF NOT EXISTS god_pack_purchases (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    pack_id TEXT NOT NULL UNIQUE REFERENCES pack_sessions(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    PRIMARY KEY(user_id, week_start)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS god_pack_purchase_history (
    purchase_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL UNIQUE REFERENCES pack_sessions(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    purchased_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS god_pack_history_user_set_time_idx
    ON god_pack_purchase_history(user_id, set_id, purchased_at);

  CREATE TABLE IF NOT EXISTS god_pack_free_credits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL,
    source_pack_id TEXT NOT NULL UNIQUE REFERENCES pack_sessions(id) ON DELETE CASCADE,
    redeemed_by_pack_id TEXT UNIQUE REFERENCES pack_sessions(id) ON DELETE SET NULL,
    awarded_at TEXT NOT NULL,
    redeemed_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS god_pack_free_credits_user_set_idx
    ON god_pack_free_credits(user_id, set_id, redeemed_at);

  CREATE TABLE IF NOT EXISTS pack_reveals (
    pack_id TEXT NOT NULL REFERENCES pack_sessions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0),
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    finish TEXT NOT NULL CHECK(finish IN ('normal', 'holo', 'reverse')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(pack_id, position)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS pack_set_settings (
    set_id TEXT PRIMARY KEY,
    xp_cost INTEGER NOT NULL CHECK(xp_cost BETWEEN 0 AND 1000000),
    sort_order INTEGER NOT NULL,
    god_pack_xp_cost INTEGER NOT NULL DEFAULT 1000 CHECK(god_pack_xp_cost BETWEEN 0 AND 1000000),
    god_pack_limit INTEGER NOT NULL DEFAULT 1 CHECK(god_pack_limit BETWEEN 1 AND 100),
    god_pack_window_days INTEGER NOT NULL DEFAULT 7 CHECK(god_pack_window_days BETWEEN 1 AND 3650)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS admin_audit_created_idx
    ON admin_audit_log(created_at DESC);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
    );
  }
}

ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
ensureColumn("users", "account_status", "TEXT NOT NULL DEFAULT 'active'");
ensureColumn(
  "user_progress",
  "lifetime_xp",
  "INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_xp >= 0)",
);
ensureColumn(
  "pack_sessions",
  "pack_type",
  "TEXT NOT NULL DEFAULT 'standard' CHECK(pack_type IN ('standard', 'god'))",
);
ensureColumn(
  "pack_set_settings",
  "god_pack_xp_cost",
  "INTEGER NOT NULL DEFAULT 1000 CHECK(god_pack_xp_cost BETWEEN 0 AND 1000000)",
);
ensureColumn(
  "pack_set_settings",
  "god_pack_limit",
  "INTEGER NOT NULL DEFAULT 1 CHECK(god_pack_limit BETWEEN 1 AND 100)",
);
ensureColumn(
  "pack_set_settings",
  "god_pack_window_days",
  "INTEGER NOT NULL DEFAULT 7 CHECK(god_pack_window_days BETWEEN 1 AND 3650)",
);
database
  .prepare(
    "UPDATE users SET account_status = 'pending_approval' WHERE account_status = 'pending_email'",
  )
  .run();

const seedPackSetSetting = database.prepare(
  `INSERT OR IGNORE INTO pack_set_settings
    (set_id, xp_cost, sort_order, god_pack_xp_cost, god_pack_limit, god_pack_window_days)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
PACK_SET_DEFINITIONS.forEach((set, index) => {
  const settingExists = database
    .prepare("SELECT 1 FROM pack_set_settings WHERE set_id = ?")
    .get(set.id);
  if (settingExists) return;
  const currentCount =
    database.prepare("SELECT COUNT(*) AS count FROM pack_set_settings").get()
      ?.count ?? 0;
  const highestOrder = database
    .prepare("SELECT MAX(sort_order) AS highest FROM pack_set_settings")
    .get()?.highest;
  const nextOrder =
    currentCount === 0 ? (index + 1) * 100 : (highestOrder ?? 0) + 100;
  seedPackSetSetting.run(
    set.id,
    set.xpCost,
    nextOrder,
    GOD_PACK_BASE_XP_COST +
      Math.floor(Math.max(currentCount, index) / 3) * GOD_PACK_XP_COST_STEP,
    GOD_PACK_DEFAULT_LIMIT,
    GOD_PACK_DEFAULT_WINDOW_DAYS,
  );
});

database
  .prepare(
    `INSERT OR IGNORE INTO god_pack_purchase_history
      (purchase_id, user_id, pack_id, set_id, purchased_at)
     SELECT pack_id, user_id, pack_id, set_id, purchased_at
     FROM god_pack_purchases`,
  )
  .run();

const GOD_PACK_SETTINGS_MIGRATION_ID = "2026-10-per-set-god-pack-settings-v1";
if (
  !database
    .prepare("SELECT 1 FROM account_migrations WHERE migration_id = ?")
    .get(GOD_PACK_SETTINGS_MIGRATION_ID)
) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const configuredSetIds = new Set(PACK_SET_DEFINITIONS.map((set) => set.id));
    const rows = database
      .prepare("SELECT set_id FROM pack_set_settings ORDER BY sort_order")
      .all()
      .filter((row) => configuredSetIds.has(row.set_id));
    const updateGodPackDefaults = database.prepare(
      "UPDATE pack_set_settings SET god_pack_xp_cost = ?, god_pack_limit = ?, god_pack_window_days = ? WHERE set_id = ?",
    );
    rows.forEach((row, index) => {
      updateGodPackDefaults.run(
        GOD_PACK_BASE_XP_COST +
          Math.floor(index / 3) * GOD_PACK_XP_COST_STEP,
        GOD_PACK_DEFAULT_LIMIT,
        GOD_PACK_DEFAULT_WINDOW_DAYS,
        row.set_id,
      );
    });
    database
      .prepare(
        "INSERT INTO account_migrations (migration_id, applied_at) VALUES (?, ?)",
      )
      .run(GOD_PACK_SETTINGS_MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getConfiguredPackSets() {
  const settings = new Map(
    database
      .prepare(
        `SELECT set_id, xp_cost, sort_order, god_pack_xp_cost,
                god_pack_limit, god_pack_window_days
         FROM pack_set_settings`,
      )
      .all()
      .map((row) => [row.set_id, row]),
  );
  return PACK_SET_DEFINITIONS.map((set, index) => ({
    ...set,
    xpCost: settings.get(set.id)?.xp_cost ?? set.xpCost,
    sortOrder: settings.get(set.id)?.sort_order ?? (index + 1) * 100,
    godPackXpCost:
      settings.get(set.id)?.god_pack_xp_cost ?? GOD_PACK_BASE_XP_COST,
    godPackLimit:
      settings.get(set.id)?.god_pack_limit ?? GOD_PACK_DEFAULT_LIMIT,
    godPackWindowDays:
      settings.get(set.id)?.god_pack_window_days ?? GOD_PACK_DEFAULT_WINDOW_DAYS,
  })).sort((left, right) => left.sortOrder - right.sortOrder);
}

PACK_SETS = getConfiguredPackSets();

const PROGRESSION_ORDER_RESET_ID = "2026-10-pack-order-xp-reset-v1";
if (
  !database
    .prepare("SELECT 1 FROM account_migrations WHERE migration_id = ?")
    .get(PROGRESSION_ORDER_RESET_ID)
) {
  const migratedAt = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare("UPDATE user_progress SET xp = 0, updated_at = ?")
      .run(migratedAt);
    database.exec("DELETE FROM user_unlocks; DELETE FROM user_achievements;");
    const addStarterUnlock = database.prepare(
      "INSERT INTO user_unlocks (user_id, set_id, unlocked_at) VALUES (?, ?, ?)",
    );
    for (const user of database.prepare("SELECT id FROM users").all()) {
      addStarterUnlock.run(user.id, PACK_SETS[0].id, migratedAt);
    }
    database
      .prepare(
        "INSERT INTO account_migrations (migration_id, applied_at) VALUES (?, ?)",
      )
      .run(PROGRESSION_ORDER_RESET_ID, migratedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const LIFETIME_XP_MIGRATION_ID = "2026-10-lifetime-xp-v1";
if (
  !database
    .prepare("SELECT 1 FROM account_migrations WHERE migration_id = ?")
    .get(LIFETIME_XP_MIGRATION_ID)
) {
  const migratedAt = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `UPDATE user_progress
         SET lifetime_xp = xp + COALESCE((
           SELECT SUM(pack_set_settings.xp_cost)
           FROM user_unlocks
           JOIN pack_set_settings ON pack_set_settings.set_id = user_unlocks.set_id
           WHERE user_unlocks.user_id = user_progress.user_id
         ), 0)`,
      )
      .run();
    database
      .prepare(
        "INSERT INTO account_migrations (migration_id, applied_at) VALUES (?, ?)",
      )
      .run(LIFETIME_XP_MIGRATION_ID, migratedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const statement = {
  findUserByEmail: database.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
  ),
  findUserById: database.prepare("SELECT * FROM users WHERE id = ?"),
  insertUser: database.prepare(
    "INSERT INTO users (id, email, password_salt, password_hash, first_name, avatar, created_at, role, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  insertProgress: database.prepare(
    "INSERT INTO user_progress (user_id, updated_at) VALUES (?, ?)",
  ),
  getProgress: database.prepare(
    "SELECT * FROM user_progress WHERE user_id = ?",
  ),
  updateProgress: database.prepare(
    "UPDATE user_progress SET xp = ?, lifetime_xp = ?, streak_days = ?, last_activity_date = ?, updated_at = ? WHERE user_id = ?",
  ),
  listUnlocks: database.prepare(
    "SELECT set_id, unlocked_at FROM user_unlocks WHERE user_id = ? ORDER BY unlocked_at, set_id",
  ),
  insertUnlock: database.prepare(
    "INSERT OR IGNORE INTO user_unlocks (user_id, set_id, unlocked_at) VALUES (?, ?, ?)",
  ),
  hasUnlock: database.prepare(
    "SELECT 1 AS unlocked FROM user_unlocks WHERE user_id = ? AND set_id = ?",
  ),
  listCollection: database.prepare(
    "SELECT set_id, card_id FROM user_collection WHERE user_id = ? ORDER BY set_id, card_id",
  ),
  addCollectionCard: database.prepare(
    "INSERT OR IGNORE INTO user_collection (user_id, set_id, card_id, first_collected_at) VALUES (?, ?, ?, ?)",
  ),
  listAchievements: database.prepare(
    "SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = ? ORDER BY earned_at",
  ),
  hasAchievement: database.prepare(
    "SELECT 1 AS earned FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
  ),
  addAchievement: database.prepare(
    "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at) VALUES (?, ?, ?)",
  ),
  getPack: database.prepare(
    "SELECT * FROM pack_sessions WHERE id = ? AND user_id = ?",
  ),
  insertPack: database.prepare(
    "INSERT INTO pack_sessions (id, user_id, set_id, total_cards, pack_type, started_at) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  listGodPackPurchasesInWindow: database.prepare(
    `SELECT COUNT(*) AS count, MIN(purchased_at) AS oldest
     FROM god_pack_purchase_history
     WHERE user_id = ? AND set_id = ? AND purchased_at >= ?`,
  ),
  insertGodPackPurchase: database.prepare(
    `INSERT INTO god_pack_purchase_history
      (purchase_id, user_id, pack_id, set_id, purchased_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  countAvailableGodPackCredits: database.prepare(
    "SELECT COUNT(*) AS count FROM god_pack_free_credits WHERE user_id = ? AND set_id = ? AND redeemed_by_pack_id IS NULL",
  ),
  getAvailableGodPackCredit: database.prepare(
    `SELECT id FROM god_pack_free_credits
     WHERE user_id = ? AND set_id = ? AND redeemed_by_pack_id IS NULL
     ORDER BY awarded_at LIMIT 1`,
  ),
  insertGodPackFreeCredit: database.prepare(
    `INSERT INTO god_pack_free_credits
      (id, user_id, set_id, source_pack_id, awarded_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  redeemGodPackFreeCredit: database.prepare(
    `UPDATE god_pack_free_credits
     SET redeemed_by_pack_id = ?, redeemed_at = ?
     WHERE id = ? AND redeemed_by_pack_id IS NULL`,
  ),
  hasGodPackAwardFromPack: database.prepare(
    "SELECT 1 AS awarded FROM god_pack_free_credits WHERE source_pack_id = ?",
  ),
  insertReveal: database.prepare(
    "INSERT INTO pack_reveals (pack_id, position, card_id, rarity, finish, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  getReveal: database.prepare(
    "SELECT card_id, rarity, finish FROM pack_reveals WHERE pack_id = ? AND position = ?",
  ),
  updatePack: database.prepare(
    "UPDATE pack_sessions SET revealed_count = ?, complete = ?, completed_at = ? WHERE id = ?",
  ),
  createSession: database.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ),
  getSessionUser: database.prepare(
    "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  ),
  deleteSession: database.prepare("DELETE FROM sessions WHERE token_hash = ?"),
  updateProfile: database.prepare(
    "UPDATE users SET first_name = ?, avatar = ? WHERE id = ?",
  ),
  updatePassword: database.prepare(
    "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
  ),
  getUserSessions: database.prepare(
    "SELECT token_hash FROM sessions WHERE user_id = ? AND token_hash != ?",
  ),
};

database
  .prepare("DELETE FROM sessions WHERE expires_at <= ?")
  .run(new Date().toISOString());
database
  .prepare("DELETE FROM pack_sessions WHERE started_at < ?")
  .run(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

function ulid() {
  const timestamp = BigInt(Date.now());
  let timeValue = timestamp;
  let randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  const timePart = Array.from({ length: 10 }, () => {
    const digit = Number(timeValue & 31n);
    timeValue >>= 5n;
    return ULID_ALPHABET[digit];
  })
    .reverse()
    .join("");
  const randomPart = Array.from({ length: 16 }, () => {
    const digit = Number(randomValue & 31n);
    randomValue >>= 5n;
    return ULID_ALPHABET[digit];
  })
    .reverse()
    .join("");
  return `${timePart}${randomPart}`;
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sendError(response, status, message, code) {
  sendJson(response, status, { error: message, code });
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      error.code = "payload_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Expected a JSON object.");
    }
    return parsed;
  } catch (error) {
    if (error.status) throw error;
    const invalid = new Error("Request body must be valid JSON.");
    invalid.status = 400;
    invalid.code = "invalid_json";
    throw invalid;
  }
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    cookies.set(
      part.slice(0, separator).trim(),
      part.slice(separator + 1).trim(),
    );
  }
  return cookies;
}

function sessionCookie(token, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return `${COOKIE_NAME}=${token}; Path=/api/account; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${COOKIE_SECURE ? "; Secure" : ""}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  statement.createSession.run(
    sha256(token),
    userId,
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    now.toISOString(),
  );
  return token;
}

function getCurrentUser(request) {
  const token = parseCookies(request.headers.cookie).get(COOKIE_NAME);
  if (!token || token.length > 128) return null;
  return (
    statement.getSessionUser.get(sha256(token), new Date().toISOString()) ??
    null
  );
}

function checkSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function enforceRateLimit(key, limit = authAttemptLimit) {
  const now = Date.now();
  const recent = (authAttempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < authWindowMs,
  );
  recent.push(now);
  authAttempts.set(key, recent);
  if (authAttempts.size > 1_000) {
    for (const [attemptKey, timestamps] of authAttempts) {
      if (timestamps.every((timestamp) => now - timestamp >= authWindowMs)) {
        authAttempts.delete(attemptKey);
      }
    }
  }
  if (recent.length > limit) {
    const error = new Error(
      "Too many sign-in attempts. Please try again later.",
    );
    error.status = 429;
    error.code = "auth_rate_limited";
    throw error;
  }
}

function requestIp(request) {
  const forwarded = request.headers["x-real-ip"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const address = typeof candidate === "string" ? candidate.trim() : "";
  return isIP(address) ? address : (request.socket.remoteAddress ?? "unknown");
}

function recordAdminAction(admin, action, targetType, targetId, details) {
  database
    .prepare(
      "INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      ulid(),
      admin.id,
      action,
      targetType,
      targetId,
      JSON.stringify(details),
      new Date().toISOString(),
    );
}

async function hashPassword(password, salt = randomBytes(16)) {
  const derived = await scryptAsync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return { salt, hash: Buffer.from(derived) };
}

async function verifyPassword(password, saltHex, hashHex) {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = Buffer.from(
    await scryptAsync(password, salt, expected.length, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getGodPackStatus(userId, setId, now = new Date()) {
  const set = PACK_SETS.find((candidate) => candidate.id === setId);
  if (!set) return null;
  const windowMs = set.godPackWindowDays * 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs).toISOString();
  const usage = statement.listGodPackPurchasesInWindow.get(
    userId,
    setId,
    windowStart,
  );
  const openedInWindow = usage?.count ?? 0;
  const availableAt =
    openedInWindow >= set.godPackLimit && usage?.oldest
      ? new Date(Date.parse(usage.oldest) + windowMs).toISOString()
      : null;
  return {
    limit: set.godPackLimit,
    windowDays: set.godPackWindowDays,
    openedInWindow,
    remaining: Math.max(set.godPackLimit - openedInWindow, 0),
    availableAt,
    freeCredits:
      statement.countAvailableGodPackCredits.get(userId, setId)?.count ?? 0,
  };
}

function rollsFreeGodPackUnlock() {
  const roll = randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
  return roll < GOD_PACK_FREE_UNLOCK_CHANCE;
}

function snapshot(user) {
  const progress = statement.getProgress.get(user.id);
  const today = new Date().toISOString().slice(0, 10);
  const streakIsActive =
    progress?.last_activity_date === today ||
    progress?.last_activity_date === yesterdayUtc(today);
  const collections = {};
  for (const row of statement.listCollection.all(user.id)) {
    (collections[row.set_id] ??= []).push(row.card_id);
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      avatar: user.avatar,
      role: user.role,
      accountStatus: user.account_status,
    },
    progression: {
      xp: progress?.xp ?? 0,
      lifetimeXp: progress?.lifetime_xp ?? 0,
      godPack: Object.fromEntries(
        PACK_SETS.map((set) => [set.id, getGodPackStatus(user.id, set.id)]),
      ),
      streakDays: streakIsActive ? (progress?.streak_days ?? 0) : 0,
      lastActivityDate: progress?.last_activity_date ?? null,
      unlockedSets: statement.listUnlocks.all(user.id).map((row) => ({
        setId: row.set_id,
        unlockedAt: row.unlocked_at,
      })),
      collections,
      achievements: statement.listAchievements.all(user.id).map((row) => ({
        id: row.achievement_id,
        earnedAt: row.earned_at,
      })),
    },
  };
}

function addXp(userId, amount) {
  if (amount <= 0) return;
  const row = statement.getProgress.get(userId);
  statement.updateProgress.run(
    (row?.xp ?? 0) + amount,
    (row?.lifetime_xp ?? 0) + amount,
    row?.streak_days ?? 0,
    row?.last_activity_date ?? null,
    new Date().toISOString(),
    userId,
  );
}

function awardAchievement(userId, achievementId, xp) {
  const result = statement.addAchievement.run(
    userId,
    achievementId,
    new Date().toISOString(),
  );
  if (result.changes > 0 && xp > 0) addXp(userId, xp);
  return result.changes > 0;
}

function yesterdayUtc(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function claimDailyStreak(userId) {
  const progress = statement.getProgress.get(userId);
  const today = new Date().toISOString().slice(0, 10);
  if (progress?.last_activity_date === today) {
    return { xp: 0, streakDays: progress.streak_days, claimed: false };
  }
  const streakDays =
    progress?.last_activity_date === yesterdayUtc(today)
      ? (progress.streak_days ?? 0) + 1
      : 1;
  const xp = 5 + Math.min(streakDays - 1, 5) * 2;
  statement.updateProgress.run(
    (progress?.xp ?? 0) + xp,
    (progress?.lifetime_xp ?? 0) + xp,
    streakDays,
    today,
    new Date().toISOString(),
    userId,
  );
  return { xp, streakDays, claimed: true, date: today };
}

async function fetchSetMetadata(setId) {
  const response = await fetch(
    `https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(setId)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`TCGdex set lookup failed (${response.status}).`);
  }
  const data = await response.json();
  return typeof data === "object" && data !== null ? data : null;
}

async function getSetAvailability() {
  PACK_SETS = getConfiguredPackSets();
  const now = Date.now();
  const allFresh = PACK_SETS.every((set) => {
    const entry = setAvailabilityCache.get(set.id);
    return entry && now - entry.checkedAt < SET_AVAILABILITY_TTL_MS;
  });
  if (allFresh) {
    return PACK_SETS.map((set) => ({
      ...setAvailabilityCache.get(set.id).result,
      xpCost: set.xpCost,
      sortOrder: set.sortOrder,
      godPackXpCost: set.godPackXpCost,
      godPackLimit: set.godPackLimit,
      godPackWindowDays: set.godPackWindowDays,
    }));
  }
  const concurrency = 4;
  for (let offset = 0; offset < PACK_SETS.length; offset += concurrency) {
    await Promise.all(
      PACK_SETS.slice(offset, offset + concurrency).map(async (set) => {
        const cached = setAvailabilityCache.get(set.id);
        if (cached && now - cached.checkedAt < SET_AVAILABILITY_TTL_MS) return;
        try {
          const [primary, ...extras] = await Promise.all([
            fetchSetMetadata(set.id),
            ...set.extras.map(fetchSetMetadata),
          ]);
          const allRecords = [primary, ...extras];
          const available = allRecords.every(
            (record) =>
              record &&
              Array.isArray(record.cards) &&
              record.cards.length > 0 &&
              record.cards.every(
                (card) =>
                  typeof card.id === "string" &&
                  typeof card.image === "string" &&
                  card.image.startsWith("https://assets.tcgdex.net/"),
              ),
          );
          setAvailabilityCache.set(set.id, {
            checkedAt: now,
            cardIds: new Set(
              allRecords.flatMap((record) =>
                Array.isArray(record?.cards)
                  ? record.cards
                      .map((card) => card.id)
                      .filter((id) => typeof id === "string")
                  : [],
              ),
            ),
            result: {
              setId: set.id,
              name: set.name,
              available,
            },
          });
        } catch {
          const previous = setAvailabilityCache.get(set.id);
          setAvailabilityCache.set(set.id, {
            checkedAt: now - SET_AVAILABILITY_TTL_MS + 60_000,
            cardIds: previous?.cardIds ?? new Set(),
            result: previous?.result ?? {
              setId: set.id,
              name: set.name,
              available: null,
            },
          });
        }
      }),
    );
  }
  return PACK_SETS.map((set) => ({
    ...setAvailabilityCache.get(set.id).result,
    xpCost: set.xpCost,
    sortOrder: set.sortOrder,
    godPackXpCost: set.godPackXpCost,
    godPackLimit: set.godPackLimit,
    godPackWindowDays: set.godPackWindowDays,
  }));
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateProfile(firstName, avatar) {
  const normalizedFirstName =
    typeof firstName === "string" ? firstName.trim() : "";
  if (normalizedFirstName.length < 1 || normalizedFirstName.length > 40) {
    const error = new Error("First name must be between 1 and 40 characters.");
    error.status = 400;
    error.code = "invalid_first_name";
    throw error;
  }
  if (avatar !== null && avatar !== undefined && !AVATARS.includes(avatar)) {
    const error = new Error("Choose one of the available avatar icons.");
    error.status = 400;
    error.code = "invalid_avatar";
    throw error;
  }
  return { firstName: normalizedFirstName, avatar: avatar ?? null };
}

function availableSet(setId, availability) {
  return availability.find((set) => set.setId === setId && set.available === true);
}

function setAvailabilityFor(setId, availability) {
  return availability.find((set) => set.setId === setId);
}

function validCardId(setId, cardId) {
  if (setId === "30th" && cardId.startsWith("30th-c-")) return true;
  if (cardId.startsWith("sim-energy-"))
    return /^sim-energy-[a-z]+$/.test(cardId);
  return cardId.startsWith(`${setId}-`) && /^[a-z0-9.-]+$/i.test(cardId);
}

function transaction(callback) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function requireAuthenticated(request, response) {
  const user = getCurrentUser(request);
  if (!user || user.account_status !== "active") {
    sendError(
      response,
      401,
      "Sign in to save pack progress.",
      "unauthenticated",
    );
    return null;
  }
  return user;
}

function requireAdmin(request, response) {
  const user = requireAuthenticated(request, response);
  if (!user) return null;
  if (user.role !== "admin") {
    sendError(
      response,
      403,
      "Administrator access is required.",
      "admin_required",
    );
    return null;
  }
  return user;
}

function getAdminUserRows() {
  return database
    .prepare(
      `SELECT users.id, users.email, users.first_name, users.avatar, users.role,
              users.account_status, users.created_at,
              COALESCE(user_progress.xp, 0) AS xp,
              COALESCE(user_progress.streak_days, 0) AS streak_days,
              (SELECT COUNT(*) FROM user_unlocks WHERE user_unlocks.user_id = users.id) AS unlocked_sets,
              (SELECT COUNT(*) FROM user_collection WHERE user_collection.user_id = users.id) AS collected_cards
       FROM users
       LEFT JOIN user_progress ON user_progress.user_id = users.id
       ORDER BY users.created_at DESC
       LIMIT 500`,
    )
    .all()
    .map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      avatar: user.avatar,
      role: user.role,
      status: user.account_status,
      createdAt: user.created_at,
      xp: user.xp,
      streakDays: user.streak_days,
      unlockedSets: user.unlocked_sets,
      collectedCards: user.collected_cards,
    }));
}

function getAdminOverview() {
  const counts = database
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN account_status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_approval,
              SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM users`,
    )
    .get();
  return { users: counts };
}

function getAdminSetRows() {
  const availability = new Map(
    PACK_SETS.map((set) => [set.id, setAvailabilityCache.get(set.id)?.result]),
  );
  return PACK_SETS.map((set) => ({
    setId: set.id,
    name: set.name,
    xpCost: set.xpCost,
    sortOrder: set.sortOrder,
    godPackXpCost: set.godPackXpCost,
    godPackLimit: set.godPackLimit,
    godPackWindowDays: set.godPackWindowDays,
    available: availability.get(set.id)?.available ?? false,
  }));
}

function apiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const path = requestUrl.pathname;

  if (request.method === "GET" && path === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok\n");
    return;
  }

  if (request.method === "GET" && path === "/api/account/sets") {
    sendJson(response, 200, { sets: await getSetAvailability() });
    return;
  }

  if (request.method === "GET" && path === "/api/account/me") {
    const user = getCurrentUser(request);
    sendJson(response, 200, { account: user ? snapshot(user) : null });
    return;
  }

  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method ?? "") &&
    !checkSameOrigin(request)
  ) {
    sendError(
      response,
      403,
      "This request did not come from this site.",
      "origin_rejected",
    );
    return;
  }

  try {
    if (path.startsWith("/api/account/admin/")) {
      const admin = requireAdmin(request, response);
      if (!admin) return;

      if (request.method === "GET" && path === "/api/account/admin/overview") {
        sendJson(response, 200, { overview: getAdminOverview() });
        return;
      }
      if (request.method === "GET" && path === "/api/account/admin/users") {
        sendJson(response, 200, { users: getAdminUserRows() });
        return;
      }
      if (request.method === "GET" && path === "/api/account/admin/sets") {
        await getSetAvailability();
        sendJson(response, 200, { sets: getAdminSetRows() });
        return;
      }
      if (request.method === "GET" && path === "/api/account/admin/audit") {
        const entries = database
          .prepare(
            `SELECT admin_audit_log.id, admin_audit_log.action,
                    admin_audit_log.target_type, admin_audit_log.target_id,
                    admin_audit_log.details_json, admin_audit_log.created_at,
                    users.email AS admin_email
             FROM admin_audit_log
             JOIN users ON users.id = admin_audit_log.admin_user_id
             ORDER BY admin_audit_log.created_at DESC
             LIMIT 100`,
          )
          .all()
          .map((entry) => ({
            id: entry.id,
            action: entry.action,
            targetType: entry.target_type,
            targetId: entry.target_id,
            details: JSON.parse(entry.details_json),
            createdAt: entry.created_at,
            adminEmail: entry.admin_email,
          }));
        sendJson(response, 200, { entries });
        return;
      }

      const userStatusMatch = path.match(
        /^\/api\/account\/admin\/users\/([^/]+)$/,
      );
      if (request.method === "PATCH" && userStatusMatch) {
        const targetId = decodeURIComponent(userStatusMatch[1]);
        const body = await readJson(request);
        const action = typeof body.action === "string" ? body.action : "";
        const target = statement.findUserById.get(targetId);
        if (!target)
          throw apiError("Account not found.", 404, "user_not_found");
        if (target.id === admin.id) {
          throw apiError(
            "You cannot change your own account status.",
            400,
            "self_admin_change",
          );
        }
        if (!["approve", "suspend", "reactivate"].includes(action)) {
          throw apiError(
            "Choose a valid account action.",
            400,
            "invalid_admin_action",
          );
        }
        if (action === "approve" || action === "reactivate") {
          transaction(() => {
            database
              .prepare(
                "UPDATE users SET account_status = 'active' WHERE id = ?",
              )
              .run(target.id);
            recordAdminAction(admin, action, "user", target.id, {
              previousStatus: target.account_status,
              status: "active",
            });
          });
        } else {
          if (target.role === "admin") {
            const otherAdmins =
              database
                .prepare(
                  "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND account_status = 'active' AND id != ?",
                )
                .get(target.id)?.count ?? 0;
            if (otherAdmins === 0) {
              throw apiError(
                "The last active administrator cannot be suspended.",
                409,
                "last_admin",
              );
            }
          }
          transaction(() => {
            database
              .prepare(
                "UPDATE users SET account_status = 'suspended' WHERE id = ?",
              )
              .run(target.id);
            database
              .prepare("DELETE FROM sessions WHERE user_id = ?")
              .run(target.id);
            recordAdminAction(admin, action, "user", target.id, {
              previousStatus: target.account_status,
              status: "suspended",
            });
          });
        }
        sendJson(response, 200, {
          user: getAdminUserRows().find((user) => user.id === target.id),
        });
        return;
      }

      const xpMatch = path.match(/^\/api\/account\/admin\/users\/([^/]+)\/xp$/);
      if (request.method === "PATCH" && xpMatch) {
        const targetId = decodeURIComponent(xpMatch[1]);
        const body = await readJson(request);
        const xp = Number(body.xp);
        const reason =
          typeof body.reason === "string"
            ? body.reason.trim().slice(0, 240)
            : "";
        const target = statement.findUserById.get(targetId);
        if (!target)
          throw apiError("Account not found.", 404, "user_not_found");
        if (!Number.isInteger(xp) || xp < 0 || xp > 1_000_000) {
          throw apiError(
            "XP must be a whole number from 0 to 1,000,000.",
            400,
            "invalid_xp",
          );
        }
        const progress = statement.getProgress.get(target.id);
        const previousXp = progress?.xp ?? 0;
        const previousLifetimeXp = progress?.lifetime_xp ?? 0;
        transaction(() => {
          statement.updateProgress.run(
            xp,
            Math.max(previousLifetimeXp, xp),
            progress?.streak_days ?? 0,
            progress?.last_activity_date ?? null,
            new Date().toISOString(),
            target.id,
          );
          recordAdminAction(admin, "set_user_xp", "user", target.id, {
            previousXp,
            previousLifetimeXp,
            xp,
            reason,
          });
        });
        sendJson(response, 200, {
          user: getAdminUserRows().find((user) => user.id === target.id),
        });
        return;
      }

      if (request.method === "PUT" && path === "/api/account/admin/sets") {
        const body = await readJson(request);
        if (
          !Array.isArray(body.sets) ||
          body.sets.length !== PACK_SET_DEFINITIONS.length
        ) {
          throw apiError(
            "Set configuration must include every configured set.",
            400,
            "invalid_set_config",
          );
        }
        const seen = new Set();
        const nextSettings = body.sets.map((row) => {
          if (
            !row ||
            typeof row.setId !== "string" ||
            !PACK_SET_DEFINITIONS.some((set) => set.id === row.setId)
          ) {
            throw apiError(
              "Set configuration contains an unknown set.",
              400,
              "invalid_set_config",
            );
          }
          const xpCost = Number(row.xpCost);
          const sortOrder = Number(row.sortOrder);
          const godPackXpCost = Number(row.godPackXpCost);
          const godPackLimit = Number(row.godPackLimit);
          const godPackWindowDays = Number(row.godPackWindowDays);
          if (
            seen.has(row.setId) ||
            !Number.isInteger(xpCost) ||
            xpCost < 0 ||
            xpCost > 1_000_000 ||
            !Number.isInteger(sortOrder) ||
            sortOrder < 0 ||
            sortOrder > 1_000_000 ||
            !Number.isInteger(godPackXpCost) ||
            godPackXpCost < 0 ||
            godPackXpCost > 1_000_000 ||
            !Number.isInteger(godPackLimit) ||
            godPackLimit < 1 ||
            godPackLimit > 100 ||
            !Number.isInteger(godPackWindowDays) ||
            godPackWindowDays < 1 ||
            godPackWindowDays > 3650
          ) {
            throw apiError(
              "Set costs, order, God Pack limits and periods must be valid whole numbers within their allowed ranges.",
              400,
              "invalid_set_config",
            );
          }
          seen.add(row.setId);
          return {
            setId: row.setId,
            xpCost,
            sortOrder,
            godPackXpCost,
            godPackLimit,
            godPackWindowDays,
          };
        });
        if (
          seen.size !== PACK_SET_DEFINITIONS.length ||
          new Set(nextSettings.map((row) => row.sortOrder)).size !==
            nextSettings.length
        ) {
          throw apiError(
            "Every set needs a unique display order.",
            400,
            "invalid_set_config",
          );
        }
        const previous = getConfiguredPackSets().map(
          ({
            setId,
            id,
            xpCost,
            sortOrder,
            godPackXpCost,
            godPackLimit,
            godPackWindowDays,
          }) => ({
            setId: setId ?? id,
            xpCost,
            sortOrder,
            godPackXpCost,
            godPackLimit,
            godPackWindowDays,
          }),
        );
        transaction(() => {
          const update = database.prepare(
            `UPDATE pack_set_settings
             SET xp_cost = ?, sort_order = ?, god_pack_xp_cost = ?,
                 god_pack_limit = ?, god_pack_window_days = ?
             WHERE set_id = ?`,
          );
          for (const row of nextSettings)
            update.run(
              row.xpCost,
              row.sortOrder,
              row.godPackXpCost,
              row.godPackLimit,
              row.godPackWindowDays,
              row.setId,
            );
          recordAdminAction(
            admin,
            "update_pack_set_settings",
            "pack_sets",
            "all",
            {
              previous,
              settings: nextSettings,
            },
          );
        });
        PACK_SETS = getConfiguredPackSets();
        await getSetAvailability();
        sendJson(response, 200, { sets: getAdminSetRows() });
        return;
      }

      sendError(response, 404, "Not found.", "not_found");
      return;
    }

    if (request.method === "POST" && path === "/api/account/register") {
      const body = await readJson(request);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const profile = validateProfile(body.firstName, body.avatar ?? null);
      const ip = requestIp(request);
      enforceRateLimit(`register-ip:${ip}`, 5);
      enforceRateLimit(`register-email:${email.slice(0, 254)}`, 5);
      if (typeof body.website === "string" && body.website.trim()) {
        sendJson(response, 202, { approvalRequired: true });
        return;
      }
      if (!isValidEmail(email)) {
        throw apiError("Enter a valid email address.", 400, "invalid_email");
      }
      if (password.length < 12 || password.length > 128) {
        throw apiError(
          "Password must be between 12 and 128 characters.",
          400,
          "invalid_password",
        );
      }
      if (statement.findUserByEmail.get(email)) {
        sendJson(response, 202, { approvalRequired: true });
        return;
      }
      const credentials = await hashPassword(password);
      const userId = ulid();
      const now = new Date().toISOString();
      try {
        transaction(() => {
          statement.insertUser.run(
            userId,
            email,
            credentials.salt.toString("hex"),
            credentials.hash.toString("hex"),
            profile.firstName,
            profile.avatar,
            now,
            "user",
            "pending_approval",
          );
          statement.insertProgress.run(userId, now);
          statement.insertUnlock.run(userId, PACK_SETS[0].id, now);
        });
      } catch (error) {
        if (
          String(error.message).includes(
            "UNIQUE constraint failed: users.email",
          )
        ) {
          sendJson(response, 202, { approvalRequired: true });
          return;
        }
        throw error;
      }
      sendJson(response, 202, { approvalRequired: true });
      return;
    }

    if (request.method === "POST" && path === "/api/account/login") {
      const body = await readJson(request);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      enforceRateLimit(`login-ip:${requestIp(request)}`, 30);
      enforceRateLimit(`login:${email.slice(0, 254)}`);
      const user = statement.findUserByEmail.get(email);
      const valid =
        user && password.length <= 128
          ? await verifyPassword(
              password,
              user.password_salt,
              user.password_hash,
            )
          : timingSafeEqual(
              Buffer.from(
                await scryptAsync(password.slice(0, 128), DUMMY_SALT, 64, {
                  N: 16_384,
                  r: 8,
                  p: 1,
                  maxmem: 64 * 1024 * 1024,
                }),
              ),
              DUMMY_HASH,
            );
      if (!user || !valid) {
        throw apiError(
          "Email or password is incorrect.",
          401,
          "invalid_credentials",
        );
      }
      if (user.account_status === "pending_approval") {
        throw apiError(
          "Your account is waiting for administrator approval. Try again after it has been approved.",
          403,
          "account_pending_approval",
        );
      }
      if (user.account_status !== "active") {
        throw apiError(
          "This account is not currently available. Contact an administrator if you think this is a mistake.",
          403,
          "account_unavailable",
        );
      }
      const token = createSession(user.id);
      sendJson(
        response,
        200,
        { account: snapshot(user) },
        { "Set-Cookie": sessionCookie(token) },
      );
      return;
    }

    if (request.method === "POST" && path === "/api/account/logout") {
      const token = parseCookies(request.headers.cookie).get(COOKIE_NAME);
      if (token) statement.deleteSession.run(sha256(token));
      sendJson(
        response,
        200,
        { ok: true },
        { "Set-Cookie": sessionCookie("", 0) },
      );
      return;
    }

    if (request.method === "PATCH" && path === "/api/account/profile") {
      const user = requireAuthenticated(request, response);
      if (!user) return;
      const body = await readJson(request);
      const profile = validateProfile(body.firstName, body.avatar ?? null);
      statement.updateProfile.run(profile.firstName, profile.avatar, user.id);
      const updatedUser = statement.findUserById.get(user.id);
      sendJson(response, 200, { account: snapshot(updatedUser) });
      return;
    }

    if (request.method === "POST" && path === "/api/account/password") {
      const user = requireAuthenticated(request, response);
      if (!user) return;
      const body = await readJson(request);
      const currentPassword =
        typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword =
        typeof body.newPassword === "string" ? body.newPassword : "";
      const valid = await verifyPassword(
        currentPassword,
        user.password_salt,
        user.password_hash,
      );
      if (!valid)
        throw apiError(
          "Current password is incorrect.",
          401,
          "invalid_credentials",
        );
      if (newPassword.length < 12 || newPassword.length > 128) {
        throw apiError(
          "New password must be between 12 and 128 characters.",
          400,
          "invalid_password",
        );
      }
      const credentials = await hashPassword(newPassword);
      const cookieToken = parseCookies(request.headers.cookie).get(COOKIE_NAME);
      const currentTokenHash = cookieToken ? sha256(cookieToken) : "";
      statement.updatePassword.run(
        credentials.salt.toString("hex"),
        credentials.hash.toString("hex"),
        user.id,
      );
      for (const session of statement.getUserSessions.all(
        user.id,
        currentTokenHash,
      )) {
        statement.deleteSession.run(session.token_hash);
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (
      request.method === "POST" &&
      path === "/api/account/collection/import"
    ) {
      const user = requireAuthenticated(request, response);
      if (!user) return;
      const body = await readJson(request);
      if (
        typeof body.collections !== "object" ||
        body.collections === null ||
        Array.isArray(body.collections)
      ) {
        throw apiError(
          "Collection data is invalid.",
          400,
          "invalid_collection",
        );
      }
      const available = await getSetAvailability();
      let imported = 0;
      const now = new Date().toISOString();
      transaction(() => {
        for (const [setId, cardIds] of Object.entries(body.collections)) {
          if (!availableSet(setId, available) || !Array.isArray(cardIds))
            continue;
          for (const cardId of cardIds.slice(0, 500)) {
            if (
              typeof cardId !== "string" ||
              !validCardId(setId, cardId) ||
              cardId.startsWith("sim-energy-")
            )
              continue;
            imported += statement.addCollectionCard.run(
              user.id,
              setId,
              cardId,
              now,
            ).changes;
          }
        }
      });
      sendJson(response, 200, {
        imported,
        account: snapshot(statement.findUserById.get(user.id)),
      });
      return;
    }

    if (request.method === "POST" && path === "/api/account/unlock") {
      const user = requireAuthenticated(request, response);
      if (!user) return;
      const body = await readJson(request);
      if (typeof body.setId !== "string") {
        throw apiError("Choose a set to unlock.", 400, "invalid_set");
      }
      const available = await getSetAvailability();
      const set = PACK_SETS.find((candidate) => candidate.id === body.setId);
      const setStatus = set ? setAvailabilityFor(set.id, available) : null;
      if (setStatus?.available === null) {
        throw apiError(
          "Set artwork availability could not be checked. Please try again.",
          503,
          "set_availability_unverified",
        );
      }
      if (!set || !availableSet(set.id, available)) {
        throw apiError(
          "This set is unavailable because its card artwork is incomplete.",
          404,
          "set_unavailable",
        );
      }
      transaction(() => {
        if (statement.hasUnlock.get(user.id, set.id)) return;
        const progress = statement.getProgress.get(user.id);
        if ((progress?.lifetime_xp ?? 0) < set.xpCost) {
          throw apiError(
            `You need ${set.xpCost - (progress?.lifetime_xp ?? 0)} more lifetime XP to unlock this set.`,
            409,
            "not_enough_xp",
          );
        }
        statement.insertUnlock.run(user.id, set.id, new Date().toISOString());
      });
      sendJson(response, 200, {
        account: snapshot(statement.findUserById.get(user.id)),
      });
      return;
    }

    if (request.method === "POST" && path === "/api/account/packs/start") {
      const user = requireAuthenticated(request, response);
      if (!user) return;
      const body = await readJson(request);
      const setId = typeof body.setId === "string" ? body.setId : "";
      const totalCards = Number(body.totalCards);
      const packType = body.packType === "god" ? "god" : "standard";
      const configuredSet = PACK_SETS.find((set) => set.id === setId);
      if (
        !configuredSet ||
        totalCards !== configuredSet.cardsPerPack ||
        (body.packType !== undefined &&
          body.packType !== "standard" &&
          body.packType !== "god")
      ) {
        throw apiError("Pack card count is invalid.", 400, "invalid_pack");
      }
      const available = await getSetAvailability();
      const setStatus = setAvailabilityFor(setId, available);
      if (setStatus?.available === null) {
        throw apiError(
          "Set artwork availability could not be checked. Please try again.",
          503,
          "set_availability_unverified",
        );
      }
      if (
        !PACK_SETS.some((set) => set.id === setId) ||
        !availableSet(setId, available)
      ) {
        throw apiError(
          "This set is unavailable because its card artwork is incomplete.",
          404,
          "set_unavailable",
        );
      }
      if (!statement.hasUnlock.get(user.id, setId)) {
        throw apiError(
          "Reach the lifetime XP threshold and unlock this set before opening its packs.",
          403,
          "set_locked",
        );
      }
      const packId = ulid();
      let usedFreeGodPack = false;
      let freeGodPackCreditId = null;
      const dailyReward = transaction(() => {
        if (packType === "god") {
          const godPackStatus = getGodPackStatus(user.id, setId);
          if (godPackStatus.remaining <= 0) {
            throw apiError(
              `You have used the God Pack limit for ${configuredSet.name}. Another will be available after ${godPackStatus.availableAt}.`,
              409,
              "god_pack_limit_reached",
            );
          }
          const freeCredit = statement.getAvailableGodPackCredit.get(
            user.id,
            setId,
          );
          if (freeCredit) {
            usedFreeGodPack = true;
            freeGodPackCreditId = freeCredit.id;
          } else {
            const progress = statement.getProgress.get(user.id);
            const cost = configuredSet.godPackXpCost;
            if ((progress?.xp ?? 0) < cost) {
              throw apiError(
                `You need ${cost - (progress?.xp ?? 0)} more available XP to buy this God Pack.`,
                409,
                "not_enough_xp",
              );
            }
            statement.updateProgress.run(
              (progress?.xp ?? 0) - cost,
              progress?.lifetime_xp ?? 0,
              progress?.streak_days ?? 0,
              progress?.last_activity_date ?? null,
              new Date().toISOString(),
              user.id,
            );
          }
        }
        const daily = claimDailyStreak(user.id);
        statement.insertPack.run(
          packId,
          user.id,
          setId,
          totalCards,
          packType,
          new Date().toISOString(),
        );
        if (packType === "god") {
          const purchasedAt = new Date().toISOString();
          statement.insertGodPackPurchase.run(
            packId,
            user.id,
            packId,
            setId,
            purchasedAt,
          );
          if (freeGodPackCreditId) {
            statement.redeemGodPackFreeCredit.run(
              packId,
              purchasedAt,
              freeGodPackCreditId,
            );
          }
        }
        return daily;
      });
      sendJson(response, 201, {
        packId,
        dailyReward,
        godPackFree: usedFreeGodPack,
        account: snapshot(statement.findUserById.get(user.id)),
      });
      return;
    }

    if (request.method === "POST" && path === "/api/account/packs/reveal") {
      const user = requireAuthenticated(request, response);
      if (!user) return;
      const body = await readJson(request);
      const packId = typeof body.packId === "string" ? body.packId : "";
      const position = Number(body.position);
      const cardId = typeof body.cardId === "string" ? body.cardId : "";
      const rarity = typeof body.rarity === "string" ? body.rarity : "";
      const finish = typeof body.finish === "string" ? body.finish : "";
      if (
        !Number.isInteger(position) ||
        position < 0 ||
        !RARITIES.has(rarity) ||
        !["normal", "holo", "reverse"].includes(finish)
      ) {
        throw apiError(
          "The revealed card details are invalid.",
          400,
          "invalid_reveal",
        );
      }
      const pack = statement.getPack.get(packId, user.id);
      if (!pack || pack.complete) {
        throw apiError(
          "This pack session is not active.",
          404,
          "pack_not_found",
        );
      }
      if (position < pack.revealed_count) {
        const savedReveal = statement.getReveal.get(packId, position);
        if (
          savedReveal &&
          savedReveal.card_id === cardId &&
          savedReveal.rarity === rarity &&
          savedReveal.finish === finish
        ) {
          sendJson(response, 200, {
            earnedXp: 0,
            rewards: [],
            complete: pack.complete === 1,
            godPackAwarded: Boolean(
              statement.hasGodPackAwardFromPack.get(packId),
            ),
            account: snapshot(statement.findUserById.get(user.id)),
          });
          return;
        }
      }
      if (position !== pack.revealed_count || position >= pack.total_cards) {
        throw apiError(
          "Reveal cards in pack order.",
          409,
          "invalid_reveal_order",
        );
      }
      const validCardIds = setAvailabilityCache.get(pack.set_id)?.cardIds;
      if (
        !validCardId(pack.set_id, cardId) ||
        (!cardId.startsWith("sim-energy-") && !validCardIds?.has(cardId))
      ) {
        throw apiError(
          "This card does not belong to the selected set.",
          400,
          "invalid_card",
        );
      }
      if (
        pack.pack_type === "god" &&
        ((position === 0 &&
          (rarity !== "energy" || !cardId.startsWith("sim-energy-"))) ||
          (position > 0 &&
            (rarity === "energy" ||
              cardId.startsWith("sim-energy-") ||
              !GOD_PACK_RARITIES.has(rarity))))
      ) {
        throw apiError(
          "God Packs must reveal an energy first, followed only by IR-or-higher cards.",
          400,
          "invalid_god_pack_reveal",
        );
      }
      const result = transaction(() => {
        const now = new Date().toISOString();
        const nextCount = position + 1;
        const complete = nextCount === pack.total_cards;
        const rewards = [];
        let earnedXp = 0;
        let godPackAwarded = false;
        const reward = (id, label, xp) => {
          rewards.push({ id, label, xp });
          earnedXp += xp;
          addXp(user.id, xp);
        };

        statement.insertReveal.run(
          packId,
          position,
          cardId,
          rarity,
          finish,
          now,
        );
        if (position === 0) reward("first-card", "First card revealed", 1);
        if (!cardId.startsWith("sim-energy-")) {
          const collected = statement.addCollectionCard.run(
            user.id,
            pack.set_id,
            cardId,
            now,
          );
          if (collected.changes > 0)
            reward("new-card", "New card collected", 5);
        }
        if (
          finish !== "normal" &&
          awardAchievement(user.id, "first-shiny", 10)
        ) {
          rewards.push({ id: "first-shiny", label: "First foil card", xp: 10 });
          earnedXp += 10;
        }
        if (
          FULL_ART_RARITIES.has(rarity) &&
          awardAchievement(user.id, "first-full-art", 25)
        ) {
          rewards.push({
            id: "first-full-art",
            label: "First full-art pull",
            xp: 25,
          });
          earnedXp += 25;
        }
        if (complete) {
          reward("pack-complete", "Pack completed", 3);
          const hasUnspentFreeCredit =
            statement.countAvailableGodPackCredits.get(
              user.id,
              pack.set_id,
            ).count > 0;
          if (
            pack.pack_type === "standard" &&
            !hasUnspentFreeCredit &&
            rollsFreeGodPackUnlock()
          ) {
            statement.insertGodPackFreeCredit.run(
              ulid(),
              user.id,
              pack.set_id,
              packId,
              now,
            );
            godPackAwarded = true;
          }
        }
        statement.updatePack.run(
          nextCount,
          complete ? 1 : 0,
          complete ? now : null,
          packId,
        );
        return { earnedXp, rewards, complete, godPackAwarded };
      });
      sendJson(response, 200, {
        ...result,
        account: snapshot(statement.findUserById.get(user.id)),
      });
      return;
    }

    sendError(response, 404, "Not found.", "not_found");
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500)
      console.error("Progress API request failed:", error?.message);
    sendError(
      response,
      status,
      status >= 500
        ? "The account service is temporarily unavailable."
        : (error?.message ?? "The request could not be completed."),
      error?.code ?? "account_error",
    );
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Account and progression API listening on ${PORT}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
