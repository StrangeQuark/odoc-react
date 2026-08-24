import { useEffect, useState } from 'react';

export function RateLimitNotice({ retryAt }: { retryAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt || retryAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  if (!retryAt || now === 0 || retryAt <= now) return null;
  const seconds = Math.max(1, Math.ceil((retryAt - now) / 1000));
  return <p role="status">Please wait {seconds} second{seconds === 1 ? '' : 's'} before trying again.</p>;
}
