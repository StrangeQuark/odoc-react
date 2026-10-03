import { useEffect, useState } from 'react';

/**
 * Network and release state is intentionally ephemeral. It never records page
 * content, account details, or error objects in browser persistence.
 */
export function OperationalStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <>
      {!online && (
        <div className="operational-banner" role="status" aria-live="polite">
          You’re offline. Odoc will not retry or send edits until you reconnect.
        </div>
      )}
    </>
  );
}
