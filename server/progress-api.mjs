import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
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
]);
const PACK_SETS = packSetConfig;
const STARTER_SET_ID = PACK_SETS[0].id;
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
    created_at TEXT NOT NULL
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
    revealed_count INTEGER NOT NULL DEFAULT 0 CHECK(revealed_count >= 0),
    complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0, 1)),
    started_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS pack_sessions_user_idx ON pack_sessions(user_id, started_at);

  CREATE TABLE IF NOT EXISTS pack_reveals (
    pack_id TEXT NOT NULL REFERENCES pack_sessions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0),
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    finish TEXT NOT NULL CHECK(finish IN ('normal', 'holo', 'reverse')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(pack_id, position)
  ) STRICT;
`);

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
      addStarterUnlock.run(user.id, STARTER_SET_ID, migratedAt);
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

const statement = {
  findUserByEmail: database.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
  ),
  findUserById: database.prepare("SELECT * FROM users WHERE id = ?"),
  insertUser: database.prepare(
    "INSERT INTO users (id, email, password_salt, password_hash, first_name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  insertProgress: database.prepare(
    "INSERT INTO user_progress (user_id, updated_at) VALUES (?, ?)",
  ),
  getProgress: database.prepare(
    "SELECT * FROM user_progress WHERE user_id = ?",
  ),
  updateProgress: database.prepare(
    "UPDATE user_progress SET xp = ?, streak_days = ?, last_activity_date = ?, updated_at = ? WHERE user_id = ?",
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
    "INSERT INTO pack_sessions (id, user_id, set_id, total_cards, started_at) VALUES (?, ?, ?, ?, ?)",
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

function enforceRateLimit(key) {
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
  if (recent.length > authAttemptLimit) {
    const error = new Error(
      "Too many sign-in attempts. Please try again later.",
    );
    error.status = 429;
    error.code = "auth_rate_limited";
    throw error;
  }
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
    },
    progression: {
      xp: progress?.xp ?? 0,
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
  const now = Date.now();
  const stale = [...setAvailabilityCache.values()].every(
    (entry) => now - entry.checkedAt >= SET_AVAILABILITY_TTL_MS,
  );
  if (setAvailabilityCache.size === PACK_SETS.length && !stale) {
    return PACK_SETS.map((set) => setAvailabilityCache.get(set.id).result);
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
              xpCost: set.xpCost,
              available,
            },
          });
        } catch {
          setAvailabilityCache.set(set.id, {
            checkedAt: now - SET_AVAILABILITY_TTL_MS + 60_000,
            cardIds: new Set(),
            result: {
              setId: set.id,
              name: set.name,
              xpCost: set.xpCost,
              available: false,
            },
          });
        }
      }),
    );
  }
  return PACK_SETS.map((set) => setAvailabilityCache.get(set.id).result);
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
  return availability.find((set) => set.setId === setId && set.available);
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
  if (!user) {
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
    if (request.method === "POST" && path === "/api/account/register") {
      const body = await readJson(request);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const profile = validateProfile(body.firstName, body.avatar ?? null);
      enforceRateLimit(`register:${email.slice(0, 254)}`);
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
          );
          statement.insertProgress.run(userId, now);
          statement.insertUnlock.run(userId, STARTER_SET_ID, now);
        });
      } catch (error) {
        if (
          String(error.message).includes(
            "UNIQUE constraint failed: users.email",
          )
        ) {
          throw apiError(
            "An account with this email already exists.",
            409,
            "email_in_use",
          );
        }
        throw error;
      }
      const token = createSession(userId);
      const user = statement.findUserById.get(userId);
      sendJson(
        response,
        201,
        { account: snapshot(user) },
        { "Set-Cookie": sessionCookie(token) },
      );
      return;
    }

    if (request.method === "POST" && path === "/api/account/login") {
      const body = await readJson(request);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
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
        if ((progress?.xp ?? 0) < set.xpCost) {
          throw apiError(
            `You need ${set.xpCost - (progress?.xp ?? 0)} more XP to unlock this set.`,
            409,
            "not_enough_xp",
          );
        }
        statement.updateProgress.run(
          (progress?.xp ?? 0) - set.xpCost,
          progress?.streak_days ?? 0,
          progress?.last_activity_date ?? null,
          new Date().toISOString(),
          user.id,
        );
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
      const configuredSet = PACK_SETS.find((set) => set.id === setId);
      if (!configuredSet || totalCards !== configuredSet.cardsPerPack) {
        throw apiError("Pack card count is invalid.", 400, "invalid_pack");
      }
      const available = await getSetAvailability();
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
          "Unlock this set with XP before opening its packs.",
          403,
          "set_locked",
        );
      }
      const packId = ulid();
      const dailyReward = transaction(() => {
        const daily = claimDailyStreak(user.id);
        statement.insertPack.run(
          packId,
          user.id,
          setId,
          totalCards,
          new Date().toISOString(),
        );
        return daily;
      });
      sendJson(response, 201, {
        packId,
        dailyReward,
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
      const result = transaction(() => {
        const now = new Date().toISOString();
        const nextCount = position + 1;
        const complete = nextCount === pack.total_cards;
        const rewards = [];
        let earnedXp = 0;
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
        if (complete) reward("pack-complete", "Pack completed", 3);
        statement.updatePack.run(
          nextCount,
          complete ? 1 : 0,
          complete ? now : null,
          packId,
        );
        return { earnedXp, rewards, complete };
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
