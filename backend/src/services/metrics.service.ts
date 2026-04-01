// ─── Metrics — format Prometheus text (sans dépendance externe) ───────────────
// Évite l'incompatibilité prom-client v15 / moduleResolution: nodenext

interface Counter { value: number; labels: Record<string, string> }
interface Histogram { buckets: Map<number, number>; sum: number; count: number; labels: Record<string, string> }

const counters   = new Map<string, Counter[]>();
const histograms = new Map<string, Histogram[]>();
const gauges     = new Map<string, { value: number; labels: Record<string, string> }[]>();

const startTime = Date.now();

// ─── Public API ───────────────────────────────────────────────────────────────

export function incCounter(name: string, labels: Record<string, string> = {}): void {
  const list = counters.get(name) ?? [];
  const entry = list.find(e => labelsMatch(e.labels, labels));
  if (entry) { entry.value++; }
  else { list.push({ value: 1, labels }); }
  counters.set(name, list);
}

export function observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
  const BUCKETS = [10, 50, 100, 200, 500, 1000, 3000, Infinity];
  const list = histograms.get(name) ?? [];
  let entry = list.find(e => labelsMatch(e.labels, labels));
  if (!entry) {
    entry = { buckets: new Map(BUCKETS.map(b => [b, 0])), sum: 0, count: 0, labels };
    list.push(entry);
  }
  for (const b of BUCKETS) { if (value <= b) entry.buckets.set(b, (entry.buckets.get(b) ?? 0) + 1); }
  entry.sum   += value;
  entry.count += 1;
  histograms.set(name, list);
}

export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  const list = gauges.get(name) ?? [];
  const entry = list.find(e => labelsMatch(e.labels, labels));
  if (entry) { entry.value = value; }
  else { list.push({ value, labels }); }
  gauges.set(name, list);
}

export function incGauge(name: string, labels: Record<string, string> = {}): void {
  const list = gauges.get(name) ?? [];
  const entry = list.find(e => labelsMatch(e.labels, labels));
  if (entry) { entry.value++; }
  else { list.push({ value: 1, labels }); }
  gauges.set(name, list);
}

export function decGauge(name: string, labels: Record<string, string> = {}): void {
  const list = gauges.get(name) ?? [];
  const entry = list.find(e => labelsMatch(e.labels, labels));
  if (entry) { entry.value = Math.max(0, entry.value - 1); }
  gauges.set(name, list);
}

// ─── Prometheus text format ───────────────────────────────────────────────────

export function renderMetrics(): string {
  const lines: string[] = [];

  // Process uptime
  lines.push('# HELP process_uptime_ms Process uptime in milliseconds');
  lines.push('# TYPE process_uptime_ms gauge');
  lines.push(`process_uptime_ms ${Date.now() - startTime}`);

  for (const [name, entries] of counters) {
    lines.push(`# HELP ${name} Counter`);
    lines.push(`# TYPE ${name} counter`);
    for (const e of entries) lines.push(`${name}${fmt(e.labels)} ${e.value}`);
  }

  for (const [name, entries] of gauges) {
    lines.push(`# HELP ${name} Gauge`);
    lines.push(`# TYPE ${name} gauge`);
    for (const e of entries) lines.push(`${name}${fmt(e.labels)} ${e.value}`);
  }

  for (const [name, entries] of histograms) {
    lines.push(`# HELP ${name} Histogram`);
    lines.push(`# TYPE ${name} histogram`);
    for (const e of entries) {
      for (const [b, v] of e.buckets) {
        const le = b === Infinity ? '+Inf' : String(b);
        lines.push(`${name}_bucket${fmt({ ...e.labels, le })} ${v}`);
      }
      lines.push(`${name}_sum${fmt(e.labels)} ${e.sum}`);
      lines.push(`${name}_count${fmt(e.labels)} ${e.count}`);
    }
  }

  return lines.join('\n') + '\n';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

function labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}
