/**
 * Dashboard — health-metrics overview.
 *
 * Composition (top to bottom):
 *
 * 1. Greeting + last-reading timestamp
 * 2. Hero KpiCard — latest weight, big number, weekly delta badge,
 *    30d sparkline. The headline metric.
 * 3. 4-tile KPI grid: BMI, daily kcal target, daily protein target,
 *    body fat %.
 * 4. Lean mass row (when present) + (future) body composition donut.
 *
 * Data sources:
 *
 * - `/today` for the current values (latest, weekly_delta_kg, bmi,
 *   daily_target).
 * - `/trend?days=30` for the sparkline series.
 * - `/profile` for the goal weight, used to disambiguate "weight up
 *   is good" (bulking) vs "weight down is good" (cutting).
 *
 * The two queries fire in parallel — TanStack Query handles dedup if
 * any other route already cached them.
 */

"use client";

import { format } from "date-fns";
import { KpiCard } from "@/components/kpi-card";
import type { Tone } from "@/components/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { useProfile, useToday, useTrend } from "@/lib/api/queries";

export default function DashboardPage() {
	const today = useToday();
	const trend = useTrend(30);
	const profile = useProfile();

	if (today.isLoading) return <DashboardSkeleton />;
	if (today.error) return <ErrorBanner message={today.error.message} />;
	if (!today.data) return null;

	const { user, latest, weekly_delta_kg, bmi, daily_target } = today.data;

	// Profile may legitimately be 404 (user hasn't set one yet) — we
	// surface it as "no goal context" rather than an error.
	const goalWeight =
		profile.error instanceof ApiError && profile.error.status === 404
			? null
			: (profile.data?.goal_weight_kg ?? null);

	const measurements = trend.data?.measurements ?? [];
	const weightSeries = measurements.map((m) => ({ value: m.weight_kg }));
	const bodyFatSeries = measurements
		.filter((m) => m.body_fat_percent != null)
		.map((m) => ({ value: m.body_fat_percent as number }));
	const leanMassSeries = measurements
		.filter((m) => m.lean_mass_kg != null)
		.map((m) => ({ value: m.lean_mass_kg as number }));

	const weightTone = computeWeightTone(
		weekly_delta_kg ?? null,
		latest?.weight_kg ?? null,
		goalWeight,
	);
	const weightDirection = directionFromDelta(weekly_delta_kg ?? null);

	const lastReadingLabel = latest
		? format(new Date(latest.taken_at), "EEE d MMM, HH:mm")
		: "no readings yet";

	return (
		<div className="space-y-6 max-w-6xl">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">
					Hi, {user.name.split(" ")[0]}
				</h1>
				<p className="text-sm text-muted-foreground">
					Last reading · {lastReadingLabel}
				</p>
			</header>

			{!latest && <EmptyState />}

			<KpiCard
				variant="hero"
				label="Latest weight"
				value={latest ? `${latest.weight_kg.toFixed(1)} kg` : "—"}
				delta={
					weekly_delta_kg != null
						? `${weekly_delta_kg >= 0 ? "+" : ""}${weekly_delta_kg.toFixed(1)} kg vs 7d`
						: undefined
				}
				direction={weightDirection}
				tone={weightTone}
				hint={
					goalWeight != null && latest
						? `${(latest.weight_kg - goalWeight).toFixed(1)} kg from goal of ${goalWeight.toFixed(1)} kg`
						: goalWeight == null
							? "set goal weight in profile to track progress"
							: undefined
				}
				sparkline={weightSeries}
			/>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="BMI"
					value={bmi != null ? bmi.toFixed(1) : "—"}
					hint={bmi != null ? bmiBand(bmi) : "needs height in profile"}
				/>
				<KpiCard
					label="Daily kcal"
					value={
						daily_target != null ? `${Math.round(daily_target.kcal)}` : "—"
					}
					hint={
						daily_target != null
							? "TDEE − 500 kcal"
							: "needs profile + lean mass"
					}
				/>
				<KpiCard
					label="Daily protein"
					value={
						daily_target != null
							? `${Math.round(daily_target.protein_g)} g`
							: "—"
					}
					hint="1.6 g per kg goal weight"
				/>
				<KpiCard
					label="Body fat"
					value={
						latest?.body_fat_percent != null
							? `${latest.body_fat_percent.toFixed(1)}%`
							: "—"
					}
					hint="from Withings smart scale"
					sparkline={bodyFatSeries}
				/>
			</div>

			{leanMassSeries.length > 0 && (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<KpiCard
						label="Lean mass"
						value={
							latest?.lean_mass_kg != null
								? `${latest.lean_mass_kg.toFixed(1)} kg`
								: "—"
						}
						hint="muscle + water + bone"
						sparkline={leanMassSeries}
						tone="neutral"
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Goal-aware sentiment for weight changes.
 *
 * - No goal set / no current weight → neutral (no context to judge).
 * - Goal weight ≈ current weight (within 0.5 kg) → maintenance:
 *   small drift fine, larger drift either direction is negative.
 * - Cutting goal (goal < current) → losing is positive, gaining is negative.
 * - Bulking goal (goal > current) → reverse.
 *
 * The 0.05 kg/week threshold avoids flipping tone on noise (smart
 * scales are ±0.1 kg precision day-to-day).
 */
function computeWeightTone(
	weeklyDelta: number | null,
	latest: number | null,
	goal: number | null,
): Tone {
	if (weeklyDelta == null || latest == null || goal == null) return "neutral";
	const distanceFromGoal = Math.abs(latest - goal);
	const cutting = goal < latest;

	if (distanceFromGoal < 0.5) {
		// Maintenance band: stable is good, drifting > 0.5 kg/wk is not.
		return Math.abs(weeklyDelta) < 0.5 ? "positive" : "negative";
	}
	if (Math.abs(weeklyDelta) < 0.05) return "neutral";

	if (cutting) {
		return weeklyDelta < 0 ? "positive" : "negative";
	}
	// bulking
	return weeklyDelta > 0 ? "positive" : "negative";
}

function directionFromDelta(d: number | null): "up" | "down" | "flat" {
	if (d == null || Math.abs(d) < 0.05) return "flat";
	return d > 0 ? "up" : "down";
}

function bmiBand(bmi: number): string {
	if (bmi < 18.5) return "underweight";
	if (bmi < 25) return "normal range";
	if (bmi < 30) return "overweight";
	return "obese";
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6 max-w-6xl">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-64" />
			</div>
			<Skeleton className="h-48 w-full" />
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton has no stable id
						key={i}
						className="h-32 w-full"
					/>
				))}
			</div>
		</div>
	);
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
			Failed to load dashboard: {message}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="rounded-md border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
			No measurements yet. Step on your Withings scale or wait for the daily
			sync to populate this view.
		</div>
	);
}
