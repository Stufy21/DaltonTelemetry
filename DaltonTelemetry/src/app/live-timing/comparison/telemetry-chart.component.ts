import { Component, computed, input, output } from '@angular/core';

export interface ChartPoint {
  /** Position along the lap, 0..1. */
  f: number;
  v: number;
}

export interface ChartSeries {
  id: number;
  label: string;
  colour: string;
  dashed: boolean;
  points: ChartPoint[];
}

const WIDTH = 1000;
const HEIGHT = 100;

/** One telemetry channel for up to two drivers, plotted against lap position. */
@Component({
  selector: 'app-telemetry-chart',
  templateUrl: './telemetry-chart.component.html',
  styleUrl: './telemetry-chart.component.scss',
})
export class TelemetryChartComponent {
  readonly title = input.required<string>();
  readonly unit = input('');
  readonly series = input.required<ChartSeries[]>();
  /** Draw as steps (gear, brake) instead of straight segments. */
  readonly step = input(false);
  readonly min = input(0);
  /** Fixed upper bound; otherwise the data maximum rounded up to a multiple of `niceStep`. */
  readonly max = input<number | null>(null);
  readonly niceStep = input(1);
  readonly hover = input<number | null>(null);
  readonly hoverChange = output<number | null>();

  protected readonly top = computed(() => {
    const fixed = this.max();
    if (fixed != null) return fixed;
    const peak = Math.max(0, ...this.series().flatMap((s) => s.points.map((p) => p.v)));
    return Math.max(this.min() + 1, Math.ceil(peak / this.niceStep()) * this.niceStep());
  });

  protected readonly paths = computed(() => {
    const lo = this.min();
    const span = this.top() - lo;
    const y = (v: number) => HEIGHT - ((Math.min(Math.max(v, lo), lo + span) - lo) / span) * HEIGHT;
    return this.series().map((s) => {
      let d = '';
      s.points.forEach((p, i) => {
        const px = (p.f * WIDTH).toFixed(1);
        const py = y(p.v).toFixed(1);
        if (i === 0) d = `M${px} ${py}`;
        else d += this.step() ? `H${px}V${py}` : `L${px} ${py}`;
      });
      return { series: s, d };
    });
  });

  /** The value of each series at the hovered position. */
  protected readonly readouts = computed(() => {
    const f = this.hover();
    return this.series().map((s) => {
      if (f == null || !s.points.length) return { series: s, value: null as number | null };
      let lo = 0;
      let hi = s.points.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (s.points[mid].f < f) lo = mid + 1;
        else hi = mid;
      }
      const prev = s.points[Math.max(0, lo - 1)];
      const near = Math.abs(prev.f - f) <= Math.abs(s.points[lo].f - f) ? prev : s.points[lo];
      return { series: s, value: near.v };
    });
  });

  protected onMove(event: PointerEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.hoverChange.emit(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  }
}
