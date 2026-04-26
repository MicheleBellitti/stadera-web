/**
 * Weight trend chart.
 *
 * Recharts LineChart of weight over time, with two series:
 *
 * - raw daily readings (dot per measurement)
 * - the 7-day moving average computed by the backend (`TrendResponse`)
 *   joined into the same series points
 *
 * Range selector flips between 30 / 90 / 365 days. The backend caps at
 * 365 (utoipa schema enforces it), so we don't surface anything longer.
 *
 * Empty state: a friendly note when the user has no data in the chosen
 * window. Loading: skeleton chart-shape. Error: red banner.
 */

"use client";

import { format } from "date-fns";
import { useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrend } from "@/lib/api/queries";

const RANGES = [
	{ days: 30, label: "30d" },
	{ days: 90, label: "90d" },
	{ days: 365, label: "1y" },
] as const;

export default function TrendPage() {
	const [days, setDays] = useState<number>(30);
	const { data, isLoading, error } = useTrend(days);

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold tracking-tight">Trend</h1>
				<div className="flex gap-2">
					{RANGES.map((r) => (
						<Button
							key={r.days}
							variant={r.days === days ? "default" : "outline"}
							size="sm"
							onClick={() => setDays(r.days)}
						>
							{r.label}
						</Button>
					))}
				</div>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Weight (kg)
					</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading && <Skeleton className="h-72 w-full" />}
					{error && (
						<p className="text-sm text-destructive">
							Failed to load trend: {error.message}
						</p>
					)}
					{data && data.measurements.length === 0 && (
						<p className="text-sm text-muted-foreground py-12 text-center">
							No measurements in the last {days} days.
						</p>
					)}
					{data && data.measurements.length > 0 && <TrendChart data={data} />}
				</CardContent>
			</Card>

			{data && data.measurements.length > 0 && (
				<div className="grid gap-4 md:grid-cols-3">
					<StatCard label="Mean" value={`${meanKg(data).toFixed(1)} kg`} />
					<StatCard
						label="Δ over window"
						value={(() => {
							const d = windowDeltaKg(data);
							return `${d >= 0 ? "+" : ""}${d.toFixed(1)} kg`;
						})()}
					/>
					<StatCard
						label="7-day moving avg"
						value={
							data.moving_average_7d_kg != null
								? `${data.moving_average_7d_kg.toFixed(1)} kg`
								: "—"
						}
					/>
				</div>
			)}
		</div>
	);
}

type TrendData = NonNullable<ReturnType<typeof useTrend>["data"]>;

function TrendChart({ data }: { data: TrendData }) {
	// Recharts wants a flat array of records — map taken_at → epoch ms so
	// the X axis is numeric (otherwise irregular spacing breaks the
	// continuous-time look).
	const points = data.measurements.map((m) => ({
		t: new Date(m.taken_at).getTime(),
		weight: m.weight_kg,
	}));

	// Y-axis padding: pad domain by ~5% of range so the line never
	// touches the top/bottom edges. `["auto", "auto"]` Recharts default
	// is too tight, especially when weight wiggles in a 1-2 kg band.
	const values = points.map((p) => p.weight);
	const yMin = Math.min(...values);
	const yMax = Math.max(...values);
	const yPad = Math.max(0.5, (yMax - yMin) * 0.15);

	return (
		<ResponsiveContainer width="100%" height={320}>
			<AreaChart
				data={points}
				margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
			>
				<defs>
					{/* Soft area fill under the line — gradient from brand color
					 * at the top fading to transparent at the bottom. Standard
					 * health-app chart treatment, gives the line visual weight
					 * without dominating the canvas. */}
					<linearGradient id="trend-gradient" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--brand)" stopOpacity={0.25} />
						<stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
					</linearGradient>
				</defs>
				<CartesianGrid
					strokeDasharray="3 3"
					stroke="var(--border)"
					vertical={false}
				/>
				<XAxis
					dataKey="t"
					type="number"
					domain={["dataMin", "dataMax"]}
					tickFormatter={(t: number) => format(new Date(t), "d MMM")}
					stroke="var(--muted-foreground)"
					fontSize={12}
					tickLine={false}
					axisLine={{ stroke: "var(--border)" }}
				/>
				<YAxis
					domain={[yMin - yPad, yMax + yPad]}
					stroke="var(--muted-foreground)"
					fontSize={12}
					width={48}
					tickLine={false}
					axisLine={false}
					tickFormatter={(v: number) => v.toFixed(1)}
				/>
				<Tooltip
					labelFormatter={(t) =>
						format(new Date(Number(t)), "EEE d MMM yyyy, HH:mm")
					}
					formatter={(value) => [
						typeof value === "number" ? `${value.toFixed(2)} kg` : "—",
						"Weight",
					]}
					contentStyle={{
						background: "var(--popover)",
						border: "1px solid var(--border)",
						borderRadius: "var(--radius-md)",
						color: "var(--popover-foreground)",
						boxShadow: "var(--shadow-md)",
					}}
					cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
				/>
				<Area
					type="monotone"
					dataKey="weight"
					stroke="var(--brand)"
					strokeWidth={2}
					fill="url(#trend-gradient)"
					dot={false}
					activeDot={{ r: 4, fill: "var(--brand)" }}
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}

function meanKg(data: TrendData): number {
	const sum = data.measurements.reduce((s, m) => s + m.weight_kg, 0);
	return sum / data.measurements.length;
}

function windowDeltaKg(data: TrendData): number {
	// Backend returns measurements ordered by `taken_at` ascending; first is
	// the oldest in the window, last is the most recent.
	const first = data.measurements[0]?.weight_kg;
	const last = data.measurements[data.measurements.length - 1]?.weight_kg;
	if (first == null || last == null) return 0;
	return last - first;
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium text-muted-foreground">
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="text-xl font-semibold tracking-tight">{value}</div>
			</CardContent>
		</Card>
	);
}
