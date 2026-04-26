/**
 * Standard KPI tile used across the dashboard.
 *
 * Two variants:
 *
 * - `default` — compact tile in a grid, value at ~24-32px, optional
 *   sparkline filling the bottom third.
 * - `hero`    — full-row card, value at ~56-72px, prominent sparkline.
 *   Used for the headline metric (latest weight).
 *
 * The trend indicator is split into two orthogonal axes:
 *
 * - `direction` (`up` / `down` / `flat`): visual arrow. What the data
 *   actually does — purely numeric.
 * - `tone` (`positive` / `negative` / `neutral`): color. How we *feel*
 *   about that direction in context. The parent computes this against
 *   the user's goal (cutting → weight-down is positive, etc.).
 *
 * Defaults: direction `flat`, tone `neutral`. Both can be passed
 * independently — e.g. weight gain on a cut: direction=up, tone=negative.
 */

"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Sparkline, type Tone } from "@/components/sparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "flat";

interface KpiCardProps {
	label: string;
	value: string;
	hint?: string;
	direction?: Direction;
	tone?: Tone;
	delta?: string;
	/** Sparkline data, ordered oldest-first. Pass empty array to suppress. */
	sparkline?: ReadonlyArray<{ value: number }>;
	variant?: "default" | "hero";
	className?: string;
}

export function KpiCard({
	label,
	value,
	hint,
	direction = "flat",
	tone = "neutral",
	delta,
	sparkline,
	variant = "default",
	className,
}: KpiCardProps) {
	const isHero = variant === "hero";

	return (
		<Card
			className={cn(
				"transition-shadow hover:shadow-card-hover",
				isHero && "shadow-card",
				className,
			)}
		>
			<CardHeader className="pb-2">
				<CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</CardTitle>
			</CardHeader>

			<CardContent className="flex flex-col gap-3">
				<div className="flex items-baseline justify-between gap-3 flex-wrap">
					<span
						className={cn(
							"font-semibold tracking-tight tabular-nums",
							isHero ? "text-5xl md:text-6xl" : "text-2xl md:text-3xl",
						)}
					>
						{value}
					</span>
					{delta && (
						<TrendBadge tone={tone} direction={direction} delta={delta} />
					)}
				</div>

				{hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}

				{sparkline && sparkline.length > 1 && (
					<Sparkline data={sparkline} tone={tone} height={isHero ? 80 : 44} />
				)}
			</CardContent>
		</Card>
	);
}

function TrendBadge({
	tone,
	direction,
	delta,
}: {
	tone: Tone;
	direction: Direction;
	delta: string;
}) {
	const Icon =
		direction === "up"
			? ArrowUpRight
			: direction === "down"
				? ArrowDownRight
				: ArrowRight;

	const colorClass =
		tone === "positive"
			? "text-positive bg-positive/10"
			: tone === "negative"
				? "text-negative bg-negative/10"
				: "text-neutral bg-muted";

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
				colorClass,
			)}
		>
			<Icon className="size-3" />
			{delta}
		</span>
	);
}
