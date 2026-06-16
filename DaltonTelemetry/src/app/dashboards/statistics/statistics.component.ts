import { Component, inject, OnInit, signal } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ErgastCircuit } from '../../core/ergast/ergast.model';
import { ErgastService } from '../../core/ergast/ergast.service';

export interface Track {
  color: string;
  cols: number;
  rows: number;
  text: string;
}

@Component({
  selector: 'app-statistics',
  imports: [MatGridListModule, MatProgressSpinnerModule],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent implements OnInit {
  private ergast = inject(ErgastService);

  circuits = signal<ErgastCircuit[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.ergast.getCircuits().subscribe({
      next: (data) => {
        this.circuits.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
