/**
 * Accept only an in-app path as a post-authentication destination. Keeping
 * this in one place prevents login, logout, and expiration flows from ever
 * becoming open redirects.
 */
export function safeLocalReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\\\')
  ) {
    return '/';
  }
  try {
    const target = new URL(value, 'https://odoc.local');
    return target.origin === 'https://odoc.local'
      ? `${target.pathname}${target.search}${target.hash}`
      : '/';
  } catch {
    return '/';
  }
}
