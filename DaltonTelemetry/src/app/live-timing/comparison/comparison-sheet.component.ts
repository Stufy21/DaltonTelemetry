import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { COMPOUND_LETTER, formatLapTime } from '../format';
import { LiveTimingStore } from '../live-timing.store';
import { TraceChannel } from '../telemetry';
import { ComparisonStore } from './comparison.store';
import { ChartSeries, TelemetryChartComponent } from './telemetry-chart.component';

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
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.scss',
})
export class ComparisonSheetComponent {
  protected readonly cmp = inject(ComparisonStore);
  private readonly timing = inject(LiveTimingStore);

  protected readonly metrics = METRICS;
  protected readonly lapTime = formatLapTime;
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

  /** Mean estimated lap length of the shown traces, used to turn the hover position into metres. */
  protected readonly hoverMetres = computed(() => {
    const f = this.cmp.hover();
    const lengths = Object.values(this.cmp.traces())
      .filter((t) => !!t)
      .map((t) => t.length);
    if (f == null || !lengths.length) return null;
    return Math.round(f * (lengths.reduce((a, b) => a + b, 0) / lengths.length));
  });

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
