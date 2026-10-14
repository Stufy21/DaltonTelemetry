import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TimingRow } from '../timing-dataset';
import { COMPOUND_LETTER, formatLapTime, formatSector } from '../format';

@Component({
  selector: 'app-leaderboard',
  imports: [MatIconModule],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
})
export class LeaderboardComponent {
  readonly rows = input.required<TimingRow[]>();
  /** Driver numbers picked for comparison, in selection order. */
  readonly selected = input<number[]>([]);
  readonly select = output<number>();

  protected readonly lap = formatLapTime;
  protected readonly sector = formatSector;

  protected slot(driver: number): string | null {
    const i = this.selected().indexOf(driver);
    return i < 0 ? null : i === 0 ? 'A' : 'B';
  }

  protected compoundLetter(compound: string | null): string {
    return compound ? (COMPOUND_LETTER[compound] ?? '?') : '–';
  }
}
