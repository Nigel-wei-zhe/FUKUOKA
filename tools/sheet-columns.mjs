// 試算表「網站用」分頁的欄位，和 trip.json 地點欄位的對應。
// tools/trip-to-csv.mjs 和 tools/sheet-to-trip.mjs 共用，改欄位只改這裡。

export const COLUMNS = [
  { header: 'id', key: 'id' },
  { header: '天數', key: 'day' },
  { header: '時間', key: 'time' },
  { header: '時區', key: 'tz' },
  { header: '分類', key: 'category' },
  { header: '名稱', key: 'title' },
  { header: '說明', key: 'text' },
  { header: '營業時間', key: 'hours' },
  { header: '訂位', key: 'booking' },
  { header: '價位', key: 'price' },
  { header: 'Google 地圖連結', key: 'gmap' },
  { header: '緯度', key: 'lat' },
  { header: '經度', key: 'lng' },
  { header: '日文名稱', key: 'ja' },
  { header: '日文地址', key: 'address' }
];

// 說明、營業時間、訂位在 trip.json 裡合在 desc 一個欄位，頁面再拆開顯示（index.html 的 parseDesc）
const BOOKING = /最早可訂位時間\s*[:：]/;
const HOURS = /營業時間\s*[:：]/;

export function splitDesc(desc) {
  let text = desc || '';
  let booking = '';
  let hours = '';
  const b = text.search(BOOKING);
  if (b > -1) {
    booking = text.slice(b).replace(/^最早可訂位時間\s*[:：]\s*/, '').trim();
    text = text.slice(0, b);
  }
  const h = text.search(HOURS);
  if (h > -1) {
    hours = text.slice(h).replace(/^營業時間\s*[:：]\s*/, '').trim();
    text = text.slice(0, h);
  }
  return { text: text.trim(), hours, booking };
}

export function joinDesc({ text, hours, booking }) {
  return [text, hours && `營業時間:${hours}`, booking && `最早可訂位時間：${booking}`]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ');
}

// ---------- CSV ----------
export function toCSV(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// 支援引號裡的逗號、換行、兩個雙引號（Google 試算表匯出的 CSV 就是這種格式）
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
