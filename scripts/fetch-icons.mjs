#!/usr/bin/env node
/**
 * Downloads catalogue favicons once for inclusion in the static site.
 * No browser request to Google or the service is needed to display a tile.
 * Usage: node scripts/fetch-icons.mjs [--refresh]
 * Node.js >= 20; no npm dependency. Only validated PNG/JPEG/ICO files are retained.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "img/services");
const manifestPath = resolve(directory, "sources.json");
const sandbox = { window: {} };
runInNewContext(await readFile(resolve(root, "js/catalog.js"), "utf8"), sandbox);
const hosts = [...new Set(sandbox.window.EV_CATALOG.categories.flatMap(category =>
  category.shortcuts.map(shortcut => new URL(shortcut.url).hostname.replace(/^www\./, ""))
))].sort();
const refresh = process.argv.includes("--refresh");
const previous = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"));
const sources = {};
const failures = [];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Some app subdomains have no indexed icon; use the service's official site.
const iconDomains = {
  "afp.com": "www.afp.com",
  "arte.tv": "www.arte.tv",
  "driver.chargepoint.com": "chargepoint.com",
  "play.qobuz.com": "qobuz.com",
  "stations.go-electra.com": "go-electra.com",
  "vigilance.meteofrance.fr": "meteofrance.fr",
  "web.whatsapp.com": "whatsapp.com"
};
// Account landing pages can expose a generic Google icon instead of the app.
const directSources = {
  "calendar.google.com": "https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico",
  "docs.google.com": "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico",
  "drive.google.com": "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png",
  "mail.google.com": "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico"
};

function validateImage(bytes) {
  if (bytes.length < 33 || bytes.length > 100_000) throw new Error("Invalid or oversized image");
  let width, height, extension;
  if (bytes.subarray(0, 8).equals(pngSignature) && bytes.toString("ascii", 12, 16) === "IHDR") {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    extension = "png";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = bytes.readUInt16BE(offset + 5);
        width = bytes.readUInt16BE(offset + 7);
        extension = "jpg";
        break;
      }
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  } else if (bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) {
    const count = bytes.readUInt16LE(4);
    const choices = [];
    for (let i = 0; i < count && 6 + (i + 1) * 16 <= bytes.length; i++) {
      const start = 6 + i * 16;
      const w = bytes[start] || 256, h = bytes[start + 1] || 256;
      const length = bytes.readUInt32LE(start + 8), offset = bytes.readUInt32LE(start + 12);
      if (w <= 128 && h <= 128 && length > 0 && offset + length <= bytes.length) choices.push({ start, w, h, length, offset });
    }
    const chosen = choices.sort((a, b) => b.w - a.w)[0];
    if (chosen) {
      width = chosen.w; height = chosen.h; extension = "ico";
      // Retain one original bitmap losslessly; exclude oversized ICO variants.
      const result = Buffer.alloc(22 + chosen.length);
      result.writeUInt16LE(1, 2); result.writeUInt16LE(1, 4);
      bytes.copy(result, 6, chosen.start, chosen.start + 16);
      result.writeUInt32LE(22, 18);
      bytes.copy(result, 22, chosen.offset, chosen.offset + chosen.length);
      bytes = result;
    }
  }
  if (!extension || width < 1 || height < 1 || width > 128 || height > 128) throw new Error("Invalid PNG/JPEG/ICO or unsupported dimensions");
  return { width, height, extension, bytes };
}

await mkdir(directory, { recursive: true });
let next = 0;
let downloaded = 0;
async function worker() {
  while (next < hosts.length) {
    const host = hosts[next++];
    const existingPath = resolve(directory, previous[host]?.file || `${host}.png`);
    const existing = await readFile(existingPath).catch(() => null);
    if (!refresh && existing && previous[host]) {
      try {
        validateImage(existing);
        sources[host] = previous[host];
        continue;
      } catch { /* Try to replace a damaged cache entry. */ }
    }
    const source = directSources[host] || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(iconDomains[host] || host)}&sz=64`;
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!/^image\/(png|jpeg|x-icon|vnd.microsoft.icon)(;|$)/.test(response.headers.get("content-type") || "")) throw new Error("Not a supported image response");
      const { extension, bytes, ...dimensions } = validateImage(Buffer.from(await response.arrayBuffer()));
      const file = `${host}.${extension}`;
      await writeFile(resolve(directory, file), bytes);
      sources[host] = {
        file,
        source,
        original: response.headers.get("content-location") || directSources[host] || null,
        downloaded: new Date().toISOString().slice(0, 10),
        bytes: bytes.length,
        ...dimensions,
        sha256: createHash("sha256").update(bytes).digest("hex")
      };
      downloaded++;
    } catch (error) {
      failures.push(`${host}: ${error.message}`);
      // Keep a previously valid icon if an upstream refresh fails.
      if (existing && previous[host]) {
        try { validateImage(existing); sources[host] = previous[host]; } catch { /* Fallback monogram. */ }
      }
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const ordered = Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)));
const icons = Object.fromEntries(Object.entries(ordered).map(([host, source]) => [host, `./img/services/${source.file}`]));
await writeFile(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);
await writeFile(resolve(root, "js/icons.js"),
  `/** Local service favicons. Generated by scripts/fetch-icons.mjs; provenance: img/services/sources.json. */\nwindow.EV_ICONS = Object.freeze(${JSON.stringify(icons, null, 2)});\n`);
const size = Object.values(ordered).reduce((total, source) => total + source.bytes, 0);
console.log(`${Object.keys(icons).length}/${hosts.length} local icons; ${downloaded} downloaded; ${(size / 1024).toFixed(1)} KiB.`);
if (failures.length) console.warn(`Unavailable (existing icon or monogram retained):\n${failures.join("\n")}`);
