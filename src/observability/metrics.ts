/**
 * Prometheus-compatible metrics collector.
 * In-memory counters and gauges, rendered as Prometheus text format.
 */

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

function labelKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const sorted = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return `${name}{${sorted}}`;
}

export function increment(name: string, labels?: Record<string, string>, amount = 1): void {
  const key = labelKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + amount);
}

export function gauge(name: string, value: number, labels?: Record<string, string>): void {
  const key = labelKey(name, labels);
  gauges.set(key, value);
}

export function getCounter(name: string, labels?: Record<string, string>): number {
  return counters.get(labelKey(name, labels)) ?? 0;
}

export function getGauge(name: string, labels?: Record<string, string>): number {
  return gauges.get(labelKey(name, labels)) ?? 0;
}

export function getPrometheusText(): string {
  const lines: string[] = [];

  // Counters
  const counterNames = new Set<string>();
  for (const key of counters.keys()) {
    const name = key.includes("{") ? key.slice(0, key.indexOf("{")) : key;
    counterNames.add(name);
  }
  for (const name of counterNames) {
    lines.push(`# TYPE ${name} counter`);
  }
  for (const [key, value] of counters) {
    lines.push(`${key} ${value}`);
  }

  // Gauges
  const gaugeNames = new Set<string>();
  for (const key of gauges.keys()) {
    const name = key.includes("{") ? key.slice(0, key.indexOf("{")) : key;
    gaugeNames.add(name);
  }
  for (const name of gaugeNames) {
    lines.push(`# TYPE ${name} gauge`);
  }
  for (const [key, value] of gauges) {
    lines.push(`${key} ${value}`);
  }

  return lines.join("\n") + "\n";
}

/** Reset all metrics (for testing). */
export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
}

export const metrics = { increment, gauge, getCounter, getGauge, getPrometheusText, resetMetrics };
