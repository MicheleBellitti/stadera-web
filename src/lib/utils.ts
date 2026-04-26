/**
 * `cn` is the standard shadcn class-name helper:
 * - `clsx` deduplicates falsy/conditional values into a single string
 * - `tailwind-merge` resolves conflicting Tailwind utilities so that
 *   `cn("p-2", "p-4")` collapses to `"p-4"` instead of emitting both.
 *
 * Used extensively in shadcn components and anywhere we need to
 * conditionally compose Tailwind classes without "last class wins"
 * surprises.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
