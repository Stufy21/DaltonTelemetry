import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { forkJoin } from 'rxjs';
import { OF1ChampionshipDriver, OF1ChampionshipTeam } from '../../core/openf1/openf1.model';
import { OpenF1Service } from '../../core/openf1/openf1.service';
import { LiveTimingStore } from '../live-timing.store';
import {
  projectDriverStandings,
  projectTeamStandings,
  RACE_POINTS,
  SPRINT_POINTS,
  StandingRow,
} from './championship';

/** A finished session never changes, so its standings can be cached in the browser. */
const FINISHED_AFTER_MS = 3 * 60 * 60 * 1000;

type Base =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'error' }
  | { state: 'ready'; drivers: OF1ChampionshipDriver[]; teams: OF1ChampionshipTeam[] };

/**
 * Championship standings as they would be if the race ended now: the standings entering the race
 * plus the points of the current positions, so they move with the race (and with the replay).
 */
@Component({
  selector: 'app-championship-widget',
  imports: [MatProgressSpinnerModule, MatTabsModule, NgTemplateOutlet],
  templateUrl: './championship-widget.component.html',
  styleUrl: './championship-widget.component.scss',
})
export class ChampionshipWidgetComponent {
  private readonly store = inject(LiveTimingStore);
  private readonly api = inject(OpenF1Service);

  protected readonly base = signal<Base>({ state: 'loading' });

  private readonly positions = computed(() => {
    const map = new Map<number, number>();
    for (const row of this.store.rows()) if (row.position) map.set(row.driverNumber, row.position);
    return map;
  });
  private readonly scale = computed(() =>
    this.store.session()?.session_name === 'Sprint' ? SPRINT_POINTS : RACE_POINTS,
  );
  /** On the grid, before the first lap, positions award nothing. */
  protected readonly started = computed(() => this.store.lap() > 0);

  protected readonly drivers = computed<StandingRow[]>(() => {
    const base = this.base();
    if (base.state !== 'ready') return [];
    return projectDriverStandings(
      base.drivers,
      this.store.driversByNumber(),
      this.positions(),
      this.scale(),
      this.started(),
    );
  });
  protected readonly teams = computed<StandingRow[]>(() => {
    const base = this.base();
    if (base.state !== 'ready') return [];
    return projectTeamStandings(
      base.teams,
      this.store.driversByNumber(),
      this.positions(),
      this.scale(),
      this.started(),
    );
  });

  constructor() {
    effect((onCleanup) => {
      const session = this.store.session();
      if (!session) return;
      // Only Races and Sprints have a championship entry; elsewhere there is nothing to show.
      if (session.session_type !== 'Race') {
        this.base.set({ state: 'unavailable' });
        return;
      }

      this.base.set({ state: 'loading' });
      const cache = Date.parse(session.date_end) + FINISHED_AFTER_MS < untracked(() => Date.now());
      const subscription = forkJoin({
        drivers: this.api.getChampionshipDrivers(session.session_key, cache),
        teams: this.api.getChampionshipTeams(session.session_key, cache),
      }).subscribe({
        next: ({ drivers, teams }) =>
          this.base.set(
            drivers.length || teams.length
              ? { state: 'ready', drivers, teams }
              : { state: 'unavailable' },
          ),
        error: () => this.base.set({ state: 'error' }),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /** Places gained (+) or lost (-) against the standing entering the race. */
  protected move(row: StandingRow): number {
    return row.startPosition == null ? 0 : row.startPosition - row.position;
  }
}
