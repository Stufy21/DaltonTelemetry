import { Component, afterNextRender, inject } from '@angular/core';
import { CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OF1Session } from '../core/openf1/openf1.model';
import { formatElapsed } from './format';
import { FlagStripComponent } from './flag-strip/flag-strip.component';
import { ComparisonSheetComponent } from './comparison/comparison-sheet.component';
import { ComparisonStore } from './comparison/comparison.store';
import { ChampionshipWidgetComponent } from './championship/championship-widget.component';
import { FeedWidgetComponent } from './feed-widget/feed-widget.component';
import { TelemetryFeedStore } from './telemetry-widget/telemetry-feed.store';
import { TelemetryWidgetComponent } from './telemetry-widget/telemetry-widget.component';
import { ColumnId, WIDGET_TITLES, WidgetId } from './widgets/layout';
import { LayoutStore } from './widgets/layout.store';
import { WidgetComponent } from './widgets/widget.component';
import { LeaderboardComponent } from './leaderboard/leaderboard.component';
import { TrackMapComponent } from './track-map/track-map.component';
import { LiveTimingStore, PLAYBACK_SPEEDS } from './live-timing.store';

@Component({
  selector: 'app-live-timing',
  imports: [
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    DecimalPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSliderModule,
    MatTooltipModule,
    FlagStripComponent,
    ComparisonSheetComponent,
    LeaderboardComponent,
    ChampionshipWidgetComponent,
    FeedWidgetComponent,
    TelemetryWidgetComponent,
    TrackMapComponent,
    WidgetComponent,
  ],
  providers: [LiveTimingStore, ComparisonStore, TelemetryFeedStore, LayoutStore],
  templateUrl: './live-timing.component.html',
  styleUrl: './live-timing.component.scss',
})
export class LiveTimingComponent {
  protected readonly store = inject(LiveTimingStore);
  protected readonly cmp = inject(ComparisonStore);
  protected readonly layout = inject(LayoutStore);
  protected readonly columns: ColumnId[] = ['main', 'side'];
  protected readonly titles = WIDGET_TITLES;
  protected readonly widgetIds = Object.keys(WIDGET_TITLES) as WidgetId[];
  protected readonly speeds = PLAYBACK_SPEEDS;
  protected readonly elapsed = formatElapsed;

  constructor() {
    // Data is only fetched in the browser; the prerendered shell never calls OpenF1.
    afterNextRender(() => this.store.start());
  }

  protected sessionLabel(s: OF1Session): string {
    return `${s.country_name} · ${s.session_name}`;
  }

  protected compareSessions(a: OF1Session | null, b: OF1Session | null): boolean {
    return a?.session_key === b?.session_key;
  }

  protected onSeek(event: Event): void {
    this.store.seek(Number((event.target as HTMLInputElement).value));
  }

  protected windDirection(deg: number): string {
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  }
}
