import { Component, inject, OnInit, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ErgastCircuit } from '../../core/ergast/ergast.model';
import { ErgastService } from '../../core/ergast/ergast.service';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

export interface TrackUrl {
  circuitName: string;
  photoUrl: string | null;
}

@Component({
  selector: 'app-statistics',
  imports: [MatGridListModule, MatProgressSpinnerModule, MatCardModule, MatButtonModule],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
})
export class StatisticsComponent implements OnInit {
  private ergast = inject(ErgastService);
  // Nel tuo component/service, mappa circuitId → slug del repo
  private readonly circuitSvgMap: Record<string, string> = {
    'monza':          'monza-7',
    'monaco':         'monaco-6',
    'silverstone':    'silverstone-8',
    'spa':            'spa-francorchamps-4',
    'bahrain':        'bahrain-1',
    'jeddah':         'jeddah-1',
    'albert_park':    'melbourne-2',
    'suzuka':         'suzuka-2',
    'shanghai':       'shanghai-1',
    'miami':          'miami-1',
    'imola':          'imola-3',
    'villeneuve':     'montreal-6',
    'red_bull_ring':  'spielberg-3',
    'hungaroring':    'hungaroring-3',
    'zandvoort':      'zandvoort-5',
    'baku':           'baku-1',
    'marina_bay':     'marina-bay-4',
    'americas':       'austin-1',
    'rodriguez':      'mexico-city-3',
    'interlagos':     'interlagos-2',
    'vegas':          'las-vegas-1',
    'losail':         'lusail-1',
    'yas_marina':     'yas-marina-2',
    'madring':        'madring-1',
    'catalunya':      'catalunya-6'
  };


  circuits = signal<ErgastCircuit[]>([]);
  loading = signal(true);
  url = signal<TrackUrl[]>([]);

  ngOnInit(): void {
    forkJoin([this.ergast.getCircuits(), this.ergast.getRaces()]).subscribe({
      next: ([circuits, races]) => {
        const roundByCircuitId = new Map(races.map((r) => [r.circuitId, r.round]));
        this.circuits.set(
          circuits
            .map((circuit) => ({ ...circuit, photoUrl: this.getCircuitSvgUrl(circuit.circuitId) }))
            .sort((a, b) => (roundByCircuitId.get(a.circuitId) ?? 999) - (roundByCircuitId.get(b.circuitId) ?? 999)),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getCircuitSvgUrl(circuitId: string): string {
    const slug = this.circuitSvgMap[circuitId] ?? circuitId;
    return `https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/refs/heads/main/circuits/minimal/black-outline/${slug}.svg`;
  }
}


