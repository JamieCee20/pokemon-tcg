import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageFrame } from "../../components/AppLayout";
import { useAccount } from "./AccountContext";
import {
  getAdminAudit,
  getAdminOverview,
  getAdminSets,
  getAdminUsers,
  saveAdminSets,
  updateAdminUserStatus,
  updateAdminUserXp,
} from "./api";
import type { AdminPackSet, AdminUser } from "./api";
import "./AdminPage.css";

const adminKeys = ["admin", "overview"] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusLabel(status: AdminUser["status"]) {
  return status.replaceAll("_", " ");
}

export function AdminPage() {
  const { account, isLoading: accountLoading } = useAccount();
  const queryClient = useQueryClient();
  const isAdmin = account?.user.role === "admin";
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [xpDrafts, setXpDrafts] = useState<Record<string, string>>({});
  const [xpReasons, setXpReasons] = useState<Record<string, string>>({});
  const [setDrafts, setSetDrafts] = useState<AdminPackSet[]>([]);
  const [savingSets, setSavingSets] = useState(false);

  const overviewQuery = useQuery({
    queryKey: adminKeys,
    queryFn: getAdminOverview,
    enabled: isAdmin,
    retry: false,
  });
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: getAdminUsers,
    enabled: isAdmin,
    retry: false,
  });
  const setsQuery = useQuery({
    queryKey: ["admin", "sets"],
    queryFn: getAdminSets,
    enabled: isAdmin,
    retry: false,
  });
  const auditQuery = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: getAdminAudit,
    enabled: isAdmin,
    retry: false,
  });

  useEffect(() => {
    if (setsQuery.data) setSetDrafts(setsQuery.data);
  }, [setsQuery.data]);

  const users = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter(
      (user) =>
        !needle ||
        user.email.toLowerCase().includes(needle) ||
        user.firstName.toLowerCase().includes(needle),
    );
  }, [search, usersQuery.data]);

  async function refreshAdminData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "sets"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }),
      queryClient.invalidateQueries({
        queryKey: ["account", "pack-set-availability"],
      }),
    ]);
  }

  async function changeUserStatus(
    user: AdminUser,
    action: "approve" | "suspend" | "reactivate",
  ) {
    setBusyId(user.id);
    setError("");
    setMessage("");
    try {
      await updateAdminUserStatus(user.id, action);
      await refreshAdminData();
      setMessage(
        `${user.email} was ${action === "suspend" ? "suspended" : action === "approve" ? "approved" : "reactivated"}.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this account.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function saveUserXp(user: AdminUser) {
    const xp = Number(xpDrafts[user.id] ?? user.xp);
    setBusyId(user.id);
    setError("");
    setMessage("");
    try {
      await updateAdminUserXp(user.id, xp, xpReasons[user.id] ?? "");
      await refreshAdminData();
      setMessage(`XP updated for ${user.email}.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update XP.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function saveSetSettings() {
    setSavingSets(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveAdminSets(
        setDrafts.map((set) => ({
          setId: set.setId,
          xpCost: set.xpCost,
          sortOrder: set.sortOrder,
        })),
      );
      setSetDrafts(saved);
      await refreshAdminData();
      setMessage("Set order and unlock costs saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save set settings.",
      );
    } finally {
      setSavingSets(false);
    }
  }

  if (accountLoading) {
    return (
      <PageFrame className="page-frame--account">
        <div className="account-panel">Checking administrator access…</div>
      </PageFrame>
    );
  }

  if (!isAdmin) {
    return (
      <PageFrame className="page-frame--account">
        <section className="account-panel account-auth-panel">
          <p className="eyebrow">RESTRICTED AREA</p>
          <h1>Administrator access required</h1>
          <p>
            Sign in with an administrator account to manage players and
            progression.
          </p>
          <Link className="pack-button" to="/account">
            Go to account
          </Link>
        </section>
      </PageFrame>
    );
  }

  const overview = overviewQuery.data;

  return (
    <PageFrame className="page-frame--account admin-page">
      <header className="account-heading">
        <div>
          <p className="eyebrow">CARD ATLAS · ADMIN</p>
          <h1>Administration</h1>
          <p>Approve accounts, manage XP, and set pack unlock requirements.</p>
        </div>
        <Link to="/account">Back to account</Link>
      </header>

      {error && (
        <div className="account-message account-message--error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="account-message" role="status">
          {message}
        </div>
      )}
      {(overviewQuery.isError ||
        usersQuery.isError ||
        setsQuery.isError ||
        auditQuery.isError) && (
        <div className="account-message account-message--error" role="alert">
          Admin data could not be loaded. Refresh the page or sign in again.
        </div>
      )}

      <div className="admin-dashboard">
        <section className="admin-stat-grid" aria-label="Account totals">
          <div className="admin-stat">
            <span>Total accounts</span>
            <strong>{overview?.users.total ?? "—"}</strong>
          </div>
          <div className="admin-stat">
            <span>Awaiting approval</span>
            <strong>{overview?.users.pending_approval ?? "—"}</strong>
          </div>
          <div className="admin-stat">
            <span>Active</span>
            <strong>{overview?.users.active ?? "—"}</strong>
          </div>
          <div className="admin-stat">
            <span>Suspended</span>
            <strong>{overview?.users.suspended ?? "—"}</strong>
          </div>
        </section>

        <section className="account-panel">
          <div className="account-section-heading admin-section-heading">
            <div>
              <p className="eyebrow">PLAYER ACCOUNTS</p>
              <h2>Review and manage users</h2>
            </div>
            <label className="admin-search">
              <span className="visually-hidden">Search accounts</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email or name"
                type="search"
              />
            </label>
          </div>
          {usersQuery.isPending ? (
            <p className="account-muted">Loading accounts…</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Status</th>
                    <th>XP</th>
                    <th>Collection</th>
                    <th>Account actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td data-label="Player">
                        <strong>{user.firstName}</strong>
                        <span>{user.email}</span>
                        <small>
                          Joined {formatDate(user.createdAt)}
                          {user.role === "admin" ? " · Admin" : ""}
                        </small>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`admin-status admin-status--${user.status}`}
                        >
                          {statusLabel(user.status)}
                        </span>
                      </td>
                      <td data-label="XP">
                        <div className="admin-xp-control">
                          <input
                            aria-label={`XP for ${user.email}`}
                            min="0"
                            max="1000000"
                            step="1"
                            type="number"
                            value={xpDrafts[user.id] ?? String(user.xp)}
                            onChange={(event) =>
                              setXpDrafts((current) => ({
                                ...current,
                                [user.id]: event.target.value,
                              }))
                            }
                          />
                          <input
                            aria-label={`Reason for XP adjustment for ${user.email}`}
                            maxLength={240}
                            placeholder="Reason (optional)"
                            value={xpReasons[user.id] ?? ""}
                            onChange={(event) =>
                              setXpReasons((current) => ({
                                ...current,
                                [user.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            className="pack-button pack-button--secondary"
                            type="button"
                            disabled={
                              busyId === user.id ||
                              Number(xpDrafts[user.id] ?? user.xp) === user.xp
                            }
                            onClick={() => void saveUserXp(user)}
                          >
                            {busyId === user.id ? "Saving…" : "Save XP"}
                          </button>
                        </div>
                      </td>
                      <td data-label="Collection">
                        <span>{user.unlockedSets} sets unlocked</span>
                        <small>{user.collectedCards} cards collected</small>
                      </td>
                      <td data-label="Account actions">
                        <div className="admin-actions">
                          {user.status === "pending_approval" && (
                            <button
                              className="pack-button"
                              type="button"
                              disabled={busyId === user.id}
                              onClick={() =>
                                void changeUserStatus(user, "approve")
                              }
                            >
                              Approve
                            </button>
                          )}
                          {user.status === "active" &&
                            user.id !== account.user.id && (
                              <button
                                className="admin-danger-button"
                                type="button"
                                disabled={busyId === user.id}
                                onClick={() =>
                                  void changeUserStatus(user, "suspend")
                                }
                              >
                                Suspend
                              </button>
                            )}
                          {user.status === "suspended" && (
                            <button
                              className="pack-button pack-button--secondary"
                              type="button"
                              disabled={busyId === user.id}
                              onClick={() =>
                                void changeUserStatus(user, "reactivate")
                              }
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5}>No matching accounts.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="account-muted">
            Approving an account enables sign-in only after its email is
            verified. Suspending an account ends its active sessions.
          </p>
        </section>

        <section className="account-panel">
          <div className="account-section-heading">
            <div>
              <p className="eyebrow">SET PROGRESSION</p>
              <h2>Unlock costs and order</h2>
            </div>
            <button
              className="pack-button"
              type="button"
              disabled={savingSets || setDrafts.length === 0}
              onClick={() => void saveSetSettings()}
            >
              {savingSets ? "Saving…" : "Save set settings"}
            </button>
          </div>
          <p className="account-muted">
            Lower order numbers appear first. Costs and order are saved in the
            account database and apply without rebuilding the app.
          </p>
          {setsQuery.isPending ? (
            <p className="account-muted">Loading configured sets…</p>
          ) : (
            <div className="admin-set-list">
              {[...setDrafts]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((set) => (
                  <div className="admin-set-row" key={set.setId}>
                    <div>
                      <strong>{set.name}</strong>
                      <small>
                        {set.available
                          ? "Artwork complete"
                          : "Artwork unavailable"}
                      </small>
                    </div>
                    <label>
                      Order
                      <input
                        min="1"
                        max={setDrafts.length}
                        step="1"
                        type="number"
                        value={Math.round(set.sortOrder / 100)}
                        onChange={(event) =>
                          setSetDrafts((current) =>
                            current.map((item) =>
                              item.setId === set.setId
                                ? {
                                    ...item,
                                    sortOrder: Number(event.target.value) * 100,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Unlock XP
                      <input
                        min="0"
                        max="1000000"
                        step="1"
                        type="number"
                        value={set.xpCost}
                        onChange={(event) =>
                          setSetDrafts((current) =>
                            current.map((item) =>
                              item.setId === set.setId
                                ? {
                                    ...item,
                                    xpCost: Number(event.target.value),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="account-panel">
          <div className="account-section-heading">
            <div>
              <p className="eyebrow">ADMIN HISTORY</p>
              <h2>Recent changes</h2>
            </div>
          </div>
          {auditQuery.isPending ? (
            <p className="account-muted">Loading admin history…</p>
          ) : (
            <div className="admin-audit-list">
              {(auditQuery.data ?? []).map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.action.replaceAll("_", " ")}</strong>
                    <span>
                      {entry.targetType} · {entry.targetId}
                    </span>
                  </div>
                  <small>
                    {entry.adminEmail} · {formatDate(entry.createdAt)}
                  </small>
                </article>
              ))}
              {auditQuery.data?.length === 0 && (
                <p className="account-muted">
                  No administrator changes have been recorded yet.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
