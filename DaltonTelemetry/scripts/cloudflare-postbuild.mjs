// Prepares the static build for Cloudflare.
//
// `ng build --output-mode=static` emits the client-rendered shell as `index.csr.html` and no
// `index.html`. Cloudflare's single-page-app fallback serves `/index.html` for every route that has
// no file of its own (/, /live-timing, /reports/stats/monza, ...), so that shell must be called
// index.html.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(import.meta.dirname, '..', 'dist', 'DaltonTelemetry', 'browser');
const shell = join(outputDir, 'index.csr.html');

if (!existsSync(shell)) {
  console.error(`Expected ${shell}. Run "ng build --output-mode=static" first.`);
  process.exit(1);
}

copyFileSync(shell, join(outputDir, 'index.html'));
console.log('Cloudflare: index.csr.html copied to index.html (single-page-app fallback).');
