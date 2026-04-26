/**
 * Measurement history.
 *
 * Table of every measurement in a user-controlled window. Default window
 * is "last 30 days, ending now". The backend's `/history` is exclusive on
 * `to`, so we normalize the upper bound to "tomorrow at midnight UTC" to
 * make sure we include today's reading without playing timezone games.
 *
 * Source column is the provenance string (`withings` or `manual`); we
 * prettify it inline.
 *
 * Pagination is deferred — even a year of daily Withings readings is
 * ~365 rows, which renders fine without virtualization.
 */

"use client";

import { format, subDays } from "date-fns";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useHistory } from "@/lib/api/queries";

const WINDOWS = [
	{ days: 7, label: "7d" },
	{ days: 30, label: "30d" },
	{ days: 90, label: "90d" },
	{ days: 365, label: "1y" },
] as const;

export default function HistoryPage() {
	const [days, setDays] = useState<number>(30);
	const { from, to } = useMemo(() => buildWindow(days), [days]);
	const { data, isLoading, error } = useHistory(from, to);

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between flex-wrap gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">History</h1>
					<p className="text-sm text-muted-foreground">
						{format(from, "d MMM yyyy")} → {format(to, "d MMM yyyy")}
					</p>
				</div>
				<div className="flex gap-2">
					{WINDOWS.map((w) => (
						<Button
							key={w.days}
							variant={w.days === days ? "default" : "outline"}
							size="sm"
							onClick={() => setDays(w.days)}
						>
							{w.label}
						</Button>
					))}
				</div>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Measurements
					</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading && (
						<div className="space-y-2">
							{Array.from({ length: 6 }).map((_, i) => (
								<Skeleton
									// biome-ignore lint/suspicious/noArrayIndexKey: skeleton has no stable id
									key={i}
									className="h-8 w-full"
								/>
							))}
						</div>
					)}
					{error && (
						<p className="text-sm text-destructive">
							Failed to load history: {error.message}
						</p>
					)}
					{data && data.measurements.length === 0 && (
						<p className="text-sm text-muted-foreground py-12 text-center">
							No measurements in this window.
						</p>
					)}
					{data && data.measurements.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead className="text-right">Weight (kg)</TableHead>
									<TableHead className="text-right">Body fat (%)</TableHead>
									<TableHead className="text-right">Lean mass (kg)</TableHead>
									<TableHead>Source</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{[...data.measurements].reverse().map((m) => (
									<TableRow key={`${m.taken_at}-${m.source}`}>
										<TableCell className="font-mono text-xs text-muted-foreground">
											{format(new Date(m.taken_at), "d MMM yyyy, HH:mm")}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{m.weight_kg.toFixed(2)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{m.body_fat_percent != null
												? m.body_fat_percent.toFixed(1)
												: "—"}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{m.lean_mass_kg != null ? m.lean_mass_kg.toFixed(2) : "—"}
										</TableCell>
										<TableCell className="capitalize text-muted-foreground">
											{m.source}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function buildWindow(days: number): { from: Date; to: Date } {
	const now = new Date();
	// Exclusive upper bound: bump to tomorrow midnight so today's readings
	// are included regardless of timezone. The backend stores everything
	// in UTC; we send UTC bounds to avoid drift.
	const to = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
	);
	const from = subDays(to, days);
	return { from, to };
}
