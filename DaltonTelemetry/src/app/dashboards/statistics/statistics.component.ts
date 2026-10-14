import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ErgastCircuit } from '../../core/ergast/ergast.model';
import { ErgastService } from '../../core/ergast/ergast.service';
import { CIRCUIT_SVG_MAP } from '../../consts/CircuitSvgMap';

@Component({
  selector: 'app-statistics',
  imports: [MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent implements OnInit {
  private ergast = inject(ErgastService);

  circuits = signal<ErgastCircuit[]>([]);
  loading = signal(true);
  /** Circuits whose layout image failed to load (the SVG source is a third-party repo). */
  brokenImages = signal<ReadonlySet<string>>(new Set());

  ngOnInit(): void {
    forkJoin([this.ergast.getCircuits(), this.ergast.getRaces()]).subscribe({
      next: ([circuits, races]) => {
        const roundByCircuitId = new Map(races.map((r) => [r.circuitId, r.round]));
        this.circuits.set(
          circuits
            .map((circuit) => ({ ...circuit, photoUrl: this.getCircuitSvgUrl(circuit.circuitId) }))
            .sort(
              (a, b) =>
                (roundByCircuitId.get(a.circuitId) ?? 999) -
                (roundByCircuitId.get(b.circuitId) ?? 999),
            ),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markImageBroken(circuitId: string): void {
    this.brokenImages.update((set) => new Set(set).add(circuitId));
  }

  getCircuitSvgUrl(circuitId: string): string {
    const slug = CIRCUIT_SVG_MAP[circuitId] ?? circuitId;
    return `https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/refs/heads/main/circuits/minimal/black-outline/${slug}.svg`;
  }
}
