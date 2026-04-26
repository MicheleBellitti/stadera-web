/**
 * Public landing page.
 *
 * Two responsibilities:
 *
 * 1. If the user already has a valid `stadera_session` cookie, send them
 *    straight to `/dashboard` instead of forcing a manual click. This is
 *    the page Google's OAuth callback redirects back to, so without this
 *    step a freshly-authenticated user would see the marketing UI again.
 * 2. Otherwise render the single CTA "Sign in with Google", which is a
 *    plain `<a>` to the backend's `/auth/google/start`. The full-page
 *    navigation (rather than `fetch`) is required so the cookie set by
 *    the backend after consent is visible to the browser when it lands
 *    back on this app.
 */

import { redirect } from "next/navigation";
import { API_URL } from "../lib/api/client";
import { getServerApi } from "../lib/api/server";

export default async function HomePage() {
	const api = await getServerApi();
	const { response } = await api.GET("/me");
	if (response.ok) {
		redirect("/dashboard");
	}

	return (
		<main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
			<div className="w-full max-w-md flex flex-col items-center text-center">
				<h1 className="text-5xl font-semibold tracking-tight">Stadera</h1>
				<p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
					Personal weight tracking and nutrition coaching, integrated with
					Withings smart scales.
				</p>
				<a
					href={`${API_URL}/auth/google/start`}
					className="mt-12 inline-flex items-center justify-center rounded-md bg-zinc-900 px-6 py-3 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:outline-zinc-100"
				>
					Sign in with Google
				</a>
				<p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
					You'll be redirected to Google to authorize Stadera, then back here.
				</p>
			</div>
		</main>
	);
}
