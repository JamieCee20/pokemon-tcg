import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useLanguage } from "../lib/tcgdex/useLanguage";
import { isTcgLanguage, type TcgLanguage } from "../lib/tcgdex/languages";
import { useAccount } from "../features/account/AccountContext";

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { language, setLanguage } = useLanguage();
  const { account } = useAccount();
  const currentQuery = new URLSearchParams(location.search).get("q") ?? "";
  const routeLanguage = params.get("lang");

  useEffect(() => {
    if (isTcgLanguage(routeLanguage) && routeLanguage !== language) {
      setLanguage(routeLanguage);
    }
  }, [language, routeLanguage, setLanguage]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link
            className="brand"
            to={`/sets?lang=${language}`}
            aria-label="Card Atlas home"
          >
            <span className="brand__mark" aria-hidden="true">
              <span />
            </span>
            <span className="brand__name">
              Card Atlas<span className="brand__period">.</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink
              to={`/sets?lang=${language}`}
              className={({ isActive }) =>
                isActive ? "main-nav__link is-active" : "main-nav__link"
              }
            >
              Sets
            </NavLink>
            <NavLink
              to={`/cards?lang=${language}`}
              className={({ isActive }) =>
                isActive ? "main-nav__link is-active" : "main-nav__link"
              }
            >
              Explore cards
            </NavLink>
            <NavLink
              to="/packs"
              className={({ isActive }) =>
                isActive ? "main-nav__link is-active" : "main-nav__link"
              }
            >
              Pack opening
            </NavLink>
            <NavLink
              to="/account"
              className={({ isActive }) =>
                isActive ? "main-nav__link is-active" : "main-nav__link"
              }
            >
              Account
            </NavLink>
            {account?.user.role === "admin" && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  isActive ? "main-nav__link is-active" : "main-nav__link"
                }
              >
                Admin
              </NavLink>
            )}
          </nav>
          <HeaderSearch
            key={`${location.pathname}${location.search}`}
            currentQuery={currentQuery}
            language={language}
            onNavigate={navigate}
          />
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Card Atlas is an unofficial fan project.</span>
        <span>
          Card data and artwork are provided by{" "}
          <a href="https://tcgdex.dev" target="_blank" rel="noreferrer">
            TCGdex
          </a>
          .
        </span>
        <Link to="/licenses">Licenses & data sources</Link>
      </footer>
    </div>
  );
}

function HeaderSearch({
  currentQuery,
  language,
  onNavigate,
}: {
  currentQuery: string;
  language: TcgLanguage;
  onNavigate: ReturnType<typeof useNavigate>;
}) {
  const [query, setQuery] = useState(currentQuery);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearchOpen) searchInput.current?.focus();
  }, [mobileSearchOpen]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    params.set("lang", language);
    onNavigate(`/cards?${params.toString()}`);
  }

  return (
    <form
      className={`header-search${mobileSearchOpen ? " is-open" : ""}`}
      role="search"
      onSubmit={submitSearch}
    >
      <span className="header-search__icon">
        <SearchGlyph />
      </span>
      <button
        className="header-search__toggle"
        type="button"
        aria-label={mobileSearchOpen ? "Close card search" : "Open card search"}
        onClick={() => setMobileSearchOpen((open) => !open)}
      >
        <SearchGlyph />
      </button>
      <label className="visually-hidden" htmlFor="header-search">
        Search cards
      </label>
      <input
        ref={searchInput}
        id="header-search"
        type="search"
        placeholder="Search cards…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <kbd>/</kbd>
    </form>
  );
}

export function PageFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`page-frame ${className}`.trim()}>{children}</section>
  );
}
