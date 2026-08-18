import type { ReactNode } from 'react';

export function EmptyState({
  action,
  children,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className="empty-state" aria-labelledby={`${title}-empty-state`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 id={`${title}-empty-state`}>{title}</h1>
      <div className="empty-state__body">{children}</div>
      {action && <div className="empty-state__action">{action}</div>}
    </section>
  );
}

/** A non-textual loading affordance with an explicit accessible name. */
export function Skeleton({ label = 'Loading content' }: { label?: string }) {
  return (
    <span
      className="skeleton"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Avatar({
  alt,
  name,
  src,
}: {
  alt?: string;
  name: string;
  src?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  if (src) return <img className="avatar" src={src} alt={alt ?? name} />;
  return (
    <span className="avatar avatar--initials" aria-label={alt ?? name}>
      {initials || '?'}
    </span>
  );
}

/** A project-owned live region for non-blocking mutation feedback. */
export function ToastRegion({
  children,
  urgent = false,
}: {
  children?: ReactNode;
  urgent?: boolean;
}) {
  return (
    <div
      className="toast-region"
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}
