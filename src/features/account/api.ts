export const ACCOUNT_AVATARS = ["⚡", "🔥", "🌿", "💧", "⭐", "👾"] as const;

export type AccountAvatar = (typeof ACCOUNT_AVATARS)[number];

export interface AccountUnlock {
  setId: string;
  unlockedAt: string;
}

export interface AccountAchievement {
  id: string;
  earnedAt: string;
}

export interface AccountProgression {
  xp: number;
  streakDays: number;
  lastActivityDate: string | null;
  unlockedSets: AccountUnlock[];
  collections: Record<string, string[]>;
  achievements: AccountAchievement[];
}

export interface AccountData {
  user: {
    id: string;
    email: string;
    firstName: string;
    avatar: AccountAvatar | null;
    role: "user" | "admin";
    accountStatus:
      "pending_approval" | "active" | "suspended";
  };
  progression: AccountProgression;
}

export interface PackSetAvailability {
  setId: string;
  name: string;
  xpCost: number;
  available: boolean | null;
  sortOrder: number;
}

export interface RegistrationResult {
  approvalRequired: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  avatar: AccountAvatar | null;
  role: "user" | "admin";
  status: "pending_approval" | "active" | "suspended";
  createdAt: string;
  xp: number;
  streakDays: number;
  unlockedSets: number;
  collectedCards: number;
}

export interface AdminPackSet {
  setId: string;
  name: string;
  xpCost: number;
  sortOrder: number;
  available: boolean | null;
}

export interface AdminOverview {
  users: {
    total: number;
    pending_approval: number;
    active: number;
    suspended: number;
  };
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
  adminEmail: string;
}

export interface PackRevealResult {
  earnedXp: number;
  rewards: Array<{ id: string; label: string; xp: number }>;
  complete: boolean;
  account: AccountData;
}

export class AccountApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AccountApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/account${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AccountApiError(
      "The account service could not be reached. Try again in a moment.",
      "account_service_unavailable",
      502,
    );
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error =
      typeof payload === "object" && payload !== null
        ? (payload as { error?: unknown; code?: unknown })
        : {};
    throw new AccountApiError(
      typeof error.error === "string"
        ? error.error
        : "The account request could not be completed.",
      typeof error.code === "string" ? error.code : "account_error",
      response.status,
    );
  }
  return payload as T;
}

export async function getCurrentAccount(): Promise<AccountData | null> {
  const response = await request<{ account: AccountData | null }>("/me");
  return response.account;
}

export async function getPackSetAvailability(): Promise<PackSetAvailability[]> {
  const response = await request<{ sets: PackSetAvailability[] }>("/sets");
  return response.sets;
}

export async function registerAccount(input: {
  email: string;
  password: string;
  firstName: string;
  avatar: AccountAvatar | null;
  website: string;
}): Promise<RegistrationResult> {
  return request<RegistrationResult>("/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginAccount(input: {
  email: string;
  password: string;
}): Promise<AccountData> {
  const response = await request<{ account: AccountData }>("/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.account;
}

export async function logoutAccount(): Promise<void> {
  await request<{ ok: boolean }>("/logout", { method: "POST" });
}

export async function updateAccountProfile(input: {
  firstName: string;
  avatar: AccountAvatar | null;
}): Promise<AccountData> {
  const response = await request<{ account: AccountData }>("/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.account;
}

export async function changeAccountPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await request<{ ok: boolean }>("/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importLocalCollection(
  collections: Record<string, string[]>,
): Promise<{ imported: number; account: AccountData }> {
  return request<{ imported: number; account: AccountData }>(
    "/collection/import",
    {
      method: "POST",
      body: JSON.stringify({ collections }),
    },
  );
}

export async function unlockPackSet(setId: string): Promise<AccountData> {
  const response = await request<{ account: AccountData }>("/unlock", {
    method: "POST",
    body: JSON.stringify({ setId }),
  });
  return response.account;
}

export async function startPackSession(
  setId: string,
  totalCards: number,
): Promise<{
  packId: string;
  account: AccountData;
  dailyReward: { xp: number; streakDays: number; claimed: boolean };
}> {
  return request("/packs/start", {
    method: "POST",
    body: JSON.stringify({ setId, totalCards }),
  });
}

export async function recordPackReveal(input: {
  packId: string;
  position: number;
  cardId: string;
  rarity: string;
  finish: string;
}): Promise<PackRevealResult> {
  return request("/packs/reveal", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const response = await request<{ overview: AdminOverview }>(
    "/admin/overview",
  );
  return response.overview;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const response = await request<{ users: AdminUser[] }>("/admin/users");
  return response.users;
}

export async function updateAdminUserStatus(
  userId: string,
  action: "approve" | "suspend" | "reactivate",
): Promise<AdminUser> {
  const response = await request<{ user: AdminUser }>(
    `/admin/users/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify({ action }) },
  );
  return response.user;
}

export async function updateAdminUserXp(
  userId: string,
  xp: number,
  reason: string,
): Promise<AdminUser> {
  const response = await request<{ user: AdminUser }>(
    `/admin/users/${encodeURIComponent(userId)}/xp`,
    { method: "PATCH", body: JSON.stringify({ xp, reason }) },
  );
  return response.user;
}

export async function getAdminSets(): Promise<AdminPackSet[]> {
  const response = await request<{ sets: AdminPackSet[] }>("/admin/sets");
  return response.sets;
}

export async function saveAdminSets(
  sets: Pick<AdminPackSet, "setId" | "xpCost" | "sortOrder">[],
): Promise<AdminPackSet[]> {
  const response = await request<{ sets: AdminPackSet[] }>("/admin/sets", {
    method: "PUT",
    body: JSON.stringify({ sets }),
  });
  return response.sets;
}

export async function getAdminAudit(): Promise<AdminAuditEntry[]> {
  const response = await request<{ entries: AdminAuditEntry[] }>(
    "/admin/audit",
  );
  return response.entries;
}
