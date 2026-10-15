import { Component, effect, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { CircuitOutline } from '../statistics/circuit-outlines';

let outlines: Promise<Record<string, CircuitOutline>> | null = null;

/** The outlines are ~20 kB of path data: loaded on first use to keep them out of the main bundle. */
const loadOutlines = (): Promise<Record<string, CircuitOutline>> =>
  (outlines ??= import('../statistics/circuit-outlines').then((m) => m.CIRCUIT_OUTLINES));

/** A circuit's layout, drawn from OpenF1 car coordinates (see scripts/generate-circuit-outlines.mjs). */
@Component({
  selector: 'app-circuit-outline',
  imports: [MatIconModule],
  templateUrl: './circuit-outline.component.html',
  styleUrl: './circuit-outline.component.scss',
})
export class CircuitOutlineComponent {
  /** Ergast circuit id, e.g. `monza`. */
  readonly circuitId = input.required<string>();
  readonly label = input('');

  /** undefined while loading, null when there is no outline for this circuit. */
  protected readonly outline = signal<CircuitOutline | null | undefined>(undefined);

  constructor() {
    effect((onCleanup) => {
      const id = this.circuitId();
      let current = true;
      onCleanup(() => (current = false));
      loadOutlines()
        .then((all) => current && this.outline.set(all[id] ?? null))
        .catch(() => current && this.outline.set(null));
    });
  }
}
