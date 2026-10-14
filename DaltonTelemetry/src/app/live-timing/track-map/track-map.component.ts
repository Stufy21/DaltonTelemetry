import { Component, computed, input } from '@angular/core';
import { CarPoint, Point } from '../timing-dataset';

/** Circuit outline with a dot per car. Coordinates are OpenF1's (y points up, SVG's points down). */
@Component({
  selector: 'app-track-map',
  templateUrl: './track-map.component.html',
  styleUrl: './track-map.component.scss',
})
export class TrackMapComponent {
  readonly outline = input.required<Point[]>();
  readonly cars = input.required<CarPoint[]>();
  readonly paused = input(false);

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

  /** Longest side of the circuit, used to size strokes and markers independent of the units. */
  protected readonly unit = computed(() => {
    const b = this.bounds();
    return Math.max(b.maxX - b.minX, b.maxY - b.minY) || 1;
  });

  protected readonly viewBox = computed(() => {
    const b = this.bounds();
    const pad = this.unit() * 0.06;
    return `${b.minX - pad} ${-b.maxY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`;
  });

  protected readonly path = computed(() =>
    this.outline()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${-p.y}`)
      .join(' '),
  );
}
