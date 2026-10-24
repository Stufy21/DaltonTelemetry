import { Component, computed, input } from '@angular/core';
import { Point } from '../timing-dataset';
import { pointAtFraction, stretchOfOutline } from './track-position';
import { Span } from './zoom';

/**
 * A small circuit map showing where on the lap the telemetry cursor is, and which stretch the
 * charts are zoomed (or being selected) to. Coordinates are OpenF1's: y points up, SVG's down.
 */
@Component({
  selector: 'app-track-locator',
  templateUrl: './track-locator.component.html',
  styleUrl: './track-locator.component.scss',
})
export class TrackLocatorComponent {
  readonly outline = input.required<Point[]>();
  /** Hovered position along the lap (0..1). */
  readonly hover = input<number | null>(null);
  readonly zoom = input<Span | null>(null);
  /** First click of a selection in progress. */
  readonly anchor = input<number | null>(null);

  /** Longest side of the circuit, used to size strokes and markers independent of the units. */
  protected readonly unit = computed(() => {
    const b = this.bounds();
    return Math.max(b.maxX - b.minX, b.maxY - b.minY) || 1;
  });

  private readonly bounds = computed(() => {
    const pts = this.outline();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  });

  protected readonly viewBox = computed(() => {
    const b = this.bounds();
    const pad = this.unit() * 0.08;
    return `${b.minX - pad} ${-b.maxY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`;
  });

  private static readonly path = (points: Point[]): string =>
    points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${-p.y}`).join(' ');

  protected readonly track = computed(() => TrackLocatorComponent.path(this.outline()));

  /** The stretch in view: the zoom, or the selection being made from the first click to the cursor. */
  protected readonly highlight = computed(() => {
    const anchor = this.anchor();
    const hover = this.hover();
    const span = anchor != null && hover != null ? { from: anchor, to: hover } : this.zoom();
    return span
      ? TrackLocatorComponent.path(stretchOfOutline(this.outline(), span.from, span.to))
      : '';
  });

  protected readonly cursor = computed(() => {
    const f = this.hover();
    const p = f == null ? null : pointAtFraction(this.outline(), f);
    return p ? { x: p.x, y: -p.y } : null;
  });

  /** The start/finish line: where the lap begins. */
  protected readonly start = computed(() => {
    const p = this.outline()[0];
    return p ? { x: p.x, y: -p.y } : null;
  });
}
