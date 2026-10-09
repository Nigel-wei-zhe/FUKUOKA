# 福岡散步繪本

福岡八天行程的手機網頁：日系繪本風、可切換日夜模式，也能加到手機主畫面離線瀏覽（PWA）。

網址：https://05131041.github.io/FUKUOKA/

## 修改行程

打開 `index.html`，行程資料在 `itineraryItems`（格式和原本一樣），每天的標題在下方的 `days`。存檔推上去就好，已經加到主畫面的手機下次連上網路打開時會自動拿到新版。

## 新增行程後出現沒收錄的字

`fonts/huninn-subset.woff2` 只收錄目前頁面用到的字（約 1000 字、185 KB），這樣才能整份存進手機離線使用。新加的字如果不在裡面，會自動改用手機的系統字型顯示，不會缺字。想讓新字也用粉圓體，在專案根目錄執行：

```sh
pip install fonttools brotli
python3 tools/subset-font.py
```

再把 `sw.js` 裡的 `VERSION` 加 1。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面與行程資料 |
| `sw.js` | 離線快取（Service Worker）；改了字型、圖示等檔案時要把 `VERSION` 加 1 |
| `manifest.webmanifest` | 加到主畫面的名稱、圖示、顏色 |
| `icons/` | 主畫面圖示 |
| `fonts/` | jf open 粉圓（Huninn）子集，SIL Open Font License 1.1 |
| `vendor/leaflet/` | Leaflet 1.9.4，BSD-2-Clause |
| `tools/subset-font.py` | 重新產生字型子集 |
