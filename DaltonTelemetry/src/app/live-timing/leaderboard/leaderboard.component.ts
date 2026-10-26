import { Component, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TimingRow } from '../timing-dataset';
import { COMPOUND_LETTER, formatLapTime, formatSector } from '../format';
import { ThemeService } from '../../core/theme/theme.service';
import { teamLogoUrl } from '../team-logo';

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

  /** Teams whose logo did not load: they get their colour bar instead of a broken image. */
  private readonly failedLogos = signal<ReadonlySet<string>>(new Set());

  private readonly theme = inject(ThemeService);

  /** The one-colour white logo on the dark theme, the full-colour one on the light theme. */
  protected logo(team: string | null): string | null {
    if (!team || this.failedLogos().has(team)) return null;
    return teamLogoUrl(team, this.theme.resolved() === 'dark' ? 'white' : 'colour');
  }

  protected logoFailed(team: string | null): void {
    if (team) this.failedLogos.update((failed) => new Set(failed).add(team));
  }

  protected slot(driver: number): string | null {
    const i = this.selected().indexOf(driver);
    return i < 0 ? null : i === 0 ? 'A' : 'B';
  }

  protected compoundLetter(compound: string | null): string {
    return compound ? (COMPOUND_LETTER[compound] ?? '?') : '–';
  }
}
