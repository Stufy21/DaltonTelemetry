import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OpenF1Config } from './openf1-config';
import { OpenF1Service } from './openf1.service';

const OWN = 'https://own.test/v1';
const PUBLIC = 'https://api.openf1.org/v1';
const DRIVER = { driver_number: 16, name_acronym: 'LEC' };
const SESSION = 11391;

/** The service with a self-hosted server configured, and a handle on the requests it makes. */
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: OpenF1Config, useValue: { baseUrl: OWN, selfHosted: true } },
    ],
  });
  return { service: TestBed.inject(OpenF1Service), http: TestBed.inject(HttpTestingController) };
}

/** Requests go out on a timer, so give them a moment before looking for them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const fromPublic = (req: { url: string }) => req.url.startsWith(PUBLIC);

describe('OpenF1Service with a self-hosted server', () => {
  // public requests are paced through slots kept in localStorage, which would delay the next test
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('keeps asking the self-hosted server for a session it holds, even when an answer is empty', async () => {
    const { service, http } = setup();
    let result: unknown = 'pending';
    service.getIntervals(SESSION, undefined, true).subscribe((rows) => (result = rows));

    await settle();
    http.expectOne(`${OWN}/drivers?session_key=${SESSION}`).flush([DRIVER]);
    await settle();
    // a practice has no intervals: that is no reason to ask the public API, which refuses
    // everything while a session is live
    http.expectOne(`${OWN}/intervals?session_key=${SESSION}`).flush([]);
    await settle();

    http.expectNone(fromPublic);
    expect(result).toEqual([]);
  });

  it('reads a session the server does not hold from the public API', async () => {
    const { service, http } = setup();
    let result: unknown;
    service.getLaps(9662, undefined, true).subscribe((rows) => (result = rows));

    await settle();
    http.expectOne(`${OWN}/drivers?session_key=9662`).flush([]);
    await settle();
    http.expectNone(`${OWN}/laps?session_key=9662`);
    http.expectOne(`${PUBLIC}/laps?session_key=9662`).flush([{ lap_number: 1 }]);
    await settle();

    expect(result).toEqual([{ lap_number: 1 }]);
  });

  it('falls back to the public API when the server cannot be reached', async () => {
    const { service, http } = setup();
    let result: unknown;
    service.getLaps(SESSION, undefined, true).subscribe((rows) => (result = rows));

    await settle();
    http.expectOne(`${OWN}/drivers?session_key=${SESSION}`).error(new ProgressEvent('error'));
    await settle();
    http.expectOne(`${PUBLIC}/laps?session_key=${SESSION}`).flush([{ lap_number: 2 }]);
    await settle();

    expect(result).toEqual([{ lap_number: 2 }]);
  });

  it('works out where a session lives once, not for every request', async () => {
    const { service, http } = setup();
    service.getIntervals(SESSION, undefined, true).subscribe();
    service.getLaps(SESSION, undefined, true).subscribe();
    service.getStints(SESSION, true).subscribe();

    await settle();
    http.expectOne(`${OWN}/drivers?session_key=${SESSION}`).flush([DRIVER]); // a single probe
    await settle();
    http.expectOne(`${OWN}/intervals?session_key=${SESSION}`).flush([]);
    http.expectOne(`${OWN}/laps?session_key=${SESSION}`).flush([]);
    http.expectOne(`${OWN}/stints?session_key=${SESSION}`).flush([]);
    await settle();
    http.expectNone(fromPublic);

    // a later request for the same session goes straight to the server
    service.getWeather(SESSION, undefined, true).subscribe();
    await settle();
    http.expectNone(`${OWN}/drivers?session_key=${SESSION}`);
    http.expectOne(`${OWN}/weather?session_key=${SESSION}`).flush([]);
  });

  it('asks the public API for a season the server does not hold', async () => {
    const { service, http } = setup();
    let result: unknown;
    service.getSessions(2024).subscribe((rows) => (result = rows));

    await settle();
    http.expectOne(`${OWN}/sessions?year=2024`).flush([]);
    await settle();
    http.expectOne(`${PUBLIC}/sessions?year=2024`).flush([{ session_key: 9662 }]);
    await settle();

    expect(result).toEqual([{ session_key: 9662 }]);
  });
});
