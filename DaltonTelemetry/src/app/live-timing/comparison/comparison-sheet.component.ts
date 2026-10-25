import { Component, computed, HostListener, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { COMPOUND_LETTER, formatLapTime, formatSector } from '../format';
import { LiveTimingStore } from '../live-timing.store';
import { TraceChannel } from '../telemetry';
import { buildBestTable } from './best-laps';
import { ComparisonStore } from './comparison.store';
import { ChartSeries, TelemetryChartComponent } from './telemetry-chart.component';
import { TrackLocatorComponent } from './track-locator.component';

interface MetricConfig {
  key: TraceChannel;
  title: string;
  unit: string;
  step?: boolean;
  min?: number;
  max?: number;
  niceStep?: number;
  /** Takes the full width of the chart grid. */
  wide?: boolean;
}

/** OpenF1 has no ERS/boost channel and DRS is empty from 2026, so these are the usable ones. */
const METRICS: MetricConfig[] = [
  { key: 'speed', title: 'Speed', unit: 'km/h', niceStep: 50, wide: true },
  { key: 'throttle', title: 'Throttle', unit: '%', max: 100 },
  { key: 'brake', title: 'Brake', unit: '%', max: 100, step: true },
  { key: 'gear', title: 'Gear', unit: '', max: 8, step: true },
  { key: 'rpm', title: 'RPM', unit: '', niceStep: 2000 },
];

/** Bottom card comparing two selected drivers: recent lap times and telemetry for a lap. */
@Component({
  selector: 'app-comparison-sheet',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TelemetryChartComponent,
    TrackLocatorComponent,
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.scss',
})
export class ComparisonSheetComponent {
  protected readonly cmp = inject(ComparisonStore);
  private readonly timing = inject(LiveTimingStore);
  /** One lap of car coordinates drawing the circuit, shared with the track map widget. */
  protected readonly outline = this.timing.outline;

  protected readonly metrics = METRICS;
  protected readonly lapTime = formatLapTime;
  protected readonly sector = formatSector;
  protected readonly compoundLetter = (c: string | null) => (c ? (COMPOUND_LETTER[c] ?? '?') : '–');

  protected readonly drivers = computed(() => {
    const rows = this.timing.rows();
    return this.cmp
      .selected()
      .map((n) => rows.find((r) => r.driverNumber === n))
      .filter((r) => !!r);
  });

  /** Line colour per driver; a teammate (same colour) is drawn dashed to stay distinguishable. */
  protected readonly styles = computed(() => {
    const drivers = this.drivers();
    return drivers.map((d, i) => ({
      colour: d.teamColour,
      dashed: i > 0 && drivers.slice(0, i).some((o) => o.teamColour === d.teamColour),
    }));
  });

  protected readonly series = computed(() => {
    const traces = this.cmp.traces();
    const drivers = this.drivers();
    const styles = this.styles();
    const out = {} as Record<TraceChannel, ChartSeries[]>;
    for (const metric of METRICS) {
      out[metric.key] = drivers.flatMap((d, i) => {
        const trace = traces[d.driverNumber];
        if (!trace) return [];
        return [
          {
            id: d.driverNumber,
            label: d.acronym,
            ...styles[i],
            points: trace.points.map((p) => ({ f: p.f, v: p[metric.key] })),
          },
        ];
      });
    }
    return out;
  });

  /** One row per selected driver with their best lap so far, for the best-laps mode. */
  protected readonly bestRows = computed(() => {
    const laps = new Map(this.cmp.bestLaps().map((b) => [b.driver, b.lap]));
    return this.drivers().map((d, i) => ({
      driver: d,
      slot: i === 0 ? 'A' : 'B',
      lap: laps.get(d.driverNumber) ?? null,
    }));
  });

  /** The best-laps comparison: lap, time and sectors of each driver's best lap, and B minus A. */
  protected readonly bestTable = computed(() => buildBestTable(this.bestRows().map((r) => r.lap)));

  /** Mean estimated lap length of the shown traces, used to turn the hover position into metres. */
  protected readonly hoverMetres = computed(() => {
    const f = this.cmp.hover();
    const lengths = Object.values(this.cmp.traces())
      .filter((t) => !!t)
      .map((t) => t.length);
    if (f == null || !lengths.length) return null;
    return Math.round(f * (lengths.reduce((a, b) => a + b, 0) / lengths.length));
  });

  /** How far round the lap the cursor is, in percent. */
  protected readonly hoverPercent = computed(() => {
    const f = this.cmp.hover();
    return f == null ? null : Math.round(f * 100);
  });

  /** The zoomed stretch in metres from the start line, using the mean estimated lap length. */
  protected readonly zoomMetres = computed(() => {
    const zoom = this.cmp.zoom();
    const lengths = Object.values(this.cmp.traces())
      .filter((t) => !!t)
      .map((t) => t.length);
    if (!zoom || !lengths.length) return null;
    const length = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    return { from: Math.round(zoom.from * length), to: Math.round(zoom.to * length) };
  });

  /** Esc backs out of a selection first, then out of the zoom. */
  @HostListener('window:keydown.escape')
  protected onEscape(): void {
    if (this.cmp.anchor() !== null) this.cmp.cancelSelection();
    else if (this.cmp.zoom()) this.cmp.resetZoom();
  }

  protected readonly hasTrace = computed(() => Object.values(this.cmp.traces()).some((t) => !!t));

  protected delta(row: { times: { duration: number | null }[] }): number | null {
    const [a, b] = row.times;
    return a?.duration != null && b?.duration != null ? b.duration - a.duration : null;
  }

  protected formatDelta(value: number): string {
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(3)}`;
  }

  /** Index of the fastest recorded time among the drivers on a lap row, for highlighting. */
  protected fastest(row: { times: { duration: number | null }[] }): number {
    let best = -1;
    row.times.forEach((t, i) => {
      if (t.duration != null && (best < 0 || t.duration < (row.times[best].duration as number))) {
        best = i;
      }
    });
    return row.times.filter((t) => t.duration != null).length > 1 ? best : -1;
  }
}
