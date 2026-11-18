// Take Solmarina's 4 screenshots in headless Chromium (Playwright +
// Chromium Headless Shell, SwiftShader WebGL). Serves game/ locally, loads
// each ?shot= scene at 1280x720, waits for window.__shotReady, and fails
// loudly on any console error, failed request or non-local request.
//
// Usage: node shots.mjs [shots.json path] [screenshots dir]
import { chromium } from '/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shotsFile = process.argv[2] || join(here, 'shots.json');
const outDir = process.argv[3] || join(here, 'screenshots');
const PORT = 8091;
const shots = JSON.parse(readFileSync(shotsFile, 'utf8'));

mkdirSync(outDir, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', join(here, 'game')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

let failed = false;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    const failedReqs = [];
    const external = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('requestfailed', (r) => failedReqs.push(r.url()));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) external.push(u);
    });
    const url = `http://127.0.0.1:${PORT}/index.html${shot.query}`;
    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
    } catch {
      errors.push('__shotReady never set');
    }
    await page.waitForTimeout(600);
    const out = join(outDir, shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
    const size = statSync(out).size;
    const ok = errors.length === 0 && failedReqs.length === 0 && external.length === 0 && size <= 262144;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${shot.name} ${size} bytes errors=${errors.length} failedReqs=${failedReqs.length} external=${external.length}`);
    if (!ok) {
      failed = true;
      for (const e of errors) console.log('  console:', e.slice(0, 300));
      for (const u of failedReqs) console.log('  reqfail:', u);
      for (const u of external) console.log('  external:', u);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
