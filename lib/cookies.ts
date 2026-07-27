/** Browser cookie helpers for preferences the server also needs to read. */
export function setPreferenceCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}
