/**
 * Auth gate for everything under the `(authenticated)` route group.
 *
 * The parentheses make `(authenticated)` a Next.js *route group*: it
 * doesn't show up in the URL (so `/dashboard` not `/authenticated/dashboard`)
 * but it *does* introduce a shared layout. We exploit that to gate every
 * route below it on a real session check at the edge of the request.
 *
 * Doing the check server-side (rather than client-side via `useMe`) gives
 * us:
 *
 * - **No flash of unauthenticated content.** The redirect happens before
 *   any HTML is streamed.
 * - **Hard guard.** Even with JS disabled or a malicious client, the
 *   server simply won't render protected pages without a valid cookie.
 *
 * The downside is one extra `/me` request per protected page-load; the
 * inner pages re-fetch via TanStack Query for the actual user data they
 * need. Cheap in dev, and we can hydrate the Query cache from the server
 * later (M5+) if it becomes a hot path.
 */

import { redirect } from "next/navigation";
import { getServerApi } from "../../lib/api/server";

export default async function AuthenticatedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const api = await getServerApi();
	const { response } = await api.GET("/me");

	if (response.status === 401) {
		redirect("/");
	}
	if (!response.ok) {
		// 5xx or network error — fail loud rather than silently redirect.
		throw new Error(`auth check failed: backend returned ${response.status}`);
	}

	return <>{children}</>;
}
