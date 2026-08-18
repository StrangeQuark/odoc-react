import type { ReactNode } from 'react';

type InlineStatusProps = {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
  urgent?: boolean;
};

/** Announces asynchronous outcomes without relying on color alone. */
export function InlineStatus({
  children,
  tone = 'neutral',
  urgent = false,
}: InlineStatusProps) {
  return (
    <p
      className={`inline-status inline-status--${tone}`}
      role={urgent ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
