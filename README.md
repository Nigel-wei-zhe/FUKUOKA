# 福岡散步繪本

福岡八天行程的手機網頁：日系繪本風、可切換日夜模式，也能加到手機主畫面離線瀏覽（PWA）。

網址：https://05131041.github.io/FUKUOKA/

## 修改行程

行程都在 `data/trip.json`，頁面本身不用動。改完推上去就好，已經加到主畫面的手機下次連上網路打開時會自動拿到新版。

```json
{
  "$schema": "./trip.schema.json",
  "id": "fukuoka",
  "title": "福岡散步繪本",
  "subtitle": "八天的吃喝散步路線",
  "days": [
    { "day": 1, "name": "抵達福岡/博多" }
  ],
  "items": [
    { "id": "1", "day": 1, "time": "10:00", "title": "JR 博多 City", "category": "購物", "gmap": "https://...", "lat": 33.5901, "lng": 130.4206, "desc": "營業時間:10:00–20:00", "price": "" }
  ]
}
```

| 欄位 | 說明 |
|---|---|
| `id` | 這趟旅程的代號。「去過」的蓋章紀錄會依這個代號分開存 |
| `title`、`subtitle` | 封面的標題和副標 |
| `days` | 每天的標題；沒寫到的天數只會顯示 Day N |
| `items[].id` | 地點代號，不可重複 |
| `items[].category` | `景點`、`美食`（含點心、咖啡）、`購物`、`交通`（含住宿），每種分類的卡片樣式不同 |
| `items[].time` | 例如 `09:30`，可留空。同一天、同一時間、同一分類的地點會當成「擇一」的選項，排成可以左右滑動的一組（例如 12:00 有三間餐廳可選） |
| `items[].gmap` | Google 地圖連結；留空時會用經緯度導航 |
| `items[].desc` | 描述；裡面的「營業時間:」「最早可訂位時間：」會自動拆成獨立一行 |
| `items[].ja`、`items[].address` | 日文名稱和日文地址，指指卡「帶我回飯店」用大字給司機看；住宿一定要填 |
| `items[].tz` | 時間不是當地時間時填，例如從台灣起飛的班機填 `台灣時間`，會標在時間下方 |
| `startDate` | 第 1 天的日期，例如 `2026-11-21`。首頁依日期顯示那一天的天氣預報（出發前 16 天內才有），旅行期間打開會自動跳到今天 |
| `timeNote` | 行程時間的說明，例如「時間都是日本時間，比台灣快 1 小時」，顯示在行程清單和首頁上方 |
| `weather` | 首頁天氣看板：`timezone`（例如 `Asia/Tokyo`）、`default`（預設地點，`name`、`lat`、`lng`）、`climate`（往年這時候的平均氣候：`max`、`min`、`rain`，還沒有預報或讀不到天氣時顯示） |
| `days[].weather` | 這一天看哪裡的天氣（`name`、`lat`、`lng`），沒寫就用 `weather.default` |

JSON 的規則比較嚴格：要用雙引號，最後一筆後面不能有逗號。寫錯時頁面會直接顯示是第幾行出錯。

完整的欄位規格在 `data/trip.schema.json`。用 VS Code 編輯 `trip.json` 時會自動套用：輸入欄位名稱有自動完成，填錯會畫紅線。

改完可以先檢查一次（需要 Node.js，不用安裝套件）：

```sh
node tools/check-trip.mjs
```

它會檢查 JSON 語法、欄位格式、`id` 有沒有重複、天數標題，以及有沒有字型沒收錄的字，並指出是第幾行。

## 修改旅遊資訊

下方「資訊」分頁的內容（指指卡、退稅、帶回台灣、緊急聯絡）在 `data/info.json`，跟行程一樣改完推上去就好。

- `categories`：上方的分類按鈕，建議 4 個以內；每個分類有 `id`、`name`、`icon`、`sections`
- `sections`：分類底下的區塊，有 `title`、`points`，可加 `lead`（醒目的開頭說明）、`warn: true`（警告樣式）、`links`（官方連結或 `tel:` 電話）
- 分類加 `"layout": "tabs"` 時，上方列出各區塊的按鈕，一次只顯示一個（指指卡用）
- 指指卡：`phrases` 寫成 `[{ "zh": "請給我這個", "ja": "これをください。" }]`，點了會用全螢幕大字顯示日文、可以播放發音；`"type": "hotel"` 的區塊會自動列出行程裡的住宿（日文名稱和地址用 trip.json 住宿的 `ja`、`address`）
- `points`：每一條寫成 `{ "title": "重點", "text": "說明" }`，長輩比較好掃讀

規定會變，記得更新 `updated` 日期。

## 換成另一趟旅程

1. 換掉 `data/trip.json`，記得改 `id`，蓋章紀錄才不會跟舊旅程混在一起
2. 改 `manifest.webmanifest` 的 `name`、`short_name`（主畫面上的 App 名稱）
3. 想換主畫面圖示的話，換掉 `icons/` 裡的圖
4. 執行 `node tools/check-trip.mjs` 確認格式正確
5. 照下一段重新產生字型

## 新加的字顯示成系統字型

`fonts/huninn-subset.woff2` 只收錄目前用到的字（約 1000 字、189 KB），這樣才能整份存進手機離線使用。新加的字如果不在裡面，會自動改用手機的系統字型顯示，不會缺字。想讓新字也用粉圓體，在專案根目錄執行：

```sh
pip install fonttools brotli
python3 tools/subset-font.py
```

再把 `sw.js` 裡的 `VERSION` 加 1。

## 在自己電腦上預覽

頁面會用 `fetch` 讀取 `data/trip.json`，直接雙擊打開 `index.html` 會讀不到資料，要用本機伺服器開：

```sh
python3 -m http.server 8000
```

然後打開 http://localhost:8000/

## 檔案

| 檔案 | 用途 |
|---|---|
| `data/trip.json` | 行程資料 |
| `data/trip.schema.json` | 行程資料的格式規格 |
| `index.html` | 頁面 |
| `sw.js` | 離線快取（Service Worker）；改了字型、圖示等檔案時要把 `VERSION` 加 1 |
| `manifest.webmanifest` | 加到主畫面的名稱、圖示、顏色 |
| `icons/` | 主畫面圖示 |
| `fonts/` | jf open 粉圓（Huninn）子集，SIL Open Font License 1.1；`.chars.txt` 是收錄的字元清單 |
| `vendor/leaflet/` | Leaflet 1.9.4，BSD-2-Clause |
| `tools/check-trip.mjs` | 檢查 `trip.json` |
| `tools/subset-font.py` | 重新產生字型子集 |
| `AGENTS.md`、`CLAUDE.md` | 給 AI 程式助理看的專案說明 |
