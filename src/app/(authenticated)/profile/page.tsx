/**
 * Metabolic profile editor.
 *
 * Backed by react-hook-form + zod. The schema mirrors the backend's
 * `ProfilePayload` — same field names, same enum values — so the form
 * value object can be passed straight to `useUpdateProfile()` without
 * adaptation.
 *
 * The backend differentiates "no profile yet" from other errors by
 * returning 404 on `/profile`; `useProfile()` surfaces that as
 * `error.status === 404`. We treat it as "render an empty form" rather
 * than a hard error.
 *
 * On successful save we don't navigate away — the user typically tweaks
 * a few values, saves, and may want to confirm by re-opening the page.
 * `useUpdateProfile()` invalidates `/today` so the dashboard picks up
 * the new TDEE / daily target on next visit.
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { useProfile, useUpdateProfile } from "@/lib/api/queries";

// Mirrors backend ProfilePayload shape. Bounds match the domain
// validation in `crates/domain/`: height 50–250 cm, weight 30–300 kg.
//
// We do NOT use `z.coerce.number()` because that makes zod's input type
// (string) differ from the output type (number), which in turn forces
// RHF's `Control` into a 3-generic shape that the standard shadcn
// `FormField` (2 generics) can't unify with. We keep number-as-number
// throughout and convert the `<input type="number">` raw value at the
// `onChange` boundary instead.
const schema = z.object({
	birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use yyyy-mm-dd"),
	sex: z.enum(["male", "female"]),
	height_cm: z.number().min(50).max(250),
	activity_level: z.enum([
		"sedentary",
		"lightly_active",
		"moderately_active",
		"very_active",
	]),
	goal_weight_kg: z.number().min(30).max(300),
});

type FormValues = z.infer<typeof schema>;

const ACTIVITY_OPTIONS: Array<{
	value: FormValues["activity_level"];
	label: string;
}> = [
	{ value: "sedentary", label: "Sedentary" },
	{ value: "lightly_active", label: "Lightly active" },
	{ value: "moderately_active", label: "Moderately active" },
	{ value: "very_active", label: "Very active" },
];

const EMPTY: FormValues = {
	birth_date: "",
	sex: "male",
	height_cm: 175,
	activity_level: "moderately_active",
	goal_weight_kg: 75,
};

export default function ProfilePage() {
	const { data, isLoading, error } = useProfile();
	const update = useUpdateProfile();

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: EMPTY,
	});

	// `useForm`'s `defaultValues` is captured on first render; once the
	// query resolves we have to `reset` to populate the actual values.
	// This is the standard RHF + async pattern.
	useEffect(() => {
		if (data) {
			form.reset({
				birth_date: data.birth_date,
				sex: data.sex as FormValues["sex"],
				height_cm: data.height_cm,
				activity_level: data.activity_level as FormValues["activity_level"],
				goal_weight_kg: data.goal_weight_kg,
			});
		}
	}, [data, form]);

	if (isLoading) return <ProfileSkeleton />;

	// 404 means "no profile saved yet" — render the empty form. Anything
	// else is a real error.
	if (error && (!(error instanceof ApiError) || error.status !== 404)) {
		return (
			<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
				Failed to load profile: {error.message}
			</div>
		);
	}

	const onSubmit = (values: FormValues) => {
		update.mutate(values);
	};

	return (
		<div className="space-y-6 max-w-xl">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
				<p className="text-sm text-muted-foreground">
					Used to compute BMR, TDEE and your daily kcal target.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Metabolic profile
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							<FormField
								control={form.control}
								name="birth_date"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Birth date</FormLabel>
										<FormControl>
											<Input type="date" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="sex"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Sex</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="male">Male</SelectItem>
												<SelectItem value="female">Female</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>
											Used by the BMR formula (Katch–McArdle).
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="height_cm"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Height (cm)</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="0.1"
												min={50}
												max={250}
												// `valueAsNumber` is `NaN` when the input is empty
												// or non-numeric; React rejects `value={NaN}` so we
												// render `""` in that case. The NaN propagates into
												// form state and zod's `.min()` will fail at submit.
												value={Number.isFinite(field.value) ? field.value : ""}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
												onBlur={field.onBlur}
												name={field.name}
												ref={field.ref}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="activity_level"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Activity level</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{ACTIVITY_OPTIONS.map((o) => (
													<SelectItem key={o.value} value={o.value}>
														{o.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="goal_weight_kg"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Goal weight (kg)</FormLabel>
										<FormControl>
											<Input
												type="number"
												step="0.1"
												min={30}
												max={300}
												value={Number.isFinite(field.value) ? field.value : ""}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
												onBlur={field.onBlur}
												name={field.name}
												ref={field.ref}
											/>
										</FormControl>
										<FormDescription>
											Drives the protein target (1.6 g/kg).
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex items-center gap-4">
								<Button type="submit" disabled={update.isPending}>
									{update.isPending ? "Saving…" : "Save"}
								</Button>
								{update.isSuccess && (
									<span className="text-sm text-muted-foreground">Saved.</span>
								)}
								{update.isError && (
									<span className="text-sm text-destructive">
										Save failed: {update.error.message}
									</span>
								)}
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}

function ProfileSkeleton() {
	return (
		<div className="space-y-6 max-w-xl">
			<Skeleton className="h-8 w-32" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}
