import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErgastCircuit, ErgastCircuitsResponse } from './ergast.model';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1/2026';

@Injectable({ providedIn: 'root' })
export class ErgastService {
  private http = inject(HttpClient);

  getCircuits(limit = 100, offset = 0): Observable<ErgastCircuit[]> {
    return this.http
      .get<ErgastCircuitsResponse>(`${BASE_URL}/circuits/`, { params: { limit, offset } })
      .pipe(map((res) => res.MRData.CircuitTable.Circuits));
  }
}
