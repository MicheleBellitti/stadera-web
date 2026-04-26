/**
 * Server-side typed client for the Stadera backend.
 *
 * Use from RSC, route handlers, and server actions. Forwards the incoming
 * request's cookies (specifically `stadera_session`) to the backend so the
 * call is authenticated. RSC `fetch` doesn't auto-attach browser cookies
 * the way a client-side `fetch` does — we have to lift them out of
 * `next/headers` and inject them.
 *
 * `cache: "no-store"` opts out of Next.js's data cache: every endpoint
 * here is user-specific and must not be shared across requests. We trade
 * Next-level caching for TanStack Query caching on the client.
 */

import "server-only";
import { cookies } from "next/headers";
import createClient from "openapi-fetch";
import { API_URL } from "./client";
import type { paths } from "./types";

export async function getServerApi() {
	const cookieHeader = (await cookies()).toString();
	return createClient<paths>({
		baseUrl: API_URL,
		headers: cookieHeader ? { cookie: cookieHeader } : undefined,
		cache: "no-store",
	});
}
