/**
 * Tiny inline trend chart for KPI tiles.
 *
 * No axes, no grid, no tooltip — just the curve. Designed to read at a
 * glance without parsing axis labels: the eye sees "going up / going
 * down / wiggling around flat" in <500ms. Standard pattern in
 * health-app dashboards (Withings, Apple Health, WHOOP).
 *
 * Color is driven by the `tone` prop (positive / negative / neutral),
 * not by raw direction — because "good vs bad" is goal-dependent. For
 * a cutting goal a downward weight line is positive (green); for a
 * bulking goal it's negative. The parent decides; we just paint.
 */

"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export type Tone = "positive" | "negative" | "neutral";

interface SparklineProps {
	data: ReadonlyArray<{ value: number }>;
	tone?: Tone;
	height?: number;
	/** Override the auto color picked from `tone`. CSS var or hex. */
	color?: string;
}

export function Sparkline({
	data,
	tone = "neutral",
	height = 48,
	color,
}: SparklineProps) {
	if (data.length < 2) {
		// Not enough history to draw a meaningful line — leave the slot
		// empty so the surrounding card still lays out cleanly.
		return <div style={{ height }} />;
	}

	const stroke = color ?? `var(--${tone})`;

	return (
		<div style={{ height }} className="w-full">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart
					data={data as { value: number }[]}
					margin={{ top: 4, right: 2, bottom: 2, left: 2 }}
				>
					<Line
						type="monotone"
						dataKey="value"
						stroke={stroke}
						strokeWidth={1.75}
						dot={false}
						isAnimationActive={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
