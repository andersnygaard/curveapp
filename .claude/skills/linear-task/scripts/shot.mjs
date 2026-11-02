#!/usr/bin/env node
// Playwright screenshot for the linear-task skill. Run it from the app's folder: playwright
// resolves from the working directory, so the app's own install is used.
//   shot.mjs <url> <out.png> [--viewport 1280x800] [--full-page] [--steps <module.mjs>]
// --steps names a module whose default export, async (page) => {}, runs before the shot and can
// click, fill in forms or take extra screenshots. Browser errors are printed and fail the run,
// because a screenshot of a page that logs errors is not evidence that it works.

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args.splice(i, 2)[1];
}

const viewport = option('viewport') || '1280x800';
const stepsPath = option('steps');
const fullPageAt = args.indexOf('--full-page');
if (fullPageAt >= 0) args.splice(fullPageAt, 1);
const [url, out] = args;

let browser;
try {
  if (!url || !out) throw new Error('usage: shot.mjs <url> <out.png> [--viewport 1280x800] [--full-page] [--steps <module.mjs>]');

  let chromium;
  try { ({ chromium } = createRequire(`${process.cwd()}/`)('playwright')); }
  catch { throw new Error(`playwright not found from ${process.cwd()}: run npm i -D playwright and npx playwright install chromium there`); }

  const [width, height] = viewport.split('x').map(Number);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });

  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`exception: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

  await page.goto(url, { waitUntil: 'networkidle' });
  if (stepsPath) {
    const { default: steps } = await import(pathToFileURL(resolve(stepsPath)).href);
    await steps(page);
  }
  await page.screenshot({ path: out, fullPage: fullPageAt >= 0 });
  console.log(out);

  if (problems.length) {
    console.error(`Browser errors:\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`shot: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
