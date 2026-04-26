/**
 * Dashboard placeholder.
 *
 * This is intentionally barebones: PR-FE B only needs to prove the auth
 * round-trip works (cookie → `/me` → typed user data) and that
 * sign-out invalidates the session. PR-FE C replaces this with the real
 * KPI tiles (today's weight, weekly delta, daily target) backed by
 * `useToday`.
 */

"use client";

import { API_URL } from "../../../lib/api/client";
import { useMe } from "../../../lib/api/queries";

export default function DashboardPage() {
	const { data: me, isLoading, error } = useMe();

	return (
		<main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
			<div className="w-full max-w-md flex flex-col items-center text-center gap-6">
				<h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>

				{isLoading && (
					<p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
				)}

				{error && (
					<p className="text-red-600 dark:text-red-400">
						Failed to load user: {error.message}
					</p>
				)}

				{me && (
					<div className="flex flex-col items-center gap-2">
						<p className="text-lg">
							Signed in as <strong>{me.name}</strong>
						</p>
						<p className="text-sm text-zinc-500 dark:text-zinc-400">
							{me.email}
						</p>
					</div>
				)}

				{/*
				 * Plain HTML form POST rather than a fetch + redirect dance: the
				 * browser submits with cookies attached automatically, the
				 * backend deletes the session, and the 302 from
				 * `/auth/logout` lands back on `/` where the unauthenticated
				 * landing renders.
				 */}
				<form action={`${API_URL}/auth/logout`} method="post">
					<button
						type="submit"
						className="inline-flex items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
					>
						Sign out
					</button>
				</form>
			</div>
		</main>
	);
}
