import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "./AccountContext";
import { getPackThemes, selectPackTheme } from "./api";
import packThemeConfig from "../../../docs/cees-card-vault-themes/themes.json";
import "./PackThemeSettings.css";

const PACK_THEMES = packThemeConfig.themes;
const DEFAULT_THEME_ID = packThemeConfig.defaultThemeId;

function themeAssetUrl(path: string) {
  return `/pack-themes/${path}`;
}

export function PackThemeSettings() {
  const { account } = useAccount();
  const queryClient = useQueryClient();
  const [savingThemeId, setSavingThemeId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const themesQuery = useQuery({
    queryKey: ["account", "pack-themes", account?.user.id],
    queryFn: getPackThemes,
    enabled: account !== null,
    staleTime: 60_000,
    retry: false,
  });
  const selectedThemeId = themesQuery.data?.selectedThemeId ?? DEFAULT_THEME_ID;

  async function chooseTheme(themeId: string, themeName: string) {
    if (!account || savingThemeId) return;
    setSavingThemeId(themeId);
    setMessage("");
    setError("");
    try {
      const profile = await selectPackTheme(themeId);
      queryClient.setQueryData(
        ["account", "pack-themes", account.user.id],
        profile,
      );
      setMessage(`${themeName} selected for your next pack.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this theme.",
      );
    } finally {
      setSavingThemeId("");
    }
  }

  return (
    <section className="account-pack-themes" aria-labelledby="account-pack-themes-title">
      <div className="account-pack-themes__heading">
        <div>
          <p className="eyebrow">UNLOCKABLE ARTWORK</p>
          <h3 id="account-pack-themes-title">Pack &amp; card themes</h3>
          <p>Earn paired pack wrappers and card backs as you collect.</p>
        </div>
        <span>
          {themesQuery.data
            ? `${themesQuery.data.themes.filter((theme) => theme.unlocked).length} / ${themesQuery.data.themes.length} unlocked`
            : themesQuery.isPending
              ? "Loading progress…"
              : "Theme progress unavailable"}
        </span>
      </div>

      {themesQuery.isError && (
        <p className="account-pack-themes__notice" role="alert">
          Theme progress is temporarily unavailable. Try refreshing this page.
        </p>
      )}
      {error && (
        <p className="account-pack-themes__notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="account-pack-themes__message" role="status">
          {message}
        </p>
      )}

      <div className="account-pack-themes__grid">
        {PACK_THEMES.map((theme) => {
          const state = themesQuery.data?.themes.find(
            (item) => item.id === theme.id,
          );
          const unlocked = state?.unlocked ?? theme.id === DEFAULT_THEME_ID;
          const selected = selectedThemeId === theme.id;
          const secret = theme.tier === "secret" && !unlocked;
          const progress = state?.progress;

          return (
            <button
              className={
                "account-pack-theme" +
                (unlocked ? " is-unlocked" : " is-locked") +
                (selected ? " is-selected" : "")
              }
              type="button"
              key={theme.id}
              disabled={!unlocked || selected || Boolean(savingThemeId)}
              aria-pressed={selected}
              onClick={() => void chooseTheme(theme.id, theme.name)}
            >
              {secret ? (
                <span className="account-pack-theme__secret" aria-hidden="true">
                  ?
                </span>
              ) : (
                <span className="account-pack-theme__art" aria-label="Pack wrapper and card back artwork">
                  <img src={themeAssetUrl(theme.assets.pack)} alt="" loading="lazy" />
                  <img src={themeAssetUrl(theme.assets.cardBack)} alt="" loading="lazy" />
                </span>
              )}
              <span className="account-pack-theme__copy">
                <strong>{secret ? "???" : theme.name}</strong>
                <small>
                  {unlocked
                    ? theme.tagline
                    : secret
                      ? "A hidden vault reward"
                      : theme.unlockText}
                </small>
                {!unlocked && !secret && progress && (
                  <>
                    <span
                      className="account-pack-theme__progress"
                      role="progressbar"
                      aria-label={`${theme.name} unlock progress`}
                      aria-valuemin={0}
                      aria-valuemax={progress.target}
                      aria-valuenow={progress.current}
                    >
                      <span
                        style={{
                          width: `${Math.min(100, (progress.current / Math.max(1, progress.target)) * 100)}%`,
                        }}
                      />
                    </span>
                    <small>{progress.label}</small>
                  </>
                )}
                {selected && (
                  <small className="account-pack-theme__selected">
                    Selected for next pack
                  </small>
                )}
              </span>
              <span className="account-pack-theme__status">
                {savingThemeId === theme.id
                  ? "Saving…"
                  : selected
                    ? "Selected"
                    : unlocked
                      ? "Equip"
                      : "Locked"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
