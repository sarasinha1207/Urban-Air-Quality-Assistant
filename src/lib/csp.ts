/**
 * Builds the Content-Security-Policy for one response. Scripts need the per-request nonce; the
 * page only talks to its own origin because all third-party calls happen on the server.
 * @param nonce - Fresh random nonce for this request.
 * @param isDev - Relaxes script and style rules that Next's dev tooling needs.
 * @returns The header value.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // A nonce makes browsers ignore 'unsafe-inline', so dev (whose overlay injects un-nonced styles)
    // uses 'unsafe-inline' alone; production keeps the strict nonce.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
