import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ErgastCircuit } from '../../core/ergast/ergast.model';
import { ErgastService } from '../../core/ergast/ergast.service';
import { CircuitOutlineComponent } from '../circuit-outline/circuit-outline.component';

@Component({
  selector: 'app-statistics',
  imports: [CircuitOutlineComponent, MatProgressSpinnerModule, RouterLink],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent implements OnInit {
  private ergast = inject(ErgastService);

  circuits = signal<ErgastCircuit[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    forkJoin([this.ergast.getCircuits(), this.ergast.getRaces()]).subscribe({
      next: ([circuits, races]) => {
        const roundByCircuitId = new Map(races.map((r) => [r.circuitId, r.round]));
        this.circuits.set(
          [...circuits].sort(
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
}
