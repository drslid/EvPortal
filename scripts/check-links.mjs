#!/usr/bin/env node
/**
 * HTTP inventory only: a successful response does not validate media playback,
 * authentication or an in-car browser. Node.js 20+, no dependencies.
 * Usage: node scripts/check-links.mjs [--input links.json] [--timeout 12000]
 *                                   [--concurrency 6] [--output report.json]
 * JSON input: an array of {name, url}, or the former category-to-links object.
 */
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const options = { timeout: 12000, concurrency: 6 };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  if (!['input', 'output', 'timeout', 'concurrency'].includes(key) || !args[i + 1]) {
    throw new Error('Options: --input file.json --output report.json --timeout 12000 --concurrency 6');
  }
  options[key] = ['timeout', 'concurrency'].includes(key) ? Number(args[i + 1]) : args[i + 1];
}
if (!Number.isInteger(options.timeout) || options.timeout < 100 || options.timeout > 60000 ||
    !Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 12) {
  throw new Error('Timeout: 100–60000 ms. Concurrency: 1–12.');
}

let entries;
if (options.input) {
  const source = JSON.parse(await readFile(options.input, 'utf8'));
  entries = Array.isArray(source) ? source : Object.values(source).flat();
} else {
  const context = { window: {} };
  vm.runInNewContext(await readFile(new URL('../js/catalog.js', import.meta.url), 'utf8'), context, { timeout: 1000 });
  entries = context.window.EV_CATALOG.categories.flatMap(category =>
    category.shortcuts.map(shortcut => ({ category: category.id, name: shortcut.name, url: shortcut.url })));
}
const links = [...new Map(entries.map(entry => [entry.url, entry])).values()];
for (const link of links) {
  if (typeof link.url !== 'string' || !['http:', 'https:'].includes(new URL(link.url).protocol)) {
    throw new Error('Every link must have an HTTP(S) URL.');
  }
}

function classify(status) {
  if (status >= 200 && status < 300) return 'accessible-http';
  if ([401, 403, 407, 429, 451].includes(status)) return 'restricted-or-unverifiable';
  if ([404, 410].includes(status)) return 'not-found-to-review';
  if (status >= 500) return 'server-error-to-review';
  return 'http-response-to-review';
}

async function inspect(link) {
  const started = Date.now();
  try {
    const response = await fetch(link.url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeout),
      headers: { 'User-Agent': 'EvPortal-LinkCheck/1.0', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    });
    // Keep bandwidth bounded: the status and final URL suffice for this check.
    await response.body?.cancel();
    return { ...link, status: response.status, finalUrl: response.url, redirected: response.redirected,
      result: classify(response.status), elapsedMs: Date.now() - started };
  } catch (error) {
    return { ...link, status: null, result: 'network-unverifiable',
      error: error.cause?.code || error.name, elapsedMs: Date.now() - started };
  }
}

const results = new Array(links.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(options.concurrency, links.length) }, async () => {
  while (next < links.length) {
    const index = next++;
    results[index] = await inspect(links[index]);
  }
}));
const counts = results.reduce((summary, link) => {
  summary[link.result] = (summary[link.result] || 0) + 1;
  return summary;
}, {});
const report = { checkedAt: new Date().toISOString(), method: 'GET; follow redirects; cancel response body',
  timeoutMs: options.timeout, concurrency: options.concurrency, entries: entries.length,
  uniqueUrls: links.length, counts,
  caveat: 'HTTP only. 403/429 and network errors are inconclusive; 2xx does not verify playback, accounts, region or browser compatibility.',
  results };
const json = JSON.stringify(report, null, 2) + '\n';
if (options.output) await writeFile(options.output, json);
process.stdout.write(json);
