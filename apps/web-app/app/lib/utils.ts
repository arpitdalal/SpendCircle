import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner used by UI components. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
