import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely, resolving conflicts via tailwind-merge.
 * Usage: cn("px-4 py-2", isActive && "bg-spotify", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
