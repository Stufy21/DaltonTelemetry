import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import {
  ErgastCircuit,
  ErgastCircuitsResponse,
  ErgastHistoricRace,
  ErgastHistoricRacesResponse,
  ErgastRacesResponse,
  WikimediaPageSummary,
} from './ergast.model';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1/2026';
const HISTORY_URL = 'https://api.jolpi.ca/ergast/f1/circuits';
const WIKIMEDIA_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary';

@Injectable({ providedIn: 'root' })
export class ErgastService {
  private http = inject(HttpClient);
  private readonly histories = new Map<string, Observable<CircuitHistory>>();

  getCircuits(limit = 100, offset = 0): Observable<ErgastCircuit[]> {
    return this.http
      .get<ErgastCircuitsResponse>(`${BASE_URL}/circuits/`, { params: { limit, offset } })
      .pipe(map((res) => res.MRData.CircuitTable.Circuits));
  }

  getRaces(): Observable<{ circuitId: string; round: number }[]> {
    return this.http
      .get<ErgastRacesResponse>(`${BASE_URL}/races/`)
      .pipe(
        map((res) =>
          res.MRData.RaceTable.Races.map((r) => ({
            circuitId: r.Circuit.circuitId,
            round: Number(r.round),
          })),
        ),
      );
  }

  /** Every Grand Prix held at a circuit: winners, pole sitters and fastest laps (all seasons). */
  getCircuitHistory(circuitId: string): Observable<CircuitHistory> {
    let history = this.histories.get(circuitId);
    if (!history) {
      const races = (path: string) =>
        this.http
          .get<ErgastHistoricRacesResponse>(`${HISTORY_URL}/${circuitId}/${path}`, {
            params: { limit: 100 },
          })
          .pipe(map((res) => res.MRData.RaceTable.Races));
      history = forkJoin({
        winners: races('results/1.json'),
        poles: races('qualifying/1.json'),
        fastest: races('fastest/1/results.json'),
        circuit: this.http
          .get<ErgastCircuitsResponse>(`${HISTORY_URL}/${circuitId}.json`)
          .pipe(map((res) => res.MRData.CircuitTable.Circuits[0] ?? null)),
      }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.histories.set(circuitId, history);
    }
    return history;
  }

  getCircuitImageUrl(circuit: ErgastCircuit): Observable<string | null> {
    const title = circuit.url.split('/wiki/')[1];
    return this.http
      .get<WikimediaPageSummary>(`${WIKIMEDIA_SUMMARY_URL}/${title}`)
      .pipe(map((res) => res.thumbnail?.source ?? null));
  }
}

export interface CircuitHistory {
  winners: ErgastHistoricRace[];
  poles: ErgastHistoricRace[];
  fastest: ErgastHistoricRace[];
  circuit: ErgastCircuit | null;
}
