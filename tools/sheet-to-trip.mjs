#!/usr/bin/env node
// 把 Google 試算表「網站用」分頁（發布成 CSV）轉成 data/trip.json 的地點（items）。
// trip.json 其他欄位（旅程名稱、天數標題、天氣、出發日期）不動，只換掉 items。
//
// 用法（在專案根目錄執行，不需要安裝套件，Node 18 以上）：
//   SHEET_CSV_URL=<發布的 CSV 網址> node tools/sheet-to-trip.mjs
//   node tools/sheet-to-trip.mjs --csv 網站用.csv      用下載的 CSV 檔
//   加上 --dry-run 只檢查、列出變動，不寫入
//   一次刪除很多地點時會擋下來（可能是讀錯分頁）；確定要刪就加 --allow-delete
//
// 有錯誤（id 重複、時間格式、分類…）時不寫入，結束代碼為 1，錯誤訊息會寫出是第幾列。

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS, joinDesc, parseCSV } from './sheet-columns.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRIP = resolve(ROOT, 'data/trip.json');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const allowDelete = args.includes('--allow-delete');
const csvArg = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : '';
const url = process.env.SHEET_CSV_URL || '';

const CATEGORIES = ['景點', '美食', '購物', '交通', '住宿'];
const errors = [];
const warnings = [];
const summary = [];

// ---------- 讀 CSV ----------
let csv;
if (csvArg) {
  csv = readFileSync(resolve(process.cwd(), csvArg), 'utf8');
} else if (url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) fail(`讀不到試算表（HTTP ${res.status}）。請確認「網站用」分頁有「發布到網路」，而且 SHEET_CSV_URL 是 CSV 格式的網址。`);
  csv = await res.text();
  if (/^\s*<(!doctype|html)/i.test(csv)) fail('拿到的是網頁不是 CSV。發布時格式要選「逗號分隔值 (.csv)」。');
} else {
  fail('沒有資料來源：設定環境變數 SHEET_CSV_URL，或用 --csv 指定檔案。');
}

const rows = parseCSV(csv);
const header = (rows.shift() || []).map((h) => h.trim());
const col = {};
for (const c of COLUMNS) {
  const idx = header.indexOf(c.header);
  if (idx > -1) col[c.key] = idx;
}
for (const need of ['id', 'day', 'title']) {
  if (col[need] == null) fail(`第 1 列（標題列）找不到「${COLUMNS.find((c) => c.key === need).header}」欄。欄位名稱要和範本一樣：${COLUMNS.map((c) => c.header).join('、')}`);
}

// ---------- 逐列轉換、檢查 ----------
const old = JSON.parse(readFileSync(TRIP, 'utf8'));
const items = [];
const seen = new Map();
const pending = []; // 要從地圖連結補經緯度的地點

rows.forEach((cells, i) => {
  const line = i + 2; // 試算表的列號（第 1 列是標題）
  const get = (key) => (col[key] == null ? '' : String(cells[col[key]] ?? '').trim());
  if (COLUMNS.every((c) => !get(c.key))) return; // 整列空白

  const title = get('title');
  const where = `第 ${line} 列${title ? `「${title}」` : ''}`;
  const id = get('id');
  if (!id) errors.push(`${where}：id 是空的`);
  else if (seen.has(id)) errors.push(`${where}：id ${id} 和第 ${seen.get(id)} 列重複了，蓋章紀錄會互相影響`);
  else seen.set(id, line);

  if (!title) errors.push(`${where}：名稱是空的`);

  const dayText = get('day');
  const day = Number(dayText);
  if (!/^\d+$/.test(dayText) || day < 1) errors.push(`${where}：天數要填數字，例如 3，現在是「${dayText}」`);

  const time = normalizeTime(get('time'));
  if (time === null) errors.push(`${where}：時間格式要像 09:30，現在是「${get('time')}」。可以把「時間」欄設成純文字（格式 → 數字 → 純文字）`);

  const category = get('category');
  if (category && !CATEGORIES.includes(category)) errors.push(`${where}：分類只能是 ${CATEGORIES.join('、')}，現在是「${category}」`);

  const gmap = get('gmap');
  if (gmap && !/^https?:\/\//.test(gmap)) errors.push(`${where}：Google 地圖連結要是 https:// 開頭的網址`);

  let lat = numberOrEmpty(get('lat'));
  let lng = numberOrEmpty(get('lng'));
  if (lat === null || lng === null) errors.push(`${where}：緯度、經度要是數字`);

  const item = {
    id,
    day,
    time: time || '',
    tz: get('tz'),
    title,
    ja: get('ja'),
    address: get('address'),
    category,
    gmap,
    lat,
    lng,
    desc: joinDesc({ text: get('text'), hours: get('hours'), booking: get('booking') }),
    price: get('price')
  };
  if (item.category === '住宿' && (!item.ja || !item.address)) {
    warnings.push(`${where}：住宿最好填日文名稱和日文地址，指指卡「帶我回飯店」要給司機看`);
  }
  if ((lat === '' || lng === '') && lat !== null && lng !== null) pending.push({ item, where });
  items.push(item);
});

if (errors.length) {
  const nums = [...seen.keys()].map(Number).filter(Number.isInteger);
  if (errors.some((e) => e.includes('id 是空的')) && nums.length) errors.push(`下一個可以用的 id：${Math.max(...nums) + 1}`);
  report();
  process.exit(1);
}

// ---------- 沒填經緯度的，從 Google 地圖連結找 ----------
for (const { item, where } of pending) {
  const found = item.gmap ? await coordsFromLink(item.gmap) : null;
  if (found) {
    item.lat = found.lat;
    item.lng = found.lng;
    warnings.push(`${where}：經緯度從地圖連結自動補上（${found.lat}, ${found.lng}），在地圖上看一下位置對不對`);
  } else {
    warnings.push(`${where}：沒有經緯度${item.gmap ? '，地圖連結也找不到座標' : ''}，不會出現在地圖頁。可以在 Google 地圖對地點按右鍵，複製經緯度填進去`);
  }
}

// ---------- 和現在的 trip.json 比較 ----------
const before = new Map(old.items.map((it) => [String(it.id), it]));
const after = new Map(items.map((it) => [it.id, it]));
const added = items.filter((it) => !before.has(it.id));
const removed = old.items.filter((it) => !after.has(String(it.id)));
const changed = items.filter((it) => before.has(it.id) && JSON.stringify(clean(before.get(it.id))) !== JSON.stringify(clean(it)));

// 保護：讀錯分頁或試算表被清空時，不要一次把地點和蓋章紀錄全刪掉
if (!items.length) {
  errors.push('試算表裡一個地點都沒有，可能是發布錯分頁，沒有寫入');
} else if (removed.length > Math.max(5, old.items.length * 0.2) && !allowDelete) {
  errors.push(`這次會刪除 ${removed.length} 個地點（原本 ${old.items.length} 個），可能是讀錯分頁或漏了資料，先擋下來沒有寫入。確定要刪，在 GitHub 執行時勾選「允許一次刪除很多地點」（或加 --allow-delete）`);
}
if (errors.length) {
  report();
  process.exit(1);
}

summary.push(`試算表共 ${items.length} 個地點：新增 ${added.length}、修改 ${changed.length}、刪除 ${removed.length}`);
added.forEach((it) => summary.push(`＋ 新增 第 ${it.day} 天 ${it.time || '未定'} ${it.title}（id ${it.id}）`));
changed.forEach((it) => summary.push(`～ 修改 ${it.title}（id ${it.id}）：${diffFields(before.get(it.id), it).join('、')}`));
removed.forEach((it) => summary.push(`－ 刪除 ${it.title}（id ${it.id}）：這個地點的蓋章紀錄也會不見`));

report();

if (!added.length && !changed.length && !removed.length) {
  console.log('\n和現在的 trip.json 一樣，不用更新。');
} else if (dryRun) {
  console.log('\n--dry-run：只檢查，沒有寫入。');
} else {
  writeFileSync(TRIP, replaceItems(readFileSync(TRIP, 'utf8'), items.map(clean)));
  console.log('\n已更新 data/trip.json，接著執行 node tools/check-trip.mjs 檢查。');
}

// ---------- 工具 ----------
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function report() {
  const out = [];
  if (errors.length) out.push(`✗ ${errors.length} 個錯誤，沒有寫入：`, ...errors.map((e) => `  - ${e}`));
  if (warnings.length) out.push(`⚠ ${warnings.length} 個提醒：`, ...warnings.map((w) => `  - ${w}`));
  if (summary.length) out.push(...summary);
  console.log(out.join('\n'));
  // GitHub Actions 的執行結果頁面
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## 試算表同步', '', ...out.map((l) => (l.startsWith('  - ') ? l.slice(2) : `- ${l}`)), ''].join('\n') + '\n');
  }
}

// 「09:30」「9:30」「09:30:00」「下午 1:05:00」「1:05 PM」都轉成 HH:MM；空白回傳 ''；看不懂回傳 null
function normalizeTime(s) {
  if (!s) return '';
  const m = /^(上午|下午|AM|PM)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[2]);
  const min = Number(m[3]);
  const ampm = (m[1] || m[4] || '').toUpperCase();
  if (ampm === '下午' || ampm === 'PM') h = h % 12 + 12;
  if (ampm === '上午' || ampm === 'AM') h = h % 12;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function numberOrEmpty(s) {
  if (s === '') return '';
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// 從 Google 地圖連結找座標：直接帶座標的網址，或短網址展開後的網址
async function coordsFromLink(link) {
  const pick = (u) => {
    const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/];
    for (const p of pats) {
      const m = p.exec(decodeURIComponent(u));
      if (m) return { lat: Number(Number(m[1]).toFixed(6)), lng: Number(Number(m[2]).toFixed(6)) };
    }
    return null;
  };
  const direct = pick(link);
  if (direct) return direct;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(link, { redirect: 'follow', signal: ctrl.signal });
    clearTimeout(timer);
    return pick(res.url) || pick(await res.text());
  } catch {
    return null;
  }
}

// 輸出時欄位順序固定；tz、ja、address 有填才寫，經緯度沒有就不寫
function clean(it) {
  const o = { id: String(it.id), day: it.day, time: it.time || '' };
  if (it.tz) o.tz = it.tz;
  o.title = it.title;
  if (it.ja) o.ja = it.ja;
  if (it.address) o.address = it.address;
  o.category = it.category || '';
  o.gmap = it.gmap || '';
  if (it.lat !== '' && it.lat != null) o.lat = it.lat;
  if (it.lng !== '' && it.lng != null) o.lng = it.lng;
  o.desc = it.desc || '';
  o.price = it.price || '';
  return o;
}

function diffFields(a, b) {
  const names = { day: '天數', time: '時間', tz: '時區', title: '名稱', ja: '日文名稱', address: '日文地址', category: '分類', gmap: '地圖連結', lat: '緯度', lng: '經度', desc: '說明', price: '價位' };
  const ca = clean(a);
  const cb = clean(b);
  return Object.keys(names).filter((k) => JSON.stringify(ca[k]) !== JSON.stringify(cb[k])).map((k) => names[k]);
}

// 只換掉 "items": [ … ] 這一段，其他內容和排版保持原樣；一個地點一行，換天的地方空一行
function replaceItems(text, list) {
  const start = text.search(/"items"\s*:\s*\[/);
  const end = text.lastIndexOf(']');
  const lines = list.map((it) => `    { ${Object.entries(it).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`);
  if (start < 0 || end < start || !/^\s*}\s*$/.test(text.slice(end + 1))) {
    return JSON.stringify({ ...JSON.parse(text), items: list }, null, 2) + '\n';
  }
  // 換天的地方空一行，比較好找
  const body = lines.map((l, i) => (i && list[i].day !== list[i - 1].day ? `\n${l}` : l)).join(',\n');
  return `${text.slice(0, start)}"items": [\n${body}\n  ]${text.slice(end + 1)}`;
}
