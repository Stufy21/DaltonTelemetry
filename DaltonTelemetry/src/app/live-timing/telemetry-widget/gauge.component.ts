import { Component, computed, input } from '@angular/core';
import { SPEED_START, SPEED_TICKS, arcPath, clamp01, gearLabel, polar, speedAngle } from './gauge';

let nextId = 0;

/** Speedometer with throttle (left) and brake (right) bands, plus RPM and gear. */
@Component({
  selector: 'app-gauge',
  templateUrl: './gauge.component.html',
  styleUrl: './gauge.component.scss',
})
export class GaugeComponent {
  readonly name = input.required<string>();
  readonly colour = input('#888888');
  readonly speed = input<number | null>(null);
  readonly rpm = input<number | null>(null);
  readonly gear = input<number | null>(null);
  readonly throttle = input<number | null>(null);
  readonly brake = input<number | null>(null);

  /** Unique ids for the textPath references (several gauges share one page). */
  protected readonly uid = `gauge-${nextId++}`;

  protected readonly speedTrack = arcPath(88, SPEED_START, speedAngle(360));
  protected readonly speedArc = computed(() => {
    const v = this.speed() ?? 0;
    return v > 0 ? arcPath(88, SPEED_START, speedAngle(v)) : '';
  });

  protected readonly ticks = SPEED_TICKS.map((v) => {
    const angle = speedAngle(v);
    const inner = polar(80, angle);
    const outer = polar(86, angle);
    const label = polar(100, angle);
    return { v, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, lx: label.x, ly: label.y };
  });

  protected readonly throttleTrack = arcPath(64, 150, 250);
  protected readonly throttleArc = computed(() => {
    const f = clamp01((this.throttle() ?? 0) / 100);
    return f > 0 ? arcPath(64, 150, 150 + 100 * f) : '';
  });
  protected readonly brakeTrack = arcPath(64, 30, -70);
  protected readonly brakeArc = computed(() => {
    const f = clamp01((this.brake() ?? 0) / 100);
    return f > 0 ? arcPath(64, 30, 30 - 100 * f) : '';
  });

  /** Label paths run clockwise so the text reads bottom-to-top on the left, top-to-bottom on the right. */
  protected readonly throttleLabelPath = arcPath(60, 150, 250);
  protected readonly brakeLabelPath = arcPath(60, 290, 390);

  protected readonly gearText = computed(() => gearLabel(this.gear()));
  protected readonly speedText = computed(() =>
    this.speed() == null ? '–' : Math.round(this.speed() as number),
  );
  protected readonly rpmText = computed(() =>
    this.rpm() == null ? '–' : Math.round(this.rpm() as number),
  );
}
