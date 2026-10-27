export type CapacityOption = { value: string; label: string };

const STANDARD_CAPACITIES = [10, 20, 30, 50, 100];

/** Parse the capacity select's value; empty or "unlimited" means no limit. */
export function capacityValue(raw: string): number | null {
  if (!raw || raw === "unlimited") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Choices for the capacity select. Admins can set any positive capacity, so a
 * current value outside the standard choices is added — otherwise the browser
 * falls back to the first option and saving the form drops the capacity.
 */
export function capacityOptions(current?: number | null): CapacityOption[] {
  const sizes = [...STANDARD_CAPACITIES];
  if (current != null && current > 0 && !sizes.includes(current)) {
    sizes.push(current);
    sizes.sort((a, b) => a - b);
  }
  return [
    ...sizes.map((n) => ({
      value: String(n),
      label: n === 20 ? "20 gæster (anbefalet)" : `${n} gæster`,
    })),
    { value: "unlimited", label: "Ubegrænset" },
  ];
}

/** Initially selected value: the current capacity, else the form's default. */
export function capacityDefault(
  current: number | null | undefined,
  strictCreate: boolean,
): string {
  if (current != null) return String(current);
  return strictCreate ? "20" : "unlimited";
}
