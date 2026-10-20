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

export type CosmeticCategory = "tableTheme" | "profileBadge" | "collectionDisplay";

export interface SetMastery {
  setId: string;
  name: string;
  available: boolean;
  collectedCards: number;
  totalCards: number | null;
  percent: number;
  rank: "explorer" | "collector" | "archivist" | "master" | null;
  rankLabel: "Explorer" | "Collector" | "Archivist" | "Master" | null;
}

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  style: string;
  unlockDescription: string;
  unlocked: boolean;
  unlockedAt: string | null;
  equipped: boolean;
}

export interface AccountProgression {
  xp: number;
  lifetimeXp: number;
  godPack: Record<
    string,
    {
      limit: number;
      windowDays: number;
      openedInWindow: number;
      remaining: number;
      availableAt: string | null;
      freeCredits: number;
    }
  >;
  streakDays: number;
  lastActivityDate: string | null;
  unlockedSets: AccountUnlock[];
  collections: Record<string, string[]>;
  mastery: SetMastery[];
  cosmetics: {
    unlocked: string[];
    equipped: Record<CosmeticCategory, string>;
  };
  achievements: AccountAchievement[];
}

export interface CosmeticProfile {
  account: AccountData;
  mastery: SetMastery[];
  items: CosmeticItem[];
}

export interface PackThemeProgress {
  current: number;
  target: number;
  label: string;
}

export interface PackThemeItem {
  id: string;
  order: number;
  name: string;
  tier: string;
  tagline: string;
  unlockText: string;
  palette: Record<string, string>;
  assets: { pack: string; cardBack: string };
  unlocked: boolean;
  unlockedAt: string | null;
  progress: PackThemeProgress;
}

export interface PackThemeProfile {
  selectedThemeId: string;
  themes: PackThemeItem[];
}

export interface AccountData {
  user: {
    id: string;
    email: string;
    firstName: string;
    avatar: AccountAvatar | null;
    role: "user" | "admin";
    accountStatus: "pending_approval" | "active" | "suspended";
  };
  progression: AccountProgression;
}

export interface PackSetAvailability {
  setId: string;
  name: string;
  xpCost: number;
  godPackXpCost: number;
  godPackLimit: number;
  godPackWindowDays: number;
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
  godPackXpCost: number;
  godPackLimit: number;
  godPackWindowDays: number;
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
  godPackAwarded: boolean;
  newThemesUnlocked: string[];
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

export async function getCosmeticProfile(): Promise<CosmeticProfile> {
  return request<CosmeticProfile>("/cosmetics");
}

export async function equipCosmetic(
  category: CosmeticCategory,
  cosmeticId: string,
): Promise<AccountData> {
  const response = await request<{ account: AccountData }>("/cosmetics/equip", {
    method: "POST",
    body: JSON.stringify({ category, cosmeticId }),
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
  packType: "standard" | "god" = "standard",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<{
  packId: string;
  godPackFree: boolean;
  account: AccountData;
  dailyReward: { xp: number; streakDays: number; claimed: boolean };
}> {
  return request("/packs/start", {
    method: "POST",
    body: JSON.stringify({ setId, totalCards, packType, timeZone }),
  });
}

export async function recordPackReveal(input: {
  packId: string;
  position: number;
  cardId: string;
  rarity: string;
  finish: string;
  energyTypes?: string[];
}): Promise<PackRevealResult> {
  const result = await request<Partial<PackRevealResult> & {
    newlyUnlockedThemeIds?: unknown;
  }>("/packs/reveal", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const themeIds = result.newThemesUnlocked ?? result.newlyUnlockedThemeIds;

  return {
    ...result,
    rewards: Array.isArray(result.rewards) ? result.rewards : [],
    newThemesUnlocked: Array.isArray(themeIds)
      ? themeIds.filter((themeId): themeId is string => typeof themeId === "string")
      : [],
  } as PackRevealResult;
}

export async function getPackThemes(): Promise<PackThemeProfile> {
  return request("/pack-themes");
}

export async function selectPackTheme(
  themeId: string,
): Promise<PackThemeProfile> {
  return request("/pack-themes/select", {
    method: "POST",
    body: JSON.stringify({ themeId }),
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
  return response.sets.map((set) => ({
    ...set,
    godPackXpCost: Number.isInteger(set.godPackXpCost)
      ? set.godPackXpCost
      : 1_000,
    godPackLimit: Number.isInteger(set.godPackLimit) ? set.godPackLimit : 1,
    godPackWindowDays: Number.isInteger(set.godPackWindowDays)
      ? set.godPackWindowDays
      : 7,
  }));
}

export async function saveAdminSets(
  sets: Pick<
    AdminPackSet,
    | "setId"
    | "xpCost"
    | "sortOrder"
    | "godPackXpCost"
    | "godPackLimit"
    | "godPackWindowDays"
  >[],
): Promise<AdminPackSet[]> {
  const response = await request<{ sets: AdminPackSet[] }>("/admin/sets", {
    method: "PUT",
    body: JSON.stringify({ sets }),
  });
  const savedById = new Map(response.sets.map((set) => [set.setId, set]));
  const settingsWereSaved = sets.every((set) => {
    const saved = savedById.get(set.setId);
    if (!saved) return false;
    return (
      saved.xpCost === set.xpCost &&
      saved.sortOrder === set.sortOrder &&
      saved.godPackXpCost === set.godPackXpCost &&
      saved.godPackLimit === set.godPackLimit &&
      saved.godPackWindowDays === set.godPackWindowDays
    );
  });
  if (!settingsWereSaved) {
    throw new AccountApiError(
      "The account service did not confirm these God Pack settings. Rebuild or restart the progress-api service, then save again.",
      "god_pack_settings_not_confirmed",
      503,
    );
  }
  return response.sets;
}

export async function getAdminAudit(): Promise<AdminAuditEntry[]> {
  const response = await request<{ entries: AdminAuditEntry[] }>(
    "/admin/audit",
  );
  return response.entries;
}
