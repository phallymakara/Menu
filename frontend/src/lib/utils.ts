import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a real database UUID; false for demo/local IDs such as `cat-1` or `opt_...`. */
export function isUuid(id?: string | null): id is string {
  return !!id && UUID_PATTERN.test(id)
}
