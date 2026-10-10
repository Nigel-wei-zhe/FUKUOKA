#!/usr/bin/env node
// 把 data/trip.json 的地點匯出成 CSV，匯入 Google 試算表的「網站用」分頁。
// 只在第一次建立分頁時用；之後地點以試算表為準，改用 tools/sheet-to-trip.mjs 轉回來。
//
// 用法（在專案根目錄執行）：
//   node tools/trip-to-csv.mjs > 網站用.csv

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS, splitDesc, toCSV } from './sheet-columns.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const trip = JSON.parse(readFileSync(resolve(ROOT, 'data/trip.json'), 'utf8'));

const rows = [COLUMNS.map((c) => c.header)];
for (const item of trip.items) {
  const row = { ...item, ...splitDesc(item.desc) };
  rows.push(COLUMNS.map((c) => (row[c.key] == null ? '' : row[c.key])));
}
process.stdout.write(toCSV(rows));
console.error(`匯出 ${trip.items.length} 個地點`);
