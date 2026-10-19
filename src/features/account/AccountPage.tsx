import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "../../components/AppLayout";
import { useAccount } from "./AccountContext";
import {
  ACCOUNT_AVATARS,
  changeAccountPassword,
  getPackSetAvailability,
  importLocalCollection,
  loginAccount,
  logoutAccount,
  registerAccount,
  unlockPackSet,
  updateAccountProfile,
} from "./api";
import type { AccountAvatar } from "./api";
import { readPackCollection } from "../packs/collectionStorage";
import "./AccountPage.css";

function avatarFor(value: AccountAvatar | null, firstName: string) {
  return value ?? (firstName.trim().slice(0, 1).toUpperCase() || "?");
}

function AvatarPicker({
  value,
  onChange,
}: {
  value: AccountAvatar | null;
  onChange: (avatar: AccountAvatar | null) => void;
}) {
  return (
    <fieldset className="account-avatar-picker">
      <legend>
        Avatar <span>optional</span>
      </legend>
      <div>
        <button
          className={!value ? "is-selected" : ""}
          type="button"
          aria-pressed={!value}
          onClick={() => onChange(null)}
        >
          <span aria-hidden="true">A</span>
          <small>Initial</small>
        </button>
        {ACCOUNT_AVATARS.map((avatar) => (
          <button
            className={value === avatar ? "is-selected" : ""}
            type="button"
            aria-label={`Choose ${avatar} avatar`}
            aria-pressed={value === avatar}
            key={avatar}
            onClick={() => onChange(avatar)}
          >
            <span aria-hidden="true">{avatar}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function localCollectionCount(collections: Record<string, string[]>) {
  return Object.values(collections).reduce(
    (total, cardIds) => total + new Set(cardIds).size,
    0,
  );
}

export function AccountPage() {
  const { account, isLoading, error: accountError, setAccount } = useAccount();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [avatar, setAvatar] = useState<AccountAvatar | null>(null);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [profileName, setProfileName] = useState(account?.user.firstName ?? "");
  const [profileAvatar, setProfileAvatar] = useState<AccountAvatar | null>(
    account?.user.avatar ?? null,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const setsQuery = useQuery({
    queryKey: ["account", "pack-set-availability"],
    queryFn: getPackSetAvailability,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const availableSets = setsQuery.data?.filter((set) => set.available) ?? [];
  const unlockedIds = useMemo(
    () =>
      new Set(account?.progression.unlockedSets.map((set) => set.setId) ?? []),
    [account?.progression.unlockedSets],
  );
  const localCollection = readPackCollection();
  const localCount = localCollectionCount(localCollection);
  const importableCount = Object.entries(localCollection).reduce(
    (count, [setId, ids]) =>
      count +
      ids.filter(
        (id) => !(account?.progression.collections[setId] ?? []).includes(id),
      ).length,
    0,
  );

  useEffect(() => {
    if (!account) return;
    setProfileName(account.user.firstName);
    setProfileAvatar(account.user.avatar);
  }, [account?.user.avatar, account?.user.firstName]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      if (mode === "register") {
        const website = new FormData(event.currentTarget).get("website");
        await registerAccount({
          email,
          password,
          firstName,
          avatar,
          website: typeof website === "string" ? website : "",
        });
        setRegistrationPending(true);
        setPassword("");
        setMessage(
          "New accounts require administrator approval before sign-in. If you already have an account, return to sign in.",
        );
        return;
      }
      const result = await loginAccount({ email, password });
      setAccount(result);
      setProfileName(result.user.firstName);
      setProfileAvatar(result.user.avatar);
      setPassword("");
      setMessage("You are signed in.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not sign in right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      const result = await updateAccountProfile({
        firstName: profileName,
        avatar: profileAvatar,
      });
      setAccount(result);
      setMessage("Profile saved.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not save your profile.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      await changeAccountPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Other signed-in sessions were ended.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not change your password.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importCollection() {
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      const result = await importLocalCollection(localCollection);
      setAccount(result.account);
      setMessage(
        `${result.imported} card${result.imported === 1 ? "" : "s"} imported. Imported cards do not award XP.`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not import this collection.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlockSet(setId: string) {
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      const result = await unlockPackSet(setId);
      setAccount(result);
      setMessage("Set unlocked. It is ready in the pack simulator.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not unlock this set.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      await logoutAccount();
      setAccount(null);
      setMessage(
        "You are signed out. Your browser collection remains available.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not sign out.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame className="page-frame--account">
      <header className="account-heading">
        <div>
          <p className="eyebrow">CEE’S CARD VAULT · PLAYER PROFILE</p>
          <h1>Your account</h1>
          <p>Save your collection, earn XP, and unlock more pack sets.</p>
        </div>
        {account && (
          <div className="account-heading__avatar" aria-hidden="true">
            {avatarFor(account.user.avatar, account.user.firstName)}
          </div>
        )}
      </header>

      {accountError && (
        <div className="account-message account-message--error" role="alert">
          {accountError.message}
        </div>
      )}
      {formError && (
        <div className="account-message account-message--error" role="alert">
          {formError}
        </div>
      )}
      {message && (
        <div className="account-message" role="status">
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="account-panel" role="status">
          Loading account…
        </div>
      ) : account ? (
        <div className="account-dashboard">
          <section className="account-stats" aria-label="Progress summary">
            <div>
              <span>Total XP</span>
              <strong>{account.progression.xp}</strong>
            </div>
            <div>
              <span>Daily streak</span>
              <strong>{account.progression.streakDays} days</strong>
            </div>
            <div>
              <span>Unlocked sets</span>
              <strong>{account.progression.unlockedSets.length}</strong>
            </div>
            <div>
              <span>Collection cards</span>
              <strong>
                {localCollectionCount(account.progression.collections)}
              </strong>
            </div>
          </section>

          <section className="account-panel account-rewards">
            <div>
              <p className="eyebrow">HOW TO EARN</p>
              <h2>XP rewards</h2>
            </div>
            <ul>
              <li>
                <span>First card revealed in each pack</span>
                <strong>+1 XP</strong>
              </li>
              <li>
                <span>First copy of a card in a set</span>
                <strong>+5 XP</strong>
              </li>
              <li>
                <span>Your first holo or reverse card</span>
                <strong>+10 XP once</strong>
              </li>
              <li>
                <span>Your first full-art rarity pull</span>
                <strong>+25 XP once</strong>
              </li>
              <li>
                <span>Reveal every card in a pack</span>
                <strong>+3 XP</strong>
              </li>
              <li>
                <span>Daily pack streak</span>
                <strong>+5 XP, rising to +15</strong>
              </li>
            </ul>
            <p className="account-muted">
              The daily reward is claimed when you start your first pack of the
              UTC day. Pack odds never change with XP.
            </p>
          </section>

          <section className="account-panel">
            <div className="account-section-heading">
              <div>
                <p className="eyebrow">PROFILE</p>
                <h2>Player details</h2>
              </div>
              <span className="account-email">{account.user.email}</span>
            </div>
            <form className="account-form" onSubmit={saveProfile}>
              <label>
                First name
                <input
                  autoComplete="given-name"
                  maxLength={40}
                  required
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                />
              </label>
              <AvatarPicker value={profileAvatar} onChange={setProfileAvatar} />
              <button className="pack-button" type="submit" disabled={busy}>
                Save profile
              </button>
            </form>
          </section>

          {account.user.role === "admin" && (
            <section className="account-panel account-admin-shortcut">
              <div>
                <p className="eyebrow">ADMINISTRATION</p>
                <h2>Manage players and progression</h2>
              </div>
              <Link className="pack-button pack-button--secondary" to="/admin">
                Open admin panel
              </Link>
            </section>
          )}

          {localCount > 0 && (
            <section className="account-panel account-import">
              <div>
                <p className="eyebrow">BROWSER COLLECTION</p>
                <h2>Bring over your earlier progress</h2>
                <p>
                  {importableCount > 0
                    ? `${importableCount} card${importableCount === 1 ? " is" : "s are"} not in this account yet.`
                    : `${localCount} browser-saved cards are already in this account.`}{" "}
                  Import merges card IDs only and never grants XP.
                </p>
              </div>
              {importableCount > 0 && (
                <button
                  className="pack-button pack-button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void importCollection()}
                >
                  Import browser collection
                </button>
              )}
            </section>
          )}

          <section className="account-panel">
            <div className="account-section-heading">
              <div>
                <p className="eyebrow">XP UNLOCKS</p>
                <h2>Available pack sets</h2>
              </div>
              <span className="account-utc-note">
                Daily streak resets at 00:00 UTC
              </span>
            </div>
            {setsQuery.isPending ? (
              <p className="account-muted">Checking set artwork…</p>
            ) : setsQuery.isError ? (
              <p className="account-muted" role="alert">
                Set availability could not be checked. Try reloading this page.
              </p>
            ) : availableSets.length === 0 ? (
              <p className="account-muted">
                No sets with a complete artwork catalogue are available yet.
              </p>
            ) : (
              <div className="account-set-list">
                {availableSets.map((set) => {
                  const unlocked = unlockedIds.has(set.setId);
                  const canAfford = account.progression.xp >= set.xpCost;
                  return (
                    <article className="account-set-row" key={set.setId}>
                      <div>
                        <strong>{set.name}</strong>
                        <small>
                          {unlocked
                            ? "Ready to open"
                            : `${set.xpCost} XP to unlock`}
                        </small>
                      </div>
                      {unlocked ? (
                        <Link
                          className="pack-button pack-button--secondary"
                          to="/packs"
                        >
                          Open packs
                        </Link>
                      ) : (
                        <button
                          className="pack-button pack-button--secondary"
                          type="button"
                          disabled={busy || !canAfford}
                          onClick={() => void unlockSet(set.setId)}
                        >
                          {canAfford
                            ? `Unlock · ${set.xpCost} XP`
                            : `${set.xpCost - account.progression.xp} XP to go`}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            <p className="account-muted">
              XP is spent when you unlock a set. Sets whose TCGdex card records
              lack artwork are hidden.
            </p>
          </section>

          <section className="account-panel account-password-panel">
            <div>
              <p className="eyebrow">SECURITY</p>
              <h2>Change password</h2>
            </div>
            <form
              className="account-form account-password-form"
              onSubmit={savePassword}
            >
              <label>
                Current password
                <input
                  autoComplete="current-password"
                  required
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <button
                className="pack-button pack-button--secondary"
                type="submit"
                disabled={busy}
              >
                Change password
              </button>
            </form>
            <p className="account-muted">
              Password recovery by email is not configured yet. Save your
              password somewhere secure.
            </p>
          </section>

          <div className="account-footer-actions">
            <Link to="/packs">Back to pack simulator</Link>
            <button
              className="account-text-button"
              type="button"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : registrationPending ? (
        <section className="account-panel account-auth-panel">
          <p className="eyebrow">REGISTRATION SUBMITTED</p>
          <h2>Awaiting approval</h2>
          <p>
            New accounts are held until an administrator approves them. If you
            already have an account, return here and sign in.
          </p>
          <button
            className="account-text-button"
            type="button"
            onClick={() => {
              setRegistrationPending(false);
              setMode("login");
              setMessage("");
            }}
          >
            Return to sign in
          </button>
        </section>
      ) : (
        <section className="account-panel account-auth-panel">
          <div className="account-section-heading">
            <div>
              <p className="eyebrow">
                {mode === "register" ? "NEW PLAYER" : "WELCOME BACK"}
              </p>
              <h2>{mode === "register" ? "Create an account" : "Sign in"}</h2>
            </div>
            <div className="account-mode-toggle" aria-label="Account form mode">
              <button
                className={mode === "register" ? "is-active" : ""}
                type="button"
                onClick={() => setMode("register")}
              >
                Create account
              </button>
              <button
                className={mode === "login" ? "is-active" : ""}
                type="button"
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
            </div>
          </div>
          <form className="account-form" onSubmit={submitAuth}>
            {mode === "register" && (
              <label className="account-honeypot" aria-hidden="true">
                Leave this field empty
                <input
                  autoComplete="off"
                  name="website"
                  tabIndex={-1}
                  type="text"
                />
              </label>
            )}
            <label>
              Email
              <input
                autoComplete="email"
                autoCapitalize="none"
                maxLength={254}
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {mode === "register" && (
              <>
                <label>
                  First name
                  <input
                    autoComplete="given-name"
                    maxLength={40}
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </>
            )}
            <label>
              Password
              <input
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={mode === "register" ? 12 : undefined}
                maxLength={128}
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {mode === "register" && (
                <small>Use at least 12 characters.</small>
              )}
            </label>
            <button className="pack-button" type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
          <p className="account-muted">
            New accounts must verify their email and wait for administrator
            approval. Password recovery by email is not configured yet.
          </p>
        </section>
      )}
    </PageFrame>
  );
}
