import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter } from '@angular/router';
import { provideHttpClient, } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { OpenF1Config } from './core/openf1/openf1-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(),
    // Which OpenF1 server to use (public API or a self-hosted one) comes from /config.json.
    provideAppInitializer(() => {
      const config = inject(OpenF1Config);
      return isPlatformBrowser(inject(PLATFORM_ID)) ? config.load() : undefined;
    }),
  ],
};
