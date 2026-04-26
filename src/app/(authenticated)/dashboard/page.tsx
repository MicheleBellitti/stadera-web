/**
 * Dashboard.
 *
 * Five KPIs sourced from the backend's `/today` endpoint:
 *
 * - Latest weight (and 7-day delta if available)
 * - BMI
 * - Daily kcal target (TDEE − 500 kcal, floored at 1200)
 * - Daily protein target (1.6 g/kg goal weight)
 * - Latest body fat / lean mass when present (Withings smart scales
 *   provide them, manual entries don't)
 *
 * Some KPIs are conditional on profile completeness:
 * - Daily target needs lean_mass (BMR Katch-McArdle), so smart-scale
 *   readings are required.
 * - BMI needs height (from /profile).
 *
 * Loading: skeleton tiles. Error: red banner. Empty (no measurements
 * yet): friendly nudge to set up Withings.
 */

"use client";

import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToday } from "@/lib/api/queries";

export default function DashboardPage() {
	const { data, isLoading, error } = useToday();

	if (isLoading) return <DashboardSkeleton />;
	if (error) return <ErrorBanner message={error.message} />;
	if (!data) return null;

	const { user, latest, weekly_delta_kg, bmi, daily_target } = data;

	const latestWeightLabel = latest ? `${latest.weight_kg.toFixed(1)} kg` : "—";

	const lastReadingLabel = latest
		? format(new Date(latest.taken_at), "EEE d MMM, HH:mm")
		: "no readings yet";

	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">
					Hi, {user.name.split(" ")[0]}
				</h1>
				<p className="text-sm text-muted-foreground">
					Last reading: {lastReadingLabel}
				</p>
			</header>

			{!latest && <EmptyState />}

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Kpi
					label="Weight"
					value={latestWeightLabel}
					hint={
						weekly_delta_kg != null
							? `${weekly_delta_kg >= 0 ? "+" : ""}${weekly_delta_kg.toFixed(1)} kg vs 7d`
							: undefined
					}
				/>
				<Kpi
					label="BMI"
					value={bmi != null ? bmi.toFixed(1) : "—"}
					hint={bmi != null ? bmiBand(bmi) : "set height in profile"}
				/>
				<Kpi
					label="Daily kcal"
					value={
						daily_target != null ? `${Math.round(daily_target.kcal)} kcal` : "—"
					}
					hint={
						daily_target == null
							? "needs lean mass + profile"
							: "TDEE − 500 kcal"
					}
				/>
				<Kpi
					label="Daily protein"
					value={
						daily_target != null
							? `${Math.round(daily_target.protein_g)} g`
							: "—"
					}
					hint="1.6 g per kg goal"
				/>
			</div>

			{latest && (
				<div className="grid gap-4 md:grid-cols-2">
					<Kpi
						label="Body fat"
						value={
							latest.body_fat_percent != null
								? `${latest.body_fat_percent.toFixed(1)} %`
								: "—"
						}
						hint="from Withings"
					/>
					<Kpi
						label="Lean mass"
						value={
							latest.lean_mass_kg != null
								? `${latest.lean_mass_kg.toFixed(1)} kg`
								: "—"
						}
						hint="from Withings"
					/>
				</div>
			)}
		</div>
	);
}

function Kpi({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium text-muted-foreground">
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-semibold tracking-tight">{value}</div>
				{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
			</CardContent>
		</Card>
	);
}

function bmiBand(bmi: number): string {
	if (bmi < 18.5) return "underweight";
	if (bmi < 25) return "normal";
	if (bmi < 30) return "overweight";
	return "obese";
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-64" />
			</div>
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
