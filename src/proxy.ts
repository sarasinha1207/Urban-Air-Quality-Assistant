import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

/**
 * Next.js proxy (formerly middleware): attaches a nonce-based CSP to every page response and to
 * the forwarded request, which is how Next learns the nonce to stamp on its own scripts.
 * @param request - Incoming page request.
 * @returns The response carrying the Content-Security-Policy header.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|icon.svg).*)"] };
