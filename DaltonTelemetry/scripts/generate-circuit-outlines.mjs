// Generates src/app/dashboards/statistics/circuit-outlines.ts: one outline per circuit, drawn from
// OpenF1's car coordinates (the same data the live track map uses) over one clean lap.
//
//   node scripts/generate-circuit-outlines.mjs
//
// It talks to OpenF1's free API (about 2 requests per circuit, paced to stay under its limits), so
// it takes a couple of minutes. Run it again only when a circuit is added or changes its layout.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.openf1.org/v1';
const OUTPUT = join(
  import.meta.dirname,
  '..',
  'src',
  'app',
  'dashboards',
  'statistics',
  'circuit-outlines.ts',
);

/** Ergast circuit id -> OpenF1 circuit_key. */
const CIRCUITS = {
  albert_park: 10,
  americas: 9,
  baku: 144,
  bahrain: 63,
  catalunya: 15,
  hungaroring: 4,
  imola: 6,
  interlagos: 14,
  jeddah: 149,
  losail: 150,
  madring: 153,
  marina_bay: 61,
  miami: 151,
  monaco: 22,
  monza: 39,
  red_bull_ring: 19,
  rodriguez: 65,
  sepang: 12,
  shanghai: 49,
  silverstone: 2,
  spa: 7,
  suzuka: 46,
  vegas: 152,
  villeneuve: 23,
  yas_marina: 70,
  zandvoort: 55,
};

const SIZE = 1000; // longest side of an outline
const PAD = 40; // room around it so the stroke isn't clipped
const SIMPLIFY = 1.2; // Douglas-Peucker tolerance, in outline units
const GAP_MS = 2300; // the free tier allows 3 requests/second and 30/minute
const ATTEMPTS = 4; // most recent races tried per circuit
// Some sessions report the same position over and over, which draws a coarse polygon: such a lap
// is only used when no other race at the circuit does better.
const GOOD_ENOUGH = 150;

let last = 0;
async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const response = await fetch(`${API}/${path}`);
    if (response.status === 404) return [];
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return response.json();
  }
  throw new Error(`rate limited: ${path}`);
}

/** Perpendicular distance from p to the segment a-b. */
function distance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker: drops points that barely change the line. */
function simplify(points, tolerance) {
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = from + 1; i < to; i++) {
      const d = distance(points[i], points[from], points[to]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index > 0 && worst > tolerance) {
      keep[index] = true;
      stack.push([from, index], [index, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Fastest clean lap of a race and the car coordinates along it. */
async function lapPath(sessionKey) {
  const laps = (await get(`laps?session_key=${sessionKey}`))
    .filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap)
    .sort((a, b) => a.lap_duration - b.lap_duration);
  const lap = laps[0];
  if (!lap) return null;

  const from = new Date(lap.date_start);
  const to = new Date(from.getTime() + lap.lap_duration * 1000);
  const query = `session_key=${sessionKey}&driver_number=${lap.driver_number}&date>=${encodeURIComponent(
    from.toISOString(),
  )}&date<${encodeURIComponent(to.toISOString())}`;
  const rows = (await get(`location?${query}`))
    .filter((r) => r.x || r.y) // (0, 0) means no GPS fix
    .sort((a, b) => a.date.localeCompare(b.date));
  const distinct = rows
    .filter((r, i) => i === 0 || r.x !== rows[i - 1].x || r.y !== rows[i - 1].y)
    .map((r) => ({ x: r.x, y: r.y }));
  return distinct.length >= 40 ? distinct : null;
}

/** Scales to SIZE, flips y (OpenF1's points up, SVG's down) and builds the path. */
function toOutline(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = SIZE / (Math.max(maxX - minX, maxY - minY) || 1);

  const scaled = points.map((p) => ({
    x: (p.x - minX) * scale,
    y: (maxY - p.y) * scale,
  }));
  const simple = simplify(scaled, SIMPLIFY);
  const path =
    simple
      .map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x + PAD)} ${Math.round(p.y + PAD)}`)
      .join('') + 'Z';
  return {
    width: Math.round((maxX - minX) * scale + PAD * 2),
    height: Math.round((maxY - minY) * scale + PAD * 2),
    path,
  };
}

const races = [];
for (const year of [2026, 2025, 2024, 2023]) {
  races.push(...(await get(`sessions?year=${year}&session_type=Race`)));
}
races.sort((a, b) => b.date_start.localeCompare(a.date_start));

const outlines = {};
for (const [circuitId, circuitKey] of Object.entries(CIRCUITS)) {
  const candidates = races.filter((r) => r.circuit_key === circuitKey).slice(0, ATTEMPTS);
  let best = null;
  for (const race of candidates) {
    try {
      const points = await lapPath(race.session_key);
      if (points && (!best || points.length > best.points.length)) best = { race, points };
      if (best && best.points.length >= GOOD_ENOUGH) break;
    } catch (error) {
      console.warn(`${circuitId} (${race.year}): ${error.message}`);
    }
  }
  if (!best) {
    console.warn(`${circuitId}: no outline`);
    continue;
  }
  outlines[circuitId] = toOutline(best.points);
  console.log(
    `${circuitId.padEnd(14)} ${best.race.year}: ${best.points.length} distinct points -> ${outlines[circuitId].path.length} chars`,
  );
}

const body = Object.entries(outlines)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([id, o]) =>
      `  ${id}: {\n    width: ${o.width},\n    height: ${o.height},\n    path: '${o.path}',\n  },`,
  )
  .join('\n');

writeFileSync(
  OUTPUT,
  `// Generated by scripts/generate-circuit-outlines.mjs from OpenF1 car coordinates: do not edit.
// One outline per circuit, keyed by Ergast circuit id, drawn in a ${SIZE}-unit box (y down).

export interface CircuitOutline {
  width: number;
  height: number;
  /** SVG path data of the closed outline. */
  path: string;
}

export const CIRCUIT_OUTLINES: Record<string, CircuitOutline> = {
${body}
};
`,
);
console.log(`\nWrote ${Object.keys(outlines).length} outlines to ${OUTPUT}`);
