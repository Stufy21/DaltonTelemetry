import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Client-rendered: these pages need browser-only data. The root is also client-side so the
  // static build's index.html is the real app shell (a prerendered redirect would be a dead end
  // as a single-page-app fallback).
  {
    path: '',
    renderMode: RenderMode.Client,
  },
  {
    path: 'live-timing',
    renderMode: RenderMode.Client,
  },
  {
    path: 'statistics/:circuitId',
    renderMode: RenderMode.Client,
  },
  // Old Statistics URLs only redirect, which has to happen in the browser.
  {
    path: 'reports/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
