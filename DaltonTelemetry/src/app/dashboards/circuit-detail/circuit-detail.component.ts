import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ErgastCircuit } from '../../core/ergast/ergast.model';
import { ErgastService } from '../../core/ergast/ergast.service';
import { CircuitOutlineComponent } from '../circuit-outline/circuit-outline.component';
import { buildCircuitStats, CircuitStats, RankedEntry } from './circuit-stats';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; circuit: ErgastCircuit | null; stats: CircuitStats };

const TOP = 5;

/** Historical statistics of one circuit: winners, poles, lap record and every edition. */
@Component({
  selector: 'app-circuit-detail',
  imports: [
    CircuitOutlineComponent,
    DecimalPipe,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './circuit-detail.component.html',
  styleUrl: './circuit-detail.component.scss',
})
export class CircuitDetailComponent {
  private readonly ergast = inject(ErgastService);
  private readonly circuitId$ = inject(ActivatedRoute).paramMap.pipe(
    map((params) => params.get('circuitId') ?? ''),
  );

  protected readonly circuitId = toSignal(this.circuitId$, { initialValue: '' });

  protected readonly state = toSignal(
    this.circuitId$.pipe(
      switchMap((id) =>
        this.ergast.getCircuitHistory(id).pipe(
          map(
            (history): State => ({
              status: 'ready',
              circuit: history.circuit,
              stats: buildCircuitStats(history.winners, history.poles, history.fastest),
            }),
          ),
          startWith<State>({ status: 'loading' }),
          catchError(() => of<State>({ status: 'error' })),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as State },
  );

  protected readonly ready = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s : null;
  });

  protected top(entries: RankedEntry[]): RankedEntry[] {
    return entries.slice(0, TOP);
  }

  /** Bar length relative to the leader of the same ranking. */
  protected share(entry: RankedEntry, entries: RankedEntry[]): number {
    return entries.length ? (entry.count / entries[0].count) * 100 : 0;
  }

  /** First season with qualifying data (it is only recorded from the 1990s), for the pole stats. */
  protected poleSince(entries: RankedEntry[]): number | null {
    const seasons = entries.flatMap((e) => e.seasons);
    return seasons.length ? Math.min(...seasons) : null;
  }

  protected percent(part: number, whole: number): number {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  protected years(entry: RankedEntry): string {
    return [...entry.seasons].sort((a, b) => a - b).join(', ');
  }
}
