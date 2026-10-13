/** The outcome of a permission check. `reason` explains a denial and is `null` when allowed. */
export interface Decision {
  allowed: boolean;
  reason: string | null;
}
