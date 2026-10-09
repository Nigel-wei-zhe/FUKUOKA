#!/usr/bin/env node
// 檢查 data/trip.json：JSON 語法、格式（依 data/trip.schema.json）、id 重複、天數、字型收錄。
//
// 用法（在專案根目錄執行，不需要安裝套件）：
//   node tools/check-trip.mjs                 檢查 data/trip.json
//   node tools/check-trip.mjs 路徑/其他.json   檢查別的檔案
//
// 有錯誤時結束代碼為 1；只有提醒時為 0。

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] || resolve(ROOT, 'data/trip.json'));
const schema = JSON.parse(readFileSync(resolve(ROOT, 'data/trip.schema.json'), 'utf8'));
const charsFile = resolve(ROOT, 'fonts/huninn-subset.chars.txt');

const errors = [];
const warnings = [];
const label = process.argv[2] || relative(process.cwd(), target) || target;

// ---------- JSON 語法：找出第幾行出錯 ----------
function findJsonErrorPos(text) {
  let i = 0;
  const fail = () => { throw i; };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = () => {
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '"') { i++; return; }
      if (c === '\n') fail();
      i++;
    }
    fail();
  };
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 40));
    if (!m) fail();
    i += m[0].length;
  };
  const list = (close, item) => {
    i++;
    ws();
    if (text[i] === close) { i++; return; }
    for (;;) {
      item();
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === close) { i++; return; }
      fail();
    }
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') return list('}', () => { ws(); if (text[i] !== '"') fail(); str(); ws(); if (text[i] !== ':') fail(); i++; value(); });
    if (c === '[') return list(']', value);
    if (c === '"') return str();
    if (c === '-' || (c >= '0' && c <= '9')) return num();
    for (const w of ['true', 'false', 'null']) if (text.startsWith(w, i)) { i += w.length; return; }
    fail();
  };
  try {
    value();
    ws();
    return i < text.length ? i : -1;
  } catch (pos) {
    return typeof pos === 'number' ? pos : -1;
  }
}

function describeJsonError(text) {
  let pos = findJsonErrorPos(text);
  let hint = '常見原因：少了逗號或雙引號、最後一筆後面多了逗號、用了單引號。';
  if (pos < 0) return hint;
  let back = pos - 1;
  while (back >= 0 && ' \t\n\r'.includes(text[back])) back--;
  if ((text[pos] === ']' || text[pos] === '}') && text[back] === ',') {
    pos = back;
    hint = '這一行最後多了一個逗號，最後一筆後面不能有逗號。';
  } else if (text[pos] === "'") {
    hint = '這裡用了單引號，JSON 要用雙引號 "。';
  } else if (text[pos] === '{' || text[pos] === '"') {
    hint = '這裡前面可能少了一個逗號。';
  }
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  const raw = text.split('\n')[line - 1] || '';
  const from = Math.max(0, col - 70);
  const to = Math.min(raw.length, col + 40);
  const src = (from > 0 ? '…' : '') + raw.slice(from, to).trim() + (to < raw.length ? '…' : '');
  return `第 ${line} 行第 ${col} 個字附近：\n    ${src}\n  ${hint}`;
}

// ---------- 依 schema 檢查（只實作這份 schema 用到的規則） ----------
const TYPE_NAMES = { string: '文字', number: '數字', integer: '整數', object: '物件', array: '陣列', boolean: 'true/false' };

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function matchesType(type, value) {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeOf(value) === type;
}

function check(node, value, path, report) {
  if (node.$ref) node = schema.definitions[node.$ref.replace('#/definitions/', '')];
  if (node.type && !matchesType(node.type, value)) {
    report(path, `應該是${TYPE_NAMES[node.type] || node.type}，現在是 ${JSON.stringify(value)}`);
    return;
  }
  if (node.enum && !node.enum.includes(value)) {
    report(path, `只能填 ${node.enum.filter(Boolean).map((v) => `"${v}"`).join('、')}${node.enum.includes('') ? '，或留空' : ''}，現在是 ${JSON.stringify(value)}`);
  }
  if (node.minLength && typeof value === 'string' && value.length < node.minLength) report(path, '不能是空的');
  if (node.pattern && typeof value === 'string' && !new RegExp(node.pattern).test(value)) {
    report(path, `${node.patternErrorMessage || `格式不符（${node.pattern}）`}，現在是 ${JSON.stringify(value)}`);
  }
  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) report(path, `不能小於 ${node.minimum}，現在是 ${value}`);
    if (node.maximum !== undefined && value > node.maximum) report(path, `不能大於 ${node.maximum}，現在是 ${value}`);
  }
  if (typeOf(value) === 'object') {
    for (const key of node.required || []) {
      if (!(key in value)) report(path, `少了必填欄位 "${key}"`);
    }
    for (const [key, child] of Object.entries(value)) {
      const sub = node.properties && node.properties[key];
      if (sub) check(sub, child, path.concat(key), report);
      else if (node.additionalProperties === false) report(path, `有不認得的欄位 "${key}"，是不是拼錯了？`);
    }
  }
  if (Array.isArray(value) && node.items) {
    value.forEach((child, i) => check(node.items, child, path.concat(i), report));
  }
}

// ---------- 開始檢查 ----------
if (!existsSync(target)) {
  console.error(`✗ 找不到 ${label}`);
  process.exit(1);
}

const text = readFileSync(target, 'utf8').replace(/^﻿/, '');
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error(`✗ ${label} 的 JSON 格式有誤\n  ${describeJsonError(text)}`);
  process.exit(1);
}

// 找出每個地點在檔案裡的第幾行，錯誤訊息才能直接指過去
const lines = text.split('\n');
const itemsLine = lines.findIndex((l) => /^\s*"items"\s*:/.test(l));
function lineOfItem(item) {
  if (!item || item.id === undefined || itemsLine < 0) return null;
  const needle = new RegExp(`"id"\\s*:\\s*${JSON.stringify(item.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,}]`);
  const idx = lines.findIndex((l, n) => n > itemsLine && needle.test(l));
  return idx >= 0 ? idx + 1 : null;
}

function where(path) {
  if (path[0] === 'items' && typeof path[1] === 'number') {
    const item = data.items[path[1]];
    const line = lineOfItem(item);
    const name = item && item.title ? `「${item.title}」` : `第 ${path[1] + 1} 個地點${item && item.id !== undefined ? `（id ${item.id}）` : ''}`;
    const field = path.slice(2).join('.');
    return `${line ? `第 ${line} 行` : ''}${name}${field ? `的 ${field}` : ''}`;
  }
  if (path[0] === 'days' && typeof path[1] === 'number') {
    const field = path.slice(2).join('.');
    return `days 第 ${path[1] + 1} 筆${field ? ` 的 ${field}` : ''}`;
  }
  return path.length ? path.join('.') : '最外層';
}

check(schema, data, [], (path, msg) => errors.push(`${where(path)}：${msg}`));

const items = Array.isArray(data.items) ? data.items.filter((it) => it && typeof it === 'object') : [];
const days = Array.isArray(data.days) ? data.days.filter((d) => d && typeof d === 'object') : [];

// id 不可重複
const seen = new Map();
items.forEach((item) => {
  if (item.id === undefined) return;
  if (seen.has(item.id)) {
    errors.push(`地點 id "${item.id}" 重複了：「${seen.get(item.id).title}」和「${item.title}」，蓋章紀錄會互相影響`);
  } else {
    seen.set(item.id, item);
  }
});

// 天數
const dayCount = new Map();
days.forEach((d) => dayCount.set(d.day, (dayCount.get(d.day) || 0) + 1));
for (const [day, n] of dayCount) if (n > 1) errors.push(`days 裡 Day ${day} 寫了 ${n} 次`);
const itemDays = new Set(items.map((i) => i.day));
for (const day of [...itemDays].sort((a, b) => a - b)) {
  if (Number.isInteger(day) && !dayCount.has(day)) warnings.push(`Day ${day} 有地點，但 days 裡沒有它的標題，畫面上只會顯示 Day ${day}`);
}
for (const d of days) {
  if (!itemDays.has(d.day)) warnings.push(`days 裡有 Day ${d.day}「${d.name}」，但沒有任何地點`);
}

// 地圖與分類
items.forEach((item) => {
  const blank = (v) => v === undefined || v === null || v === '' || v === 0;
  if (blank(item.lat) || blank(item.lng)) warnings.push(`${where(['items', items.indexOf(item)])}：沒有經緯度，不會出現在地圖上`);
  if (item.category === '') warnings.push(`${where(['items', items.indexOf(item)])}：沒有分類，會當成景點`);
});

// 字型沒收錄的字
if (existsSync(charsFile)) {
  const covered = new Set(readFileSync(charsFile, 'utf8'));
  const missing = new Set();
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code > 0x7e && !/\s/.test(ch) && !covered.has(ch)) missing.add(ch);
  }
  if (missing.size) {
    warnings.push(`這些字不在目前的字型檔裡，會用系統字型顯示：${[...missing].join('')}\n    執行 python3 tools/subset-font.py 可以補進字型（粉圓體本身沒有的字除外），再把 sw.js 的 VERSION 加 1`);
  }
}

// ---------- 輸出 ----------
for (const e of errors) console.error(`✗ ${e}`);
for (const w of warnings) console.log(`⚠ ${w}`);

if (errors.length) {
  console.error(`\n${label}：${errors.length} 個錯誤、${warnings.length} 個提醒`);
  process.exit(1);
}
const dayTotal = new Set([...itemDays, ...dayCount.keys()]).size;
console.log(`${warnings.length ? '\n' : ''}✓ ${label} 格式正確：${dayTotal} 天、${items.length} 個地點${warnings.length ? `（${warnings.length} 個提醒）` : ''}`);
