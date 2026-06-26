# 04 LP SPEC — LP 23 段渲染規格 + 互動模型

> **本章角色**：定義 rebuild 後的公開 LP（study-abroad 互動比較頁）的「完整 23 段渲染規格」+「sec07 即時試算互動模型」+「demo-mode advisor-only 機制」+「template-slot / renderSec 契約」+「固定 render 順序」+「4 個尚缺 table 的新 schema」。
>
> **來源（已 code-grounded 驗證）**：
> - LP 設計 source：`/Users/jojowu/fanyang-consult/fanyang-consult.html`（5257 行，24 個 `<section>` tag、24 個 `renderSecXX` function）
> - 既有結構 spec：`/Users/jojowu/FY-school-cms/design/PAGE_STRUCTURE.md`（23 段順序權威清單）
> - 目前已 port 的 template：`/Users/jojowu/FY-school-cms/supabase/templates/comparison_scroll.html`（只挖了 10 個 slot）
> - 目前 EF renderer：`/Users/jojowu/FY-school-cms/supabase/functions/generate-page/index.ts`（只 port 10 個 renderSec + 已有 `tuitionJson` / `housingJson` data island 雛形）
>
> **REBUILD STANCE**：保留 LP design（23 段、節奏、advisor-only 機制、sec07 互動），但 rebuild 後一次把 **23 段全部 port**、把 **sec07 即時試算接回真資料**、把 **URL state → 報價單**串通。LP 是 Worker 服務的 **static cached HTML**，runtime 無 DB → 所有互動資料必須在 **generate 時由 EF 烤進 JSON data island**。

---

## TL;DR（先看這段）

1. **LP = 23 個 section**，固定 render 順序由 `renderAll()` 鎖死（不是按 ID 數字序，sec08 插在 sec05 前）。
2. **目前只 port 了 10 段**（sec01/02/03/04/sec_photos/sec08/sec07/sec09/sec_voices/sec_faq）。**還缺 13 段**。
3. **sec07（學費試算）是唯一真互動段**：LP source 有 course/accomm/weeks 三個 dropdown + client-side 即時 recompute；目前 EF 把它**簡化成固定 12 週靜態卡**（互動被砍掉）。Rebuild 要還原成「EF 烤 per-school JSON data island → client vanilla JS 即時 recompute → 選擇寫入 URL → URL 餵報價單」。
4. **5 個情感 anchor**（sec01/sec04/sec08/sec11/sec13）用 120px padding，其餘 96px。**render 順序與情感 anchor 位置必須在 rebuild 時鎖死**，後續加段不能 reshuffle anchor。
5. **2 個 advisor-only 段**（sec_photos / sec_return）+ 散落的 `.advisor-only` chrome，由 `body.demo-mode` class 控制顯隱。
6. **4 段需要 NEW table**：`sec_area` / `sec_flight` / `sec_climate` / `sec_spend`（目前 schema 完全沒對應，本章提 JSONB 形狀）。

---

## 1. 完整 23 段渲染規格表（權威順序）

> 順序來源：LP source `renderAll()`（line 3442-3470）。下表「render 序」= 實際 render_order，與 section ID 數字序**不一致**（這是刻意的節奏設計，不是 bug，但 rebuild 要把序鎖死）。
>
> 欄位說明：
> - **驅動**：`static`=寫死文案（與選校無關）/ `data`=完全由選校資料驅動 / `mixed`=骨架 static + per-school 片段 data。
> - **資料來源**：rebuild 後該段讀的 table.field（`campuses`/`programs`/`tuition_tiers`/`housing`/`city_info` = 現有六表；`area`/`flight`/`climate`/`spend` = 本章新增四表）。
> - **情感 anchor**：✅ = 120px 大呼吸段，順序位置鎖死。
> - **advisor-only**：✅ = demo-mode 隱藏。
> - **已 port**：✅ = 目前 EF 已實作；⬜ = rebuild 待補。

| render 序 | Section ID | 名稱 / 用途 | 驅動 | 資料來源（rebuild 後 table.field） | 情感 anchor | advisor-only | 已 port |
|:--:|:--|:--|:--:|:--|:--:|:--:|:--:|
| 1 | `sec01` | Hero 開場（依選校數動態 headline）| mixed | `campuses.city_name`, `.flag`, `.country`（N 校決定 headline 變體）| ✅ 120px | | ✅ |
| 2 | `sec02` | ABCD 卡片並排（決策/費用/氛圍/資訊 4 變體）| data | `campuses` + `programs`(週費起) + `personas` JSONB + `tuition_tiers`(courseFrom) | | | ✅ |
| 3 | `sec03` | 城市並排比較表（age/容量/班級/週費）| data | `campuses.*`, `programs`, `tuition_tiers` | | | ✅ |
| 4 | `sec04` | 詩意 quote 一 / 情感橋接 | mixed | static 文案 + `campuses.mood_*`（per-school 場景句）| ✅ 120px | | ✅ |
| 5 | `sec_photos` | 相片牆（masonry） | data | `campus_photos`（advisor 上傳的 storage URL）| | ✅ | ✅ |
| 6 | `sec_area` | 校區周邊（步行圈 + 週末去哪 + 實景）| data | **`area`（新表）**`.walk[]`, `.nearby[]`, `.map_note` | | 右欄 ✅ | ⬜ |
| 7 | `sec_flight` | 航班資訊（台灣→當地）| data | **`flight`（新表）**`.from/to/duration/type/carriers[]/tip/airport_to_school` | | | ⬜ |
| 8 | `sec_climate` | 氣候曲線 + 最佳出發月 | data | **`climate`（新表）**`.months[]`, `.best[]`, `.avoid[]`, `.*_reason`, `.note` | | | ⬜ |
| 9 | `sec_spend` | 在地日常消費感受 | data | **`spend`（新表）**`.items[]`, `.monthly_total`, `.monthly_twd`, `.saving_tip` | | | ⬜ |
| 10 | `sec08` | 在當地的一天（時間軸）| mixed | static 時間軸骨架 + `campuses.day_schedule` JSONB | ✅ 120px | | ✅ |
| 11 | `sec05` | 課程方案清單 | data | `programs.*` + `tuition_tiers`(週費) | | | ⬜ |
| 12 | （stat-break）| 課程週費範圍 stat 帶（非 section）| data | `tuition_tiers`(courseRange) | | | ⬜ |
| 13 | `sec06` | 住宿類型清單 | data | `housing.*` | | | ⬜ |
| 14 | （section-break）| 詩意 quote 暗底帶（非 section，固定文案）| static | — | | | ⬜ |
| 15 | `sec07` | **學費即時試算（互動核心）** | data | `tuition_tiers`(course/週費) + `housing`(accomm/週費) + FX/living 常數 → **JSON data island** | | | ✅（被砍成靜態）|
| 16 | `sec_costfull` | 全費用並排總表（含機票/簽證 TWD 區間）| data | `tuition_tiers` + `housing` + **`flight`(機票區間)** + cost_extras 常數 | | | ⬜ |
| 17 | `sec_voices` | 學員見證 + 國籍組成 | data | `campuses.testimonials` JSONB + `.nationality_breakdown` JSONB | | | ✅ |
| 18 | `sec09` | 適合誰（persona match）| data | `schools.suitable_for[]` + `campuses.personas` | | | ✅ |
| 19 | `sec10` | 校區性格（像不像你）| data | `campuses.personas_detail` JSONB | | | ⬜ |
| 20 | `sec11` | CEFR 等級說明（教育語氣）| static | 寫死 CEFR A1-C2 表 | ✅ 120px | | ⬜ |
| 21 | `sec_safety` | 退費彈性 + 校方保險（信任）| mixed | static 框架 + `schools.refund_policy` / `.insurance` | | | ⬜ |
| 22 | `sec_return` | 回國銜接 ROI | static | 寫死服務框架（待業主真資料）| | ✅ | ⬜ |
| 23 | `sec_faq` | FAQ（通用 + 校級兩層）| data | static 通用題 + `campuses.faq` JSONB（校級覆蓋）| | | ✅ |
| 24 | `sec12` | 流程 CTA（放洋陪你走）| static | 寫死 4 階段流程 | | | ⬜ |
| 25 | `sec13` | 情感收尾 | static | 寫死文案 | ✅ 120px | | ⬜ |

> **注意**：render 序有 25 列，但「正式 section」= 23（`<section>` tag），另外 2 列（stat-break、section-break）是 LP source 內穿插的非 section 過渡帶（`<div class="stat-break">` / `<div class="section-break">`），rebuild 時當作 sec05↔sec06 與 sec06↔sec07 之間的固定 spacer 處理，不算進 23。
>
> **已 port 統計**：10 段已 port（render 序 1,2,3,4,5,10,15,17,18,23）。**待補 13 段**：sec05, sec06, sec07-互動還原, sec_area, sec_flight, sec_climate, sec_spend, sec_costfull, sec10, sec11, sec_safety, sec_return, sec12, sec13（其中 sec07 雖列入「已 port」但只是靜態殼，互動部分算待補）。

### 1.1 情感 anchor 的固定位置（不可 reshuffle）

5 個情感 anchor 在 render 序的位置：**1, 4, 10, 22(sec11), 25(sec13)**。對應「每隔 4-5 個資訊段出現一次」的 cognitive break 設計。

```
render序  1   2   3   4   5   6   7   8   9   10  11  13  15  16  17  18  19  20  21  22  23  24  25
section  s01 s02 s03 s04 sph sar sfl scl ssp s08 s05 s06 s07 scf svc s09 s10 s11 ssf sret sfaq s12 s13
type     情  主  理  情  限  資  資  資  資  情  資  資  互  表  社  決  決  教  信  限  資  CTA 情
pad      120 96  96  120 96  96  96  96  96  120 96  96  96  96  96  96  96  120 96  96  96  96  120
anchor   ★               ★                   ★                          ★              ★
```

**Rebuild 鐵律**：render 順序與 5 個 anchor 的相對位置是**設計合約**。新增 section 一律 append 到對應「資訊塊尾端」或用顯式 `render_order` int 插入，**絕不重排既有段的 anchor 位置**（見 §5 的 RENDER_ORDER 凍結機制）。

---

## 2. sec07 互動模型（學費即時試算 — rebuild 重點）

### 2.1 問題：Worker runtime 無 DB

公開 LP 由 Cloudflare Worker 服務 **static cached HTML**，runtime **沒有 DB 連線**。但 sec07 需要：使用者改 course/accomm/週數 → 即時重算總價。

→ **唯一可行解**：generate 時（EF 用 service_role 讀 DB），把每個校區的**完整可選項 + 單價**烤成一個 JSON data island 塞進 HTML，client 端純 vanilla JS 讀 island 做 recompute（**零 fetch、零 DB**）。

> 目前 EF 已有雛形：`index.ts` line 1041-1050 已經在烤 `tuitionJson`（avg price + housing_min）+ `housingJson`（options[]）。但目前是「平均/最低」簡化版，**沒有完整 tier 清單、沒有接到 sec07 dropdown、client recompute 被砍掉**。Rebuild 要把這個 island 擴成完整 grain 並接回互動。

### 2.2 LP source 原始互動行為（要還原的目標）

來自 `renderSec07()`（LP line 4659-4899）+ `Sec07State` + `updateCalcCard()`：

- **三個輸入**：
  1. `週數`（全校區同步，single select）：選項 `[1,2,3,4,6,8,10,12,16,20,24]`，預設 4。
  2. `課程方案`（per-school dropdown）：列出該校所有 course，無週費的標 disabled「依堂/課程計費，請另行報價」。
  3. `住宿類型`（per-school dropdown）：列出該校所有 accomm，無週費的標 disabled「請洽詢報價」。
- **即時計算**（`updateCalcCard`）：
  - 課程小計 = `courseWeeklyPrice × weeks`
  - 住宿小計 = `accommWeeklyPrice × weeks`
  - 小計 = 課程 + 住宿
  - 台幣 = `小計 × FX_RATE[cur]`（rate 表 `{£:40,€:35,USD:32,CA$:23,AU$:21}`）
  - 生活費 = `(monthlyLiving[cur] / 4.33) × weeks`（living 表 `{£:800,€:700,USD:750,CA$:900,AU$:1100}` 月）
  - 含生活費總估算 = `(小計 + 生活費) × FX_RATE`
- **匯出列**：複製明細（純文字）/ 複製連結（URL state）/ 列印。
- **per-school state**：`Sec07State.picks[campusKey] = {course: idx, accomm: idx}`，週數共用 `Sec07State.weeks`。

### 2.3 Data island 規格（EF generate 時烤入）

EF 在 template 內注入一個 `<script type="application/json">`，**禁用可執行 script、禁 `window.X =` 全域污染**（用 `type="application/json"` 讓 CSP 友善、且 parse 安全）：

```html
<script id="LP_DATA" type="application/json">
{
  "version": "lp_data_v1",
  "fx": { "GBP": 40, "EUR": 35, "USD": 32, "CAD": 23, "AUD": 21 },
  "livingMonthly": { "GBP": 800, "EUR": 700, "USD": 750, "CAD": 900, "AUD": 1100 },
  "weekOptions": [1,2,3,4,6,8,10,12,16,20,24],
  "defaultWeeks": 4,
  "schools": [
    {
      "campusKey": "ILAC-TORONTO",
      "name": "ILAC Toronto",
      "flag": "🇨🇦",
      "currency": "CAD",
      "courses": [
        { "sku": "ILAC-TORONTO-GE-01w-CAD", "label": "General English（晨間）", "pricePerWeek": 380, "billable": true },
        { "sku": "ILAC-TORONTO-IELTS-01w-CAD", "label": "IELTS 班", "pricePerWeek": 410, "billable": true },
        { "sku": "ILAC-TORONTO-PRIV-00w-CAD", "label": "一對一（依堂計費）", "pricePerWeek": 0, "billable": false }
      ],
      "housing": [
        { "id": "h_homestay_single", "label": "寄宿家庭（單人房・含早晚餐）", "pricePerWeek": 320, "billable": true },
        { "id": "h_residence", "label": "學生宿舍", "pricePerWeek": 290, "billable": true }
      ]
    }
  ]
}
</script>
```

**island 設計鐵律**：
- **每個 course item 帶 stable `sku`**（= `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`，見 02 SKU 章）。這是 island ↔ 報價單對接的唯一鍵；client 選了哪個 course，URL 寫的就是 sku，報價單照 sku 回查 `tuition_tiers`。
- **`billable:false`** 取代原本的「parse 出 0 就 disabled」hack：rebuild 後由 `tuition_tiers.is_quotable` boolean 明確標記，不再靠字串 parse（移除 `parsePricePerWeekFromCourse` 這種 fragile 解析）。
- **`currency` 用 ISO code**（GBP/EUR/USD/CAD/AUD）而非符號（`£`/`€`），符號只在 render 時查表轉。
- island 只放「LP 要顯示的最小欄位」，**不放成本、不放 advisor note、不放任何 RLS 敏感欄**（island 是公開可讀的）。

### 2.4 Client recompute（vanilla JS，零依賴）

LP 內嵌一支 `<script>`（非 module、相容 Worker 靜態服務），開機流程：

```
1. JSON.parse(document.getElementById('LP_DATA').textContent) → DATA
2. 讀 URL state（見 2.5）覆蓋預設 picks / weeks
3. 對每個 school 渲染 course/accomm dropdown（disabled = !billable）
4. recompute(school) → 寫 breakdown DOM
5. 綁 onchange：dropdown 改 → 更新 picks → recompute → syncUrl()
6. 週數改 → 更新共用 weeks → 全 school recompute → syncUrl()
```

recompute 公式與 §2.2 完全一致（FX/living 從 island 讀，不再 hardcode 在 JS）。

### 2.5 URL state（選擇持久化 + 餵報價單）

LP source 已用 `URLSearchParams` 做了 `campuses` / `style` / `weeks`（`copyCalcLink()` line 4775-4782，`boot()` 讀回 line 3214-3225）。Rebuild **擴成完整 selection state**：

| query param | 意義 | 範例 |
|:--|:--|:--|
| `campuses` | 顯示哪些校區（csv of campusKey）| `ILAC-TORONTO,EC-LONDON` |
| `style` | sec02 卡片變體 A/B/C/D | `B` |
| `weeks` | 全域週數 | `12` |
| `pick` | **per-school 選擇（sku + housing id）** | `ILAC-TORONTO:ILAC-TORONTO-GE-01w-CAD:h_residence;EC-LONDON:...` |
| `demo` | advisor 檢視旗標（見 §3）| `0` / `1` |

- **持久化**：每次 dropdown/週數變更 → `history.replaceState`（不堆 history entry）把當前 picks 寫回 URL。複製連結 = 複製當前 URL（取代原本只塞 3 param 的 `copyCalcLink`）。
- **URL → 報價單**：advisor 在 LP demo 完點「產生報價單」，CMS 後台讀同一組 URL state：`campuses` + `pick`（含 sku）→ 回查 `tuition_tiers`（照 sku 取單價 + 該 tier 的成本層）→ 餵 `quotation/calculate.ts`（純 6 層 pricing fn，現有 19 passing tests）。**LP 顯示價（含生活費估算、僅課程+住宿）與報價單最終價是兩套**：LP 是「給學生看的估算」，報價單是「6 層精算」；URL 只傳「選了哪個 sku/週數」這個**意圖**，金額一律在報價端重算（不信任 client 傳的數字）。

### 2.6 sec07 互動模型圖

```
┌─ generate time (EF, service_role, has DB) ──────────────────┐
│  tuition_tiers + housing  ──►  build LP_DATA island         │
│  (每 course 帶 sku + is_quotable)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │  烤進 static HTML
                           ▼
┌─ runtime (Cloudflare Worker, NO DB) ────────────────────────┐
│  serve cached HTML（含 LP_DATA island）                      │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─ client (browser, vanilla JS) ──────────────────────────────┐
│  JSON.parse(LP_DATA) → dropdown → recompute → 顯示估算       │
│  每次變更 → replaceState 寫 URL (campuses/weeks/pick/sku)    │
└──────────────────────────┬──────────────────────────────────┘
                           │  advisor 複製 URL / 點「產生報價」
                           ▼
┌─ quote (CMS backend, authenticated) ────────────────────────┐
│  讀 URL.pick(sku) → 回查 tuition_tiers → calculate.ts 6 層  │
│  → Nexus-safe snapshot（copy values, vendor string）        │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. demo-mode advisor-only toggle

> source：LP CSS line 148-151、`<body class="demo-mode">` line 1794、`demoToggle.onchange` line 3324-3325；spec：PAGE_STRUCTURE.md §「advisor-only chrome」。

### 3.1 機制

```css
body.demo-mode .advisor-only { display: none !important; }   /* 學生視角：藏顧問 chrome */
body:not(.demo-mode) .demo-only { display: none !important; } /* 顧問視角：藏「示範文案」提示 */
body.demo-mode .area-layout { grid-template-columns: 1fr; }   /* 學生視角：sec_area 收掉右側實景欄 */
```

```html
<body class="demo-mode">  <!-- 預設 = 學生乾淨視角 -->
```

```js
// 顧問勾 #demoToggle → 移除 demo-mode → 露出 advisor-only chrome
demoToggle.onchange = e => document.body.classList.toggle('demo-mode', !e.target.checked);
```

**反直覺但要記住**：`demo-mode` = **學生視角**（預設掛上）。顧問勾 toggle 後**移除** class，才看到顧問專屬內容。

### 3.2 被 demo-mode 隱藏的 advisor-only 內容清單

| 類型 | 內容 | source |
|:--|:--|:--|
| 整條工具列 | `#advisor-bar`（ABCD 切換 / 卡片表格切換 / 諮詢進度 / toggle 本身）| line 1797-1834 |
| 整段 section | `sec_photos`（相片牆）、`sec_return`（回國 ROI）| line 1841, 1872 |
| 段內子塊 | `sec_area` 右側「校區實景」欄（`.area-right.advisor-only`）| line 4009 |
| 待補提示 | 散落的 `.advisor-only.data-pending-note`（「⚠️ 待 EP 提供…」）| line 3814, 4403, 4462, 4630, 5091 |

### 3.3 Rebuild 對 demo-mode 的決策

- **保留機制**（PAGE_STRUCTURE PS3 待 jojo 拍板，但本 spec 預設保留：advisor demo 流程是產品核心）。
- **URL `demo` param**：rebuild 加 `?demo=1` 讓 advisor 直接以顧問視角開連結（QA / 內部 review 用）；學生分享連結一律 `demo=0` 或不帶（fallback demo-mode）。
- **print stylesheet**（LP line 1361-1365）目前把 advisor-only 全隱藏 → rebuild 確認：advisor 列印給學生帶回家 = 學生視角，**保留隱藏**正確（LV-8 已驗證）。

---

## 4. 4 個尚缺 table 的新 schema（area / flight / climate / spend）

> 這 4 段（render 序 6-9）目前 schema **完全沒對應**，LP source 把資料寫死在 `CAMPUS_DATA[k].area/.flight/.climate/.spend`。Rebuild 要落地成 DB。
>
> **設計原則**：這 4 段都是 **per-campus 單筆、結構固定、唯讀展示、不涉成本/RLS 敏感**。→ **一律用「per-campus 一張表 + JSONB 欄位」**（不為每個 walk item 開 row，避免過度正規化；展示資料整塊讀整塊烤）。所有表 **RLS policy `TO authenticated`**（advisor 編輯）+ EF service_role 讀（bypass）。

### 4.1 `campus_area`（sec_area — 校區周邊）

source 形狀（LP line 2360-2374）：`{ walk:[{icon,label,dist,desc}], nearby:[{name,dist,why}], mapNote }`

```sql
CREATE TABLE campus_area (
  campus_id   uuid PRIMARY KEY REFERENCES campuses(id) ON DELETE CASCADE,
  walk        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{icon,label,dist,desc}] 校門出去怎麼走
  nearby      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name,dist,why}] 週末可以去哪裡
  map_note    text,                                 -- 一句生活圈總結
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE campus_area ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_area_rw ON campus_area TO authenticated USING (true) WITH CHECK (true);
```
- `walk[].icon` / `nearby` 純展示，emoji 或 icon name。
- 右側「校區實景」照片 = 走 `campus_photos`（不在本表）。

### 4.2 `campus_flight`（sec_flight — 航班資訊）

source 形狀（LP line 2936-2967）：`{ from,to,duration,type,carriers:[],tip,airport_to_school }` + 機票 TWD 區間在 `COST_EXTRAS.flight[k]=[lo,hi]`（line 3049-3054，sec_costfull 用）。

```sql
CREATE TABLE campus_flight (
  campus_id          uuid PRIMARY KEY REFERENCES campuses(id) ON DELETE CASCADE,
  from_label         text NOT NULL,        -- '台灣桃園（TPE）'
  to_label           text NOT NULL,        -- '多倫多皮爾遜（YYZ）'
  duration           text,                 -- '約 15–18 小時'
  transfer_type      text,                 -- '通常需轉機（東岸較遠）'
  carriers           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ['中華航空（洛杉磯轉）', ...]
  tip                text,                 -- 訂票小提醒
  airport_to_school  text,                 -- '皮爾遜機場 → 市中心：UP Express 約 25 分鐘'
  price_twd_low      integer,              -- 機票來回淡季（給 sec_costfull）
  price_twd_high     integer,              -- 機票來回旺季
  updated_at         timestamptz DEFAULT now()
);
ALTER TABLE campus_flight ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_flight_rw ON campus_flight TO authenticated USING (true) WITH CHECK (true);
```
- `price_twd_low/high` 同時餵 sec_flight（顯示區間）與 sec_costfull（全費用表加總）→ 單一來源，不重複維護。

### 4.3 `campus_climate`（sec_climate — 氣候曲線）

source 形狀（LP line 2609-2627）：`{ months:[{m,temp,icon,mood}], best:[idx], avoid:[idx], bestReason, avoidReason, note }`，`mood` ∈ 1-5（畫長條高度 + 顏色）。

```sql
CREATE TABLE campus_climate (
  campus_id     uuid PRIMARY KEY REFERENCES campuses(id) ON DELETE CASCADE,
  months        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- 12 筆 [{m:'1月',temp:'1°C',icon:'❄️',mood:1}]
  best_months   integer[] NOT NULL DEFAULT '{}',     -- 推薦出發月 index(0-11)
  avoid_months  integer[] NOT NULL DEFAULT '{}',     -- 建議避開月 index(0-11)
  best_reason   text,
  avoid_reason  text,
  local_note    text,                                 -- 「當地人說」
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE campus_climate ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_climate_rw ON campus_climate TO authenticated USING (true) WITH CHECK (true);
```
- `mood` 1-5 對應 LP 的 `moodColors[mood-1]`（5 色漸層）+ bar 高 `mood*16` px。
- `best/avoid_months` 用 `integer[]`（0=1月）而非 JSONB，因為要當索引比對。
- LP 有「僅供參考」免責聲明（歷年平均、非氣象局）→ rebuild render 時固定附上。

### 4.4 `campus_spend`（sec_spend — 在地消費感受）

source 形狀（LP line 2732-2745）：`{ currency, items:[{icon,label,val,feel}], monthlyTotal, monthlyTwd, savingTip }`。注意 LP 有「同城共用」（canary/greenford 共用 `londonSpend`）。

```sql
CREATE TABLE campus_spend (
  campus_id      uuid PRIMARY KEY REFERENCES campuses(id) ON DELETE CASCADE,
  currency       text NOT NULL,                        -- ISO 'GBP'
  items          jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{icon,label,val,feel}] 咖啡/午餐/啤酒…
  monthly_total  text,                                 -- '£600–1,000'（區間字串，含幣別）
  monthly_twd    text,                                 -- '約台幣 24,000–40,000 元'
  saving_tip     text,
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE campus_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_spend_rw ON campus_spend TO authenticated USING (true) WITH CHECK (true);
```
- 「同城共用」用 application 層處理（advisor 填一次、複製到同城 campus），**不**做 city 共用 FK，保持 per-campus 一筆獨立（避免跨城耦合，符合 campus = atomic 的設計）。
- `monthly_total` 與 sec07 生活費估算（`livingMonthly` 常數）是**兩套**：sec_spend 是「感受型」展示文案，sec07 是「計算型」常數。rebuild 不強制一致（PS 待決），但建議 sec07 的 `livingMonthly` 之後也下放到此表的數值欄。

### 4.5 四表共通備註

- **load 路徑**：EF generate 時 `select * from campus_area/flight/climate/spend where campus_id in (...)`（service_role bypass RLS），整塊塞進對應 renderSec 的 HTML。
- **advisor 編輯**：CMS 後台 form（authenticated）寫這四表；JSONB 欄用結構化 form（walk/nearby/items 是可增刪 row 的 sub-form）。
- **缺資料 fallback**：renderSec 內保留 LP source 的「資料準備中」placeholder（`if(!area) return ...資料準備中`），不讓缺資料破版。

---

## 5. Template-slot + renderSec 契約 + 固定 render 順序

### 5.1 契約（三層）

```
┌─ Template（comparison_scroll.html）─────────────────┐
│  靜態 CSS（全 23 段）+ 固定 <section> tag 順序      │
│  + 每段一個 {{SECxx_HTML}} slot                     │
└──────────────────┬──────────────────────────────────┘
                   │  EF .replace('{{SECxx_HTML}}', renderSecxx(...))
                   ▼
┌─ renderSec function（EF index.ts）──────────────────┐
│  純函式：(schools, sectionData) => htmlString        │
│  空選校 → return ''（不破版）                        │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─ LP_DATA island（互動段才需要，目前只 sec07）────────┐
│  EF JSON.stringify → <script type=application/json> │
└──────────────────────────────────────────────────────┘
```

**renderSec function signature 統一為**：
```ts
function renderSecXX(schools: SchoolBundle[], extra?: SectionData): string
// schools: 已選校 bundle（含 campuses/programs/tiers/housing/area/...）
// extra: 該段專屬資料（如 daySchedule / voices / faq / area rows）
// 回傳：該段 .wrap 內的完整 HTML；schools 空 → ''
```

### 5.2 目前 template 的 slot 缺口（要補齊）

目前 `comparison_scroll.html` 只挖了 **10 個 slot**（line 1818-1827）：`SEC01/02/03/04/SEC_PHOTOS/SEC08/SEC07/SEC09/SEC_VOICES/SEC_FAQ`。**順序也跟 23 段權威順序不符**（缺 sec_area/flight/climate/spend、sec05/06、sec_costfull、sec10/11、sec_safety/return、sec12/13）。

> ⚠️ 目前 template 的 section 順序是「閹割版」：`sec04 → sec_photos → sec08 → sec07 → sec09 → sec_voices → sec_faq`，把中間 9 段全跳過。Rebuild 要把 template 改成**完整 25 列順序**（含 2 個 break）。

**Rebuild 後完整 slot（固定順序）**：
```html
<section id="sec01">{{SEC01_HTML}}</section>
<section id="sec02">{{SEC02_HTML}}</section>
<section id="sec03">{{SEC03_HTML}}</section>
<section id="sec04">{{SEC04_HTML}}</section>
<section id="sec_photos" class="advisor-only">{{SEC_PHOTOS_HTML}}</section>
<section id="sec_area">{{SEC_AREA_HTML}}</section>
<section id="sec_flight">{{SEC_FLIGHT_HTML}}</section>
<section id="sec_climate">{{SEC_CLIMATE_HTML}}</section>
<section id="sec_spend">{{SEC_SPEND_HTML}}</section>
<section id="sec08">{{SEC08_HTML}}</section>
<section id="sec05">{{SEC05_HTML}}</section>
<div class="stat-break">{{STAT_BREAK_HTML}}</div>
<section id="sec06">{{SEC06_HTML}}</section>
<div class="section-break"><!-- 固定 quote --></div>
<section id="sec07">{{SEC07_HTML}}</section>
<section id="sec_costfull">{{SEC_COSTFULL_HTML}}</section>
<section id="sec_voices">{{SEC_VOICES_HTML}}</section>
<section id="sec09">{{SEC09_HTML}}</section>
<section id="sec10">{{SEC10_HTML}}</section>
<section id="sec11">{{SEC11_HTML}}</section>
<section id="sec_safety">{{SEC_SAFETY_HTML}}</section>
<section id="sec_return" class="advisor-only">{{SEC_RETURN_HTML}}</section>
<section id="sec_faq">{{SEC_FAQ_HTML}}</section>
<section id="sec12">{{SEC12_HTML}}</section>
<section id="sec13">{{SEC13_HTML}}</section>
<script id="LP_DATA" type="application/json">{{LP_DATA_JSON}}</script>
```

### 5.3 RENDER_ORDER 凍結機制（防止後續加段 reshuffle anchor）

把 render 順序定義成 EF 內一個**單一常數陣列**（single source of truth），renderAll 照它跑，新增段只能在陣列**指定位置 insert**，不能改既有段相對位置：

```ts
// 固定 render 順序（= LP renderAll 順序，鎖死）。情感 anchor 位置由此陣列保證。
const RENDER_ORDER = [
  'sec01','sec02','sec03','sec04','sec_photos',
  'sec_area','sec_flight','sec_climate','sec_spend','sec08',
  'sec05','__stat_break__','sec06','__section_break__','sec07',
  'sec_costfull','sec_voices','sec09','sec10','sec11',
  'sec_safety','sec_return','sec_faq','sec12','sec13',
] as const;
const EMOTIONAL_ANCHORS = new Set(['sec01','sec04','sec08','sec11','sec13']); // 120px，位置不可動
```

**鐵律**：
1. renderAll 一律 `for (const id of RENDER_ORDER)` 跑，**不靠 ID 數字序**。
2. 加新段 → 在 `RENDER_ORDER` 指定 index 插入 + 加 slot + 加 renderSec，**禁止移動 EMOTIONAL_ANCHORS 內 5 個 ID 的相對位置**。
3. ID 命名沿用現狀（`sec01-13` + `sec_xxx` 混用）— PAGE_STRUCTURE LV-5/LV-6 建議改全語意命名，但 rebuild **不做命名 migration**（風險高、收益低），只用 RENDER_ORDER 陣列把「ID 序 ≠ render 序」這個坑封裝掉。

---

## 6. Rebuild 待補清單（從現狀到 23 段全綠）

| # | 工作 | 現狀 | 動作 |
|:--|:--|:--|:--|
| 1 | template 補 13 個 slot + 改成完整 25 列順序 | 只有 10 slot、順序閹割 | 改寫 `comparison_scroll.html` §5.2 |
| 2 | EF 補 13 個 renderSec | 只 port 10 | 照 LP source `renderSec05/06/10/11/12/13/_area/_flight/_climate/_spend/_costfull/_safety/_return` port |
| 3 | sec07 還原互動 | EF 砍成固定 12 週靜態 | 烤完整 `LP_DATA` island + client recompute + URL state（§2）|
| 4 | 4 新表建 schema + RLS | schema 無、資料寫死 | 建 `campus_area/flight/climate/spend`（§4）|
| 5 | URL state 擴成完整 selection | 只有 campuses/style/weeks | 加 `pick`(sku)/`demo`（§2.5）|
| 6 | URL → 報價單對接 | 完全未串 | URL.pick(sku) → `tuition_tiers` → `calculate.ts`（§2.5）|
| 7 | RENDER_ORDER 凍結 | 散在 replace 鏈 | 抽成單一常數陣列（§5.3）|
| 8 | demo-mode + `?demo=` param | demo-mode 機制在，URL param 無 | 保留機制 + 加 param（§3.3）|

---

## Cross-reference

- 02 SKU 章 — `tuition_tiers.sku`（`VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`）= island ↔ 報價單對接鍵。
- 報價章 — `src/lib/quotation/calculate.ts`（純 6 層 pricing fn，19 passing tests）+ Nexus-safe snapshot。
- `design/PAGE_STRUCTURE.md` — 23 段順序 / 節奏 / advisor-bar 結構（本章 §1 §3 來源）。
- LP source — `/Users/jojowu/fanyang-consult/fanyang-consult.html`（renderAll line 3442、sec07 line 4659、demo toggle line 3324、4 段資料 line 2360-2967）。
- 目前 EF — `/Users/jojowu/FY-school-cms/supabase/functions/generate-page/index.ts`（已 port 10 段、`tuitionJson`/`housingJson` island 雛形 line 1041-1050）。
