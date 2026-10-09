# AGENTS.md

福岡旅行行程的手機網頁（PWA）。純靜態網站，沒有建置流程，部署在 GitHub Pages 的子路徑 `https://05131041.github.io/FUKUOKA/`。給人看的說明在 `README.md`。

## 分支與部署（個人 fork 的開發流程）

這個 repo 是 fork，先在個人 `dev` 開發，穩定後再同步回原作者。

- `origin`：個人 fork `Nigel-wei-zhe/FUKUOKA`；`upstream`：原作者 `05131041/FUKUOKA`
- **開發都在 `dev` 分支**。`main` 是舊的單檔版本，不在上面開發
- 個人 fork 的 GitHub Pages 來源是 `dev` 分支根目錄（Deploy from a branch，沒有 Actions workflow）。**push 到 `origin/dev` 就會自動部署**到 `https://nigel-wei-zhe.github.io/FUKUOKA/`，可當作預覽站
- **小功能先開功能分支**：從 `dev` 開 `feat-<名稱>`（不用 `/`），push 到 `origin` 後用 raw.githack 預覽，確認沒問題再合回 `dev`，避免 `dev` 頻繁部署、也讓多個功能互不覆蓋
  - 預覽網址（每次 push 完都要附給使用者，使用者常用手機看）：`https://raw.githack.com/Nigel-wei-zhe/FUKUOKA/<commit sha>/index.html`；用 commit sha 才不會吃到 githack 幾分鐘的快取，分支名稱的網址可當固定入口
  - 每個網址路徑的 Service Worker 是分開的；`index.html`、`trip.json` 網路優先會馬上更新，其他檔案改了照規則把 `sw.js` 的 `VERSION` 加 1
  - githack 只當個人預覽用，不要當正式網址分享
- 開發到差不多後，從 `dev` 對 `upstream` 開 PR 同步回原作者；開 PR 前先確認上游最新狀態，有衝突先在 `dev` 解掉
- README 與下方提到的網址 `05131041.github.io` 是原作者的正式站，不要改成個人 fork 的網址

## 檔案地圖

- `data/trip.json`：行程資料（旅程名稱、每天標題、所有地點）。格式規格是 `data/trip.schema.json`，以 schema 為準
- `data/info.json`：「資訊」分頁的內容（時差、退稅、入境規定、緊急聯絡）。規定類的內容要附官方來源連結，並更新 `updated`
- `index.html`：整個頁面，CSS、SVG 圖示 sprite、JS 都在裡面；啟動時用 fetch 讀 `data/trip.json`
- `sw.js`：Service Worker。`index.html`、`trip.json`、`info.json` 網路優先，其他同網域檔案快取優先，地圖圖磚另外快取
- `fonts/huninn-subset.woff2`：只收錄用到的字的粉圓體子集；`huninn-subset.chars.txt` 是它收錄的字元清單
- `tools/check-trip.mjs`：檢查 trip.json；`tools/subset-font.py`：重新產生字型子集
- `vendor/leaflet/`：Leaflet 1.9.4，不要改

## 常用指令

```sh
node tools/check-trip.mjs          # 改完 trip.json 一定要跑；有錯誤時結束代碼為 1
python3 -m http.server 8000        # 預覽：http://localhost:8000/（直接開 file:// 讀不到 JSON）
python3 tools/subset-font.py       # trip.json 或介面文字加了新字時執行（需要 pip install fonttools brotli）
```

## 規則

- **內容和設定放在 JSON，不要寫死在 `index.html`**：行程、資訊頁內容，以及跟這趟旅程有關的文字、數字、座標（城市名稱、天氣用的經緯度、時間說明、聯絡電話等）都放在 `data/*.json`，頁面只負責讀取和顯示，換一趟旅程只要換 JSON。新增 JSON 檔要加進 `sw.js` 的 `CORE_FILES` 和網路優先的清單，並在 README 說明欄位。按鈕名稱、錯誤訊息這類介面固定文字可以留在頁面裡
- **路徑一律用相對路徑**（`./data/trip.json`），不要用 `/` 開頭；網站在 `/FUKUOKA/` 子路徑底下
- **不要引用 CDN**。要離線可用，所有 JS、CSS、字型都放在 repo 裡；新增的檔案要加進 `sw.js` 的 `CORE_FILES`
- **改了 `index.html`、`trip.json` 以外的檔案**（字型、圖示、Leaflet、manifest），要把 `sw.js` 的 `VERSION` 加 1，否則已安裝的手機不會更新
- **顏色只用 CSS 變數**，而且 `:root` 和 `:root[data-theme="night"]` 兩套都要定義；不要寫死顏色
- **設定都放在同一個 sheet**（`<dialog id="settings">`：日夜模式、字的大小、加到主畫面），手機從下方分頁的「設定」打開，桌機從右上角按鈕打開。新的設定項目加在這裡，不要在頁面上另外放按鈕
- **字的大小可調**（標準／大／特大，`--fs` 為 1／1.18／1.36）。新的 `font-size` 一律寫成 `calc(14px * var(--fs))`，跟文字並排的固定寬度也要乘上 `--fs`
- **Sheet（`<dialog>`）一律用 `openSheet()`／`closeSheet()` 開關、`bindSheet()` 綁定**：打開時背景不能跟著捲動（不可滾動穿透），關閉後回到原本的捲動位置；高度跟著內容（不固定高度留白），要捲動的內容放進 `.sheet-scroll`。結構是 `.sheet-handle`（把手按鈕）＋ `.sheet-head` ＋內容：把手和標題列可以往下拉收起、往上拉滿版，點把手也能切換滿版；收起一律用滑下去的動畫（含 Esc）。新增 sheet 要在 iPhone 上實際滑滑看
- **用 innerHTML 插入資料前一定要經過 `esc()`**；行程資料可能含 `&`、`<` 等字元
- **分類**只有景點、美食、購物、交通四種（點心併在美食；舊資料的「甜點」由 `categoryAlias` 轉成美食）。每種分類有自己的卡片樣式 `.card--<kind>`。新增分類要一起改五個地方：`trip.schema.json` 的 enum、`index.html` 的 `categoryConfig`、兩套主題的 `--c-*` 顏色、對應的 SVG 圖示 symbol、`.card--<kind>` 樣式
- **擇一的選項**：同一天、同一 `time`、同一分類的地點由 `groupStops()` 排成可左右滑動的一組（`.choices`），資料上不需要額外欄位
- **trip.json 的地點 `id` 不要改**，蓋章紀錄（localStorage `trip:<旅程 id>:visited`）靠它對應
- 地圖底圖用 OpenStreetMap（`TILE_URL`）。CARTO 底圖現在需要 API key，沒有金鑰不要換回去

## 使用者：家族旅行，有年長者（構思新功能前先看這段）

這是全家一起用的行程網頁，使用者包含不常用手機 App 的長輩。新功能先問：**長輩第一次拿到，不用人教就會用嗎？在戶外、走路中、光線很亮時看得清楚嗎？**

閱讀
- **內文至少 `calc(15px * var(--fs))`**，長段說明用 16px、行高 1.6 以上；13px 以下只用在不影響理解的輔助文字（例如分類小標），不要拿來放重要資訊
- **一次只講一件事**：內容多時拆成分類（像資訊頁上方的分類按鈕），不要做成一長串；每段先寫結論，再寫細節
- **條列寫成「重點＋說明」**：重點幾個字就看得懂（「先辦退稅，再託運行李」），說明一兩句；數字、金額、時間寫清楚單位
- **用平常說話的詞**，少用英文縮寫和專有名詞；非用不可時附中文（「Visit Japan Web 線上辦理」）
- 文字和背景對比要夠（至少 4.5:1），白天、夜晚都要檢查；**不要只用顏色表達意思**，要搭配文字或圖示

操作
- **按鈕至少 44×44px**，主要按鈕 48px 以上，按鈕之間至少間隔 8px，避免按錯
- **新按鈕優先「圖示＋文字」**；純圖示只用在已經很熟悉的動作。行程卡片目前是純圖示按鈕，之後調整時可以重新評估
- **不要把手勢當成唯一的操作方式**（左右滑、長按、雙擊、捏合）；可以滑的內容要露出下一張，或另外有可以點的方式
- **重要的操作要能復原**（例如蓋章再按一次取消），少用確認對話框
- 分類、分頁切換用大的按鈕排成格狀，比橫向捲動的小標籤容易發現
- 電話號碼做成可以直接撥打的按鈕（`tel:`），地址和地點要能直接開地圖

## 不要做的事

- 沒被要求就不要改 `trip.json` 的行程內容，資料是行程作者的
- 不要加建置工具、框架或 npm 相依套件
- 不要恢復 `user-scalable=no`

## 改完怎麼驗證

1. `node tools/check-trip.mjs` 沒有錯誤
2. 用本機伺服器打開，在 360px 寬度下檢查白天、夜晚兩種模式（右上角切換），以及字級「特大」（右上角設定）
3. 切到地圖分頁、從行程卡片按「看地圖」，確認會定位到該地點
4. 開發者工具切到離線後重新整理，行程仍然正常顯示
5. 用「特大」字級從頭操作一次新功能：字有沒有被截掉、按鈕好不好按、會不會需要人教

## 寫作慣例

- 介面文字、README、commit 訊息都用台灣繁體中文
- 介面文字口吻簡短、直接，按鈕寫動作（「看地圖」「導航」），錯誤訊息要說清楚哪裡錯、怎麼修
- 不加操作說明文字（像「左右滑動看看」）；可以滑、可以點，要靠介面本身表現出來（露出下一張卡片、圓點指示）
