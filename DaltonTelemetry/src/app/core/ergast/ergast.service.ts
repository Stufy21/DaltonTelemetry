import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErgastCircuit, ErgastCircuitsResponse, ErgastRacesResponse, WikimediaPageSummary } from './ergast.model';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1/2026';
const WIKIMEDIA_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary';

@Injectable({ providedIn: 'root' })
export class ErgastService {
  private http = inject(HttpClient);

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

  getCircuitImageUrl(circuit: ErgastCircuit): Observable<string | null> {
    const title = circuit.url.split('/wiki/')[1];
    return this.http
      .get<WikimediaPageSummary>(`${WIKIMEDIA_SUMMARY_URL}/${title}`)
      .pipe(map((res) => res.thumbnail?.source ?? null));
  }
}
