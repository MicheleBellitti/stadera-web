/**
 * Coach page — stat-driven reflections + a contextual nudge.
 *
 * All stats are computed client-side from `/today` + `/trend?days=30`
 * and `/profile` data the user already has cached. No new backend
 * endpoint required for Phase 1.
 *
 * Layout (top to bottom):
 *
 * 1. Hero coach message — colored by tone (celebration / encouragement
 *    / caution / reset). One sentence + concrete next action.
 * 2. Goal progress bar — % from start to goal weight.
 * 3. Stat tiles: streak, plateau days (or "moving"), forecast, direction.
 *
 * The tone shapes the visual: green border for celebration, red for
 * caution, neutral for everything else. The message is the "what to
 * do next", not flattery.
 */

"use client";

import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { useProfile, useToday, useTrend } from "@/lib/api/queries";
import { type CoachOutput, type CoachTone, computeCoach } from "@/lib/coach";
import { cn } from "@/lib/utils";

export default function CoachPage() {
	const today = useToday();
	const trend = useTrend(30);
	const profile = useProfile();

	if (today.isLoading || trend.isLoading) return <CoachSkeleton />;
	if (today.error) return <ErrorBanner message={today.error.message} />;

	const goalWeight =
		profile.error instanceof ApiError && profile.error.status === 404
			? null
			: (profile.data?.goal_weight_kg ?? null);

	const measurements = trend.data?.measurements ?? [];
	const currentWeight = today.data?.latest?.weight_kg ?? null;

	const coach: CoachOutput = computeCoach({
		measurements,
		currentWeightKg: currentWeight,
		goalWeightKg: goalWeight,
		today: new Date(),
	});

	return (
		<div className="space-y-6 max-w-4xl">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
				<p className="text-sm text-muted-foreground">
					{format(new Date(), "EEEE d MMMM yyyy")}
				</p>
			</header>

			<MessageCard tone={coach.tone} message={coach.message} />

			{coach.stats.goalProgressPercent !== null && (
				<GoalProgress
					percent={coach.stats.goalProgressPercent}
					currentKg={currentWeight}
					goalKg={goalWeight}
				/>
			)}

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatTile
					label="Streak"
					value={`${coach.stats.streakDays}`}
					hint={
						coach.stats.streakDays === 0
							? "weigh in to start"
							: coach.stats.streakDays === 1
								? "first day — keep going"
								: "consecutive days"
					}
				/>
				<StatTile
					label="Status"
					value={
						coach.stats.plateauDays !== null
							? `Plateau ${coach.stats.plateauDays}d`
							: "Moving"
					}
					hint={
						coach.stats.plateauDays !== null
							? "weight stable in window"
							: "trending toward goal"
					}
				/>
				<StatTile
					label="Forecast"
					value={
						coach.stats.forecastDaysToGoal === null
							? "—"
							: coach.stats.forecastDaysToGoal === 0
								? "at goal"
								: `${coach.stats.forecastDaysToGoal}d`
					}
					hint={
						coach.stats.forecastDaysToGoal === null
							? "set goal + need 14d data"
							: "at current rate"
					}
				/>
				<StatTile
					label="Direction (14d)"
					value={`${Math.round(coach.stats.directionScore * 100)}%`}
					hint="days moving toward goal"
				/>
			</div>
		</div>
	);
}

function MessageCard({ tone, message }: { tone: CoachTone; message: string }) {
	const styles = toneStyles(tone);
	return (
		<Card className={cn("border-l-4", styles.borderClass)}>
			<CardContent className="py-6">
				<div className="flex items-start gap-3">
					<span className={cn("text-2xl", styles.iconClass)}>
						{styles.icon}
					</span>
					<p className="text-base leading-relaxed">{message}</p>
				</div>
			</CardContent>
		</Card>
	);
}

function toneStyles(tone: CoachTone): {
	borderClass: string;
	iconClass: string;
	icon: string;
} {
	switch (tone) {
		case "celebration":
			return {
				borderClass: "border-l-positive",
				iconClass: "text-positive",
				icon: "✨",
			};
		case "caution":
			return {
				borderClass: "border-l-negative",
				iconClass: "text-negative",
				icon: "⚠",
			};
		case "reset":
			return {
				borderClass: "border-l-negative",
				iconClass: "text-negative",
				icon: "↻",
			};
		default:
			return {
				borderClass: "border-l-brand",
				iconClass: "text-brand",
				icon: "→",
			};
	}
}

function GoalProgress({
	percent,
	currentKg,
	goalKg,
}: {
	percent: number;
	currentKg: number | null;
	goalKg: number | null;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Goal progress
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-baseline justify-between">
					<span className="text-3xl font-semibold tracking-tight tabular-nums">
						{percent.toFixed(0)}%
					</span>
					{currentKg !== null && goalKg !== null && (
						<span className="text-sm text-muted-foreground tabular-nums">
							{currentKg.toFixed(1)} → {goalKg.toFixed(1)} kg
						</span>
					)}
				</div>
				<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						className="h-full rounded-full bg-brand transition-all"
						style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function StatTile({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint: string;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-semibold tracking-tight tabular-nums">
					{value}
				</div>
				<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
			</CardContent>
		</Card>
	);
}

function CoachSkeleton() {
	return (
		<div className="space-y-6 max-w-4xl">
			<div className="space-y-2">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-4 w-56" />
			</div>
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-24 w-full" />
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton has no stable id
						key={i}
						className="h-28 w-full"
					/>
				))}
			</div>
		</div>
	);
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
			Failed to load coach: {message}
		</div>
	);
}
