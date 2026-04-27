/**
 * Stats-driven coaching logic. Pure client-side, no backend dep.
 *
 * The "coach" reads existing measurement data and produces:
 * - quantitative stats (streak, plateau, forecast, direction score)
 * - a textual coaching message determined by rules
 *
 * Why client-side: every input it needs is already in the user's
 * `/today` + `/trend?days=30` response. No new endpoint required.
 * If backend logic emerges that's domain-shared (e.g. coach for
 * notifications), we'd then move this to a Rust `domain::coach`
 * module + `/coach` endpoint and the FE just consumes. For Phase 1
 * the duplication isn't there yet.
 *
 * Why rules-based, not LLM: an LLM would give nicer language but
 * costs runtime $$. The rules below cover ~5 distinct user states
 * which is enough for daily nudges without paying inference per visit.
 */

import { differenceInCalendarDays, parseISO } from "date-fns";
import type { components } from "./api/types";

type MeasurementView = components["schemas"]["MeasurementView"];

export type CoachTone = "celebration" | "encouragement" | "caution" | "reset";

export interface CoachStats {
	/** Consecutive days, ending today, with at least one measurement. */
	streakDays: number;
	/**
	 * If the user's weight has stayed within `plateauThresholdKg` for
	 * the last `plateauWindowDays` days, this is the days-in-plateau
	 * count. `null` when actively moving (signal: cut/bulk is working).
	 */
	plateauDays: number | null;
	/**
	 * Linear extrapolation of "at the current rate, how many days until
	 * weight equals goal?". `null` if going wrong direction or already
	 * at goal.
	 */
	forecastDaysToGoal: number | null;
	/**
	 * 0..1 score of "what fraction of the last 14 days moved closer to
	 * goal". 1 = perfect adherence, 0 = entirely wrong direction.
	 */
	directionScore: number;
	/**
	 * Progress as % of total distance from starting weight to goal.
	 * `null` if no goal set or no historical data to infer "starting".
	 * 100 = at goal, 50 = halfway.
	 */
	goalProgressPercent: number | null;
}

export interface CoachOutput {
	stats: CoachStats;
	tone: CoachTone;
	message: string;
}

interface ComputeArgs {
	measurements: ReadonlyArray<MeasurementView>;
	currentWeightKg: number | null;
	goalWeightKg: number | null;
	today: Date;
}

const PLATEAU_WINDOW_DAYS = 14;
const PLATEAU_THRESHOLD_KG = 0.5;
const DIRECTION_WINDOW_DAYS = 14;
const PLATEAU_TRIGGER_DAYS = 14;
const STREAK_CELEBRATION = 30;
const FORECAST_NEAR_DAYS = 30;

export function computeCoach({
	measurements,
	currentWeightKg,
	goalWeightKg,
	today,
}: ComputeArgs): CoachOutput {
	const stats: CoachStats = {
		streakDays: computeStreak(measurements, today),
		plateauDays: computePlateauDays(measurements, today),
		forecastDaysToGoal: computeForecast(
			measurements,
			currentWeightKg,
			goalWeightKg,
		),
		directionScore: computeDirectionScore(
			measurements,
			currentWeightKg,
			goalWeightKg,
			today,
		),
		goalProgressPercent: computeGoalProgress(
			measurements,
			currentWeightKg,
			goalWeightKg,
		),
	};

	const { tone, message } = decideMessage(stats);
	return { stats, tone, message };
}

// ---- Streak ----------------------------------------------------------

/**
 * Count days, going back from `today`, that have at least one
 * measurement. The streak breaks at the first day with zero readings.
 */
function computeStreak(
	measurements: ReadonlyArray<MeasurementView>,
	today: Date,
): number {
	if (measurements.length === 0) return 0;

	// Bucket all measurements by their calendar day.
	const days = new Set<number>();
	for (const m of measurements) {
		const d = differenceInCalendarDays(parseISO(m.taken_at), today);
		days.add(d);
	}

	let streak = 0;
	let cursor = 0;
	while (days.has(cursor) || days.has(cursor - 1)) {
		// Allow a 1-day grace (yesterday counts as today's streak if
		// you just haven't weighed yet today). Without this, 99% of
		// users break their streak the moment they sleep in.
		streak += 1;
		cursor -= 1;
		if (streak > 365) break; // safety; nobody has a 365-day perfect streak
	}
	return streak;
}

// ---- Plateau ---------------------------------------------------------

/**
 * Plateau = max - min of weights in the last `PLATEAU_WINDOW_DAYS` is
 * within `PLATEAU_THRESHOLD_KG`. Returns the actual days-in-window
 * count, or null if not enough data or actively moving.
 */
function computePlateauDays(
	measurements: ReadonlyArray<MeasurementView>,
	today: Date,
): number | null {
	const recent = measurements.filter((m) => {
		const d = differenceInCalendarDays(parseISO(m.taken_at), today);
		return d > -PLATEAU_WINDOW_DAYS && d <= 0;
	});
	if (recent.length < 5) return null; // need at least 5 samples to infer

	const weights = recent.map((m) => m.weight_kg);
	const range = Math.max(...weights) - Math.min(...weights);
	if (range > PLATEAU_THRESHOLD_KG) return null;

	// Spans how many days of the window we have data.
	const earliest = recent.reduce((min, m) => {
		const d = differenceInCalendarDays(parseISO(m.taken_at), today);
		return Math.min(min, d);
	}, 0);
	return Math.abs(earliest);
}

// ---- Forecast --------------------------------------------------------

/**
 * Linear extrapolation: average daily delta from the last 14 days,
 * project days-to-goal. Returns null if direction is wrong (rate has
 * the same sign as (current-goal)) or already at goal.
 *
 * Math: a "right direction" is rate × sign(goal-current) > 0.
 * If you're cutting (goal < current, sign(goal-current) < 0),
 * rate must be negative (losing weight) for the product to be > 0.
 */
function computeForecast(
	measurements: ReadonlyArray<MeasurementView>,
	currentKg: number | null,
	goalKg: number | null,
): number | null {
	if (currentKg == null || goalKg == null) return null;
	if (Math.abs(currentKg - goalKg) < 0.5) return 0; // already at goal

	const ratePerDay = computeRecentRatePerDay(measurements);
	if (ratePerDay == null) return null;

	const distance = goalKg - currentKg;
	// Rate and distance must have the same sign (moving toward goal).
	if (Math.sign(distance) !== Math.sign(ratePerDay)) return null;
	if (Math.abs(ratePerDay) < 0.005) return null; // < 5g/day = noise, no useful forecast

	return Math.round(distance / ratePerDay);
}

/**
 * Average daily weight delta over the last 14 days. Computed as
 * (last - first) / span_days for simplicity (also robust to noisy
 * single-day swings — least-squares would be slightly better but adds
 * code with marginal accuracy gain over 14 days).
 */
function computeRecentRatePerDay(
	measurements: ReadonlyArray<MeasurementView>,
): number | null {
	if (measurements.length < 2) return null;
	const last14 = measurements.slice(-14);
	if (last14.length < 2) return null;

	const first = last14[0];
	const last = last14[last14.length - 1];
	if (!first || !last) return null;

	const days = differenceInCalendarDays(
		parseISO(last.taken_at),
		parseISO(first.taken_at),
	);
	if (days < 1) return null;

	return (last.weight_kg - first.weight_kg) / days;
}

// ---- Direction score -------------------------------------------------

/**
 * Of the last 14 days that have a weighing AND a previous day to compare
 * against, what fraction had weight moving toward goal?
 *
 * Edge case: when no goal set, return 0.5 (neutral) to avoid biasing
 * the message toward "good" or "bad".
 */
function computeDirectionScore(
	measurements: ReadonlyArray<MeasurementView>,
	currentKg: number | null,
	goalKg: number | null,
	today: Date,
): number {
	if (goalKg == null || currentKg == null) return 0.5;

	const wantDecrease = goalKg < currentKg;
	const recent = measurements
		.filter((m) => {
			const d = differenceInCalendarDays(parseISO(m.taken_at), today);
			return d > -DIRECTION_WINDOW_DAYS && d <= 0;
		})
		.sort(
			(a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime(),
		);

	if (recent.length < 2) return 0.5;

	let goodDays = 0;
	let totalDays = 0;
	for (let i = 1; i < recent.length; i++) {
		const cur = recent[i];
		const prev = recent[i - 1];
		if (!cur || !prev) continue;
		const delta = cur.weight_kg - prev.weight_kg;
		const goingDown = delta < 0;
		const movedRight = wantDecrease ? goingDown : !goingDown;
		if (Math.abs(delta) < 0.05) {
			// noise band — neither good nor bad, skip
			continue;
		}
		totalDays += 1;
		if (movedRight) goodDays += 1;
	}

	if (totalDays === 0) return 0.5;
	return goodDays / totalDays;
}

// ---- Goal progress ---------------------------------------------------

/**
 * Linear interpretation: "starting weight" = first measurement we have.
 * Progress = (start - current) / (start - goal), so 100% means at goal.
 *
 * Caveat: "starting" depends on when the user joined Stadera, not when
 * they started their actual journey. We could expose a `journey_start`
 * field on the profile — deferred to next phase.
 */
function computeGoalProgress(
	measurements: ReadonlyArray<MeasurementView>,
	currentKg: number | null,
	goalKg: number | null,
): number | null {
	if (currentKg == null || goalKg == null) return null;
	if (measurements.length === 0) return null;

	const first = measurements[0];
	if (!first) return null;
	const startKg = first.weight_kg;

	const totalDistance = startKg - goalKg;
	if (Math.abs(totalDistance) < 0.5) return 100; // start ≈ goal, already done

	const traveled = startKg - currentKg;
	const pct = (traveled / totalDistance) * 100;
	return Math.max(0, Math.min(100, pct));
}

// ---- Decision tree for tone + message --------------------------------

/**
 * Priority-ordered rules. The first that matches wins. Order encodes
 * narrative priority: "celebrate goal achieved" beats every other state,
 * "warn about wrong direction" beats "celebrate streak" because the
 * direction is the meaningful signal.
 *
 * Messages are deliberately short (≤ 2 sentences) and concrete: "do
 * X next" is more useful than "you're great". Tone shapes the FE
 * styling (color + icon).
 */
function decideMessage(stats: CoachStats): {
	tone: CoachTone;
	message: string;
} {
	// 1. Goal reached → celebrate, suggest maintenance shift
	if (stats.goalProgressPercent !== null && stats.goalProgressPercent >= 100) {
		return {
			tone: "celebration",
			message:
				"Goal raggiunto. Passa a maintenance: alza intake di +200/300 kcal e tieni il peso ±0.5 kg per 4 settimane prima di nuovi obiettivi.",
		};
	}

	// 2. Plateau over 2 weeks → caution, suggest variable change
	if (stats.plateauDays !== null && stats.plateauDays >= PLATEAU_TRIGGER_DAYS) {
		return {
			tone: "caution",
			message: `${stats.plateauDays} giorni in plateau. Probabile adattamento metabolico — abbassa deficit di 100 kcal o aggiungi 2 sessioni cardio leggero questa settimana.`,
		};
	}

	// 3. Direction wrong > 70% of recent days → reset, suggest profile review
	if (stats.directionScore < 0.3) {
		return {
			tone: "reset",
			message:
				"Negli ultimi 14 giorni stai andando contro il goal nel 70% dei casi. Controlla activity_level del profilo (potrebbe essere settato troppo alto) o rivedi le porzioni — il TDEE potrebbe essere sovrastimato.",
		};
	}

	// 4. Streak ≥ 30 days → celebrate habit
	if (stats.streakDays >= STREAK_CELEBRATION) {
		return {
			tone: "celebration",
			message: `${stats.streakDays} giorni consecutivi di tracking. Il sistema funziona — ora la sfida è continuare durante le settimane "noiose".`,
		};
	}

	// 5. Forecast within 30 days → encouragement, near goal
	if (
		stats.forecastDaysToGoal !== null &&
		stats.forecastDaysToGoal > 0 &&
		stats.forecastDaysToGoal <= FORECAST_NEAR_DAYS
	) {
		return {
			tone: "encouragement",
			message: `Al ritmo attuale raggiungi il goal in ~${stats.forecastDaysToGoal} giorni. Resisti alla tentazione di accelerare il deficit nelle ultime settimane — è quando il muscle loss inizia.`,
		};
	}

	// 6. Direction good but slow → encouragement
	if (stats.directionScore >= 0.6) {
		return {
			tone: "encouragement",
			message:
				"Direzione corretta, ritmo sostenibile. Continua. La consistency batte l'intensità sporadica nel medio periodo.",
		};
	}

	// 7. Default — encouragement with neutral framing
	return {
		tone: "encouragement",
		message:
			"Continua a tracciare ogni giorno. I dati di 2-3 settimane raccontano una storia che 2-3 giorni non vedono.",
	};
}
