/**
 * TanStack Query hooks over the typed API client.
 *
 * Each hook owns its `queryKey` shape — keep them stable and serializable
 * because Query uses them for cache identity and for invalidation in
 * mutations. Stale times are tuned per resource:
 *
 * - `/me` and `/profile` rarely change → 5 min stale
 * - `/today`, `/trend`, `/history` track measurements that arrive via
 *   the daily Withings sync → 1 min is enough; user actions (manual
 *   entry, profile change) explicitly invalidate.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { unwrap } from "./errors";
import type { components } from "./types";

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

type ProfilePayload = components["schemas"]["ProfilePayload"];

export function useMe() {
	return useQuery({
		queryKey: ["me"],
		queryFn: () => unwrap(api.GET("/me")),
		staleTime: FIVE_MINUTES,
	});
}

export function useToday() {
	return useQuery({
		queryKey: ["today"],
		queryFn: () => unwrap(api.GET("/today")),
		staleTime: ONE_MINUTE,
	});
}

export function useTrend(days: number) {
	return useQuery({
		queryKey: ["trend", days],
		queryFn: () => unwrap(api.GET("/trend", { params: { query: { days } } })),
		staleTime: ONE_MINUTE,
	});
}

export function useHistory(from: Date, to: Date) {
	const fromIso = from.toISOString();
	const toIso = to.toISOString();
	return useQuery({
		queryKey: ["history", fromIso, toIso],
		queryFn: () =>
			unwrap(
				api.GET("/history", {
					params: { query: { from: fromIso, to: toIso } },
				}),
			),
		staleTime: ONE_MINUTE,
	});
}

export function useProfile() {
	return useQuery({
		queryKey: ["profile"],
		// 404 is a real "no profile yet" state; surface it as `error` and
		// let the page render an empty form. Don't retry 404s.
		queryFn: () => unwrap(api.GET("/profile")),
		staleTime: FIVE_MINUTES,
		retry: false,
	});
}

export function useUpdateProfile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (payload: ProfilePayload) =>
			unwrap<void>(api.PUT("/profile", { body: payload })),
		onSuccess: () => {
			// Profile changes affect TDEE/daily target → bust /today too.
			qc.invalidateQueries({ queryKey: ["profile"] });
			qc.invalidateQueries({ queryKey: ["today"] });
		},
	});
}
