import type { ReactNode } from "react";

export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div className="page-heading__row">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="state-panel__icon" aria-hidden="true">
        !
      </span>
      <div>
        <h2>Something went wrong</h2>
        <p>{message}</p>
        {onRetry && (
          <button
            className="button button--quiet"
            type="button"
            onClick={onRetry}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="state-panel state-panel--empty">
      <span className="state-panel__spark" aria-hidden="true">
        ✳
      </span>
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

export function LoadingCards({ count = 8 }: { count?: number }) {
  return (
    <div className="card-grid" aria-label="Loading cards">
      {Array.from({ length: count }, (_, index) => (
        <div className="card-skeleton" key={index} aria-hidden="true" />
      ))}
    </div>
  );
}
