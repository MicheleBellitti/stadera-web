/**
 * Client-side provider tree.
 *
 * `QueryClient` is created via `useState` rather than module-level so each
 * SSR pass and each browser tab gets a fresh instance — sharing one across
 * users would leak cached data between requests in any setup with multiple
 * concurrent users (in our single-tenant world this is mostly defensive
 * future-proofing, but the cost is zero so we follow the standard
 * pattern).
 *
 * Defaults:
 * - 401s never retry (auth is broken; refetching won't fix it).
 * - Other 4xx don't retry (validation errors are deterministic).
 * - 5xx retries up to 3 times with exponential backoff (default).
 * - `refetchOnWindowFocus` off because measurement data only changes once
 *   per day after the sync job runs.
 */

"use client";

import {
	QueryClient,
	type QueryClientConfig,
	QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ApiError } from "./api/errors";

const queryClientConfig: QueryClientConfig = {
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => {
				if (error instanceof ApiError) {
					if (error.status >= 400 && error.status < 500) return false;
				}
				return failureCount < 3;
			},
		},
	},
};

export function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => new QueryClient(queryClientConfig));

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	);
}
