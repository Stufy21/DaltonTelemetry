import { Component, computed, input, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FLAG_NAMES, FlagSegment, FlagTone } from '../timing-dataset';

const LEGEND_ORDER: FlagTone[] = ['yellow', 'vsc', 'sc', 'red', 'chequered'];

/** Flags and safety cars along the session timeline; click a period to jump to it. */
@Component({
  selector: 'app-flag-strip',
  imports: [MatTooltipModule],
  templateUrl: './flag-strip.component.html',
  styleUrl: './flag-strip.component.scss',
})
export class FlagStripComponent {
  readonly segments = input.required<FlagSegment[]>();
  readonly rangeStart = input.required<number>();
  readonly rangeEnd = input.required<number>();
  readonly seekTo = output<number>();

  /** Legend entries for the kinds of flag that actually occur. */
  protected readonly legend = computed(() => {
    const present = new Set(this.segments().map((s) => s.tone));
    return LEGEND_ORDER.filter((tone) => present.has(tone)).map((tone) => ({
      tone,
      label: FLAG_NAMES[tone],
    }));
  });

  /** Position of a timestamp along the timeline, as a percentage. */
  protected pct(ms: number): number {
    const span = this.rangeEnd() - this.rangeStart();
    return span > 0 ? Math.min(100, Math.max(0, ((ms - this.rangeStart()) / span) * 100)) : 0;
  }

  protected width(seg: FlagSegment): number {
    return Math.max(this.pct(seg.to) - this.pct(seg.from), 0.4);
  }
}
