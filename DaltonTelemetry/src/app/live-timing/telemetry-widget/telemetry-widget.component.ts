import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ComparisonStore } from '../comparison/comparison.store';
import { LiveTimingStore } from '../live-timing.store';
import { GaugeComponent } from './gauge.component';
import { TelemetryFeedStore } from './telemetry-feed.store';

/** Live telemetry dials for the drivers selected in the leaderboard. */
@Component({
  selector: 'app-telemetry-widget',
  imports: [GaugeComponent, MatIconModule],
  templateUrl: './telemetry-widget.component.html',
  styleUrl: './telemetry-widget.component.scss',
})
export class TelemetryWidgetComponent {
  protected readonly cmp = inject(ComparisonStore);
  private readonly timing = inject(LiveTimingStore);
  private readonly feed = inject(TelemetryFeedStore);

  protected readonly cards = computed(() => {
    const rows = this.timing.rows();
    return this.feed.readings().map((reading) => {
      const row = rows.find((r) => r.driverNumber === reading.driver);
      return {
        driver: reading.driver,
        name: row?.acronym ?? `#${reading.driver}`,
        colour: row?.teamColour ?? '#888888',
        sample: reading.sample,
      };
    });
  });

  /** Replaying faster than the API budget allows leaves the dials at their last value. */
  protected readonly paused = this.timing.mapPaused;
}
