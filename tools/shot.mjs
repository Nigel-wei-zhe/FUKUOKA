#!/usr/bin/env node
// 用無頭 Chrome 截手機畫面（360px 寬），改完畫面時用來確認。不需要安裝套件。
// 多個字級／主題用逗號隔開，會並排在同一張圖，一次比較。
//
// 用法（在專案根目錄執行）：
//   node tools/shot.mjs 行程 --day 2 --fs 標準,特大 --theme 白天,夜晚
//   node tools/shot.mjs 資訊 --info 退稅
//   node tools/shot.mjs 首頁 --open 設定
//   node tools/shot.mjs 行程 --open 地點:89          打開 id 89 的詳細頁
//   node tools/shot.mjs 行程 --scroll 600 --height 800
//   node tools/shot.mjs 首頁 --eval "document.querySelector('.mascot').click()"
//
// 頁面：首頁、行程、地圖、資訊（或 home、list、map、info）
// --day      行程頁選第幾天，或「行前」
// --info     資訊頁的分類名稱（例如 指指卡、退稅）
// --open     設定，或「地點:<id>」打開地點詳細頁
// --scroll   頁面往下捲幾 px
// --eval     截圖前在頁面裡執行的 JS
// --fs       標準、大、特大（預設 標準）
// --theme    白天、夜晚（預設 白天）
// --width    預設 360；--height 預設 640
// --motion   保留動畫（預設關掉，無頭 Chrome 的動畫會停在半途）
// --out      圖片存放位置（預設系統暫存資料夾），完成後印出路徑
// 找不到 Chrome 時，用環境變數 CHROME 指定路徑。

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, extname, join, resolve, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = { 首頁: 'home', 行程: 'list', 地圖: 'map', 資訊: 'info', home: 'home', list: 'list', map: 'map', info: 'info' };
const FS = { 標準: 'm', 大: 'l', 特大: 'xl', m: 'm', l: 'l', xl: 'xl' };
const THEMES = { 白天: 'day', 夜晚: 'night', day: 'day', night: 'night' };

// ---------- 參數 ----------
const opts = { view: 'home', fs: '標準', theme: '白天', width: 360, height: 640 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--motion') opts.motion = true;
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else opts.view = a;
}
const view = VIEWS[opts.view];
if (!view) fail(`看不懂頁面「${opts.view}」，可以用：首頁、行程、地圖、資訊`);
const variants = [];
for (const f of String(opts.fs).split(',')) {
  for (const t of String(opts.theme).split(',')) {
    if (!FS[f]) fail(`看不懂字級「${f}」，可以用：標準、大、特大`);
    if (!THEMES[t]) fail(`看不懂主題「${t}」，可以用：白天、夜晚`);
    variants.push({ label: `${f}・${t}`, fs: FS[f], theme: THEMES[t] });
  }
}
const width = Number(opts.width);
const height = Number(opts.height);

const chrome = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].find(existsSync);
if (!chrome) fail('找不到 Chrome，請用環境變數 CHROME 指定路徑');

// ---------- 截圖用的頁面：每個組合一個 iframe，並排 ----------
// 先寫好 localStorage 再載入 iframe，網頁一開始就是指定的主題和字級
const actions = {
  view,
  day: opts.day ? (opts.day === '行前' ? 'prep' : String(opts.day)) : '',
  info: opts.info || '',
  open: opts.open || '',
  scroll: Number(opts.scroll) || 0,
  eval: opts.eval || ''
};
const harness = `<!doctype html><meta charset="utf-8">
<style>body{margin:0;display:flex;gap:16px;padding:8px;background:#888;font:14px sans-serif}
figure{margin:0}figcaption{color:#fff;padding:0 0 4px}iframe{border:0;display:block;background:#fff}</style>
<body><script>
const V = ${JSON.stringify(variants)};
const A = ${JSON.stringify(actions)};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(v, i) {
  localStorage.setItem('fukuoka:theme', v.theme);
  localStorage.setItem('trip:font-size', v.fs);
  const fig = document.createElement('figure');
  fig.innerHTML = '<figcaption></figcaption><iframe width="${width}" height="${height}"></iframe>';
  fig.firstChild.textContent = v.label;
  document.body.append(fig);
  const f = fig.lastChild;
  await new Promise((r) => { f.onload = r; f.src = './index.html?shot=' + i; });
  const w = f.contentWindow, d = w.document;
  // 等元素出現再點（資訊頁等切過去才產生內容）；找不到就寫在圖片標題上
  const click = async (find, what) => {
    let el = null;
    for (let t = 0; t < 30 && !(el = find()); t++) await sleep(100);
    if (el) el.click(); else fig.firstChild.textContent += '（找不到' + what + '）';
  };
  for (let t = 0; t < 50 && !d.querySelector('#day-tabs button'); t++) await sleep(100);
  w.setView(A.view);
  if (A.day) await click(() => d.querySelector('#day-tabs [data-day="' + A.day + '"]'), '天數 ' + A.day);
  if (A.info) await click(() => [...d.querySelectorAll('.info-cat')].find((b) => b.textContent.trim() === A.info), '分類 ' + A.info);
  await sleep(300);
  if (A.scroll) w.scrollTo(0, A.scroll);
  if (A.open === '設定') await click(() => [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === '設定' && b.offsetParent), '設定按鈕');
  else if (A.open.startsWith('地點:')) w.showDetailModal(A.open.slice(3));
  if (A.eval) { try { new w.Function(A.eval)(); } catch (e) { fig.firstChild.textContent += '（eval 錯誤：' + e.message + '）'; } }
}
(async () => { for (let i = 0; i < V.length; i++) await run(V[i], i); })();
</script>`;

// ---------- 本機伺服器 ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__shot.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(harness);
  }
  // 不註冊 Service Worker，每次都讀最新的檔案
  if (path === '/sw.js') { res.writeHead(404); return res.end(); }
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---------- 截圖 ----------
const out = resolve(opts.out || join(tmpdir(), 'fukuoka-shots', `${Date.now()}.png`));
await mkdir(dirname(out), { recursive: true });
const args = [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${join(tmpdir(), `fukuoka-shot-chrome-${port}`)}`,
  `--window-size=${variants.length * (width + 16) + 8},${height + 40}`,
  `--virtual-time-budget=${4000 + variants.length * 2500}`,
  `--screenshot=${out}`,
  `http://127.0.0.1:${port}/__shot.html`
];
if (!opts.motion) args.unshift('--force-prefers-reduced-motion');
const code = await new Promise((r) => {
  const p = spawn(chrome, args, { stdio: 'ignore' });
  const timer = setTimeout(() => p.kill(), 60000);
  p.on('exit', (c) => { clearTimeout(timer); r(c); });
});
server.close();
if (code !== 0 || !existsSync(out)) fail(`Chrome 截圖失敗（結束代碼 ${code}）`);
console.log(out);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
