/**
 * Auth gate + chrome for everything under the `(authenticated)` route group.
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
 * The extra `/me` request per page-load is cheap; the inner pages
 * re-fetch via TanStack Query for the data they need. We can hydrate the
 * Query cache from the server later if it becomes a hot path.
 */

import { redirect } from "next/navigation";
import { MobileBar, Sidebar } from "@/components/nav";
import { getServerApi } from "@/lib/api/server";

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

	return (
		<div className="flex flex-1 min-h-full">
			<Sidebar />
			<div className="flex flex-1 flex-col">
				<MobileBar />
				<main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
					{children}
				</main>
			</div>
		</div>
	);
}
