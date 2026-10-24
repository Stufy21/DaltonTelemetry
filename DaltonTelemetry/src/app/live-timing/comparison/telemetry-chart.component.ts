import { Component, computed, input, output } from '@angular/core';
import { fromView, Span, toView, visiblePoints } from './zoom';

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
  /** The stretch of the lap shown (all of it when null), shared by every chart. */
  readonly zoom = input<Span | null>(null);
  /** Where the first click of a selection landed, while the second is awaited. */
  readonly anchor = input<number | null>(null);
  /** A click on the plot, as a position along the whole lap. */
  readonly plotClick = output<number>();

  /** The points on screen. */
  private readonly visible = computed(() =>
    this.series().map((s) => ({ series: s, points: visiblePoints(s.points, this.zoom()) })),
  );

  /**
   * Lower end of the scale. Zoomed in, a channel without a fixed range is rescaled to what is on
   * screen, so a 20 km/h change is not a hairline on a 0-350 axis.
   */
  protected readonly bottom = computed(() => {
    if (!this.zoom() || this.max() != null) return this.min();
    const values = this.visible().flatMap((v) => v.points.map((p) => p.v));
    if (!values.length) return this.min();
    return Math.max(
      this.min(),
      Math.floor(Math.min(...values) / this.niceStep()) * this.niceStep(),
    );
  });

  protected readonly top = computed(() => {
    const fixed = this.max();
    if (fixed != null) return fixed;
    const peak = Math.max(0, ...this.visible().flatMap((v) => v.points.map((p) => p.v)));
    return Math.max(this.bottom() + 1, Math.ceil(peak / this.niceStep()) * this.niceStep());
  });

  protected readonly paths = computed(() => {
    const lo = this.bottom();
    const span = this.top() - lo;
    const zoom = this.zoom();
    const y = (v: number) => HEIGHT - ((Math.min(Math.max(v, lo), lo + span) - lo) / span) * HEIGHT;
    return this.visible().map(({ series: s, points }) => {
      let d = '';
      points.forEach((p, i) => {
        const px = (toView(p.f, zoom) * WIDTH).toFixed(1);
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

  /** Where the hover cursor is across the visible plot (0..1), or null when it is off screen. */
  protected readonly cursor = computed(() => {
    const f = this.hover();
    if (f == null) return null;
    const x = toView(f, this.zoom());
    return x >= 0 && x <= 1 ? x : null;
  });

  /** The first click of a selection across the visible plot, when it is on screen. */
  protected readonly anchorAt = computed(() => {
    const a = this.anchor();
    if (a == null) return null;
    const x = toView(a, this.zoom());
    return x >= 0 && x <= 1 ? x : null;
  });

  /** The stretch being selected, from the first click to the pointer, across the visible plot. */
  protected readonly selection = computed(() => {
    const a = this.anchor();
    const h = this.hover();
    if (a == null || h == null) return null;
    const zoom = this.zoom();
    const from = Math.max(0, Math.min(toView(a, zoom), toView(h, zoom)));
    const to = Math.min(1, Math.max(toView(a, zoom), toView(h, zoom)));
    return to > from ? { left: from * 100, width: (to - from) * 100 } : null;
  });

  /** Pointer position across the plot (0..1) as a position along the whole lap. */
  private lapPosition(event: MouseEvent): number {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    return fromView(x, this.zoom());
  }

  protected onMove(event: PointerEvent): void {
    this.hoverChange.emit(this.lapPosition(event));
  }

  protected onClick(event: MouseEvent): void {
    this.plotClick.emit(this.lapPosition(event));
  }
}
