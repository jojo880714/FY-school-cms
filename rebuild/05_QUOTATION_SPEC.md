# 05 報價規格 (QUOTATION SPEC)

> 本章定義「放洋語校 CMS」重建版的報價引擎（quotation engine）與整條報價流程。
> 引擎本身（`src/lib/quotation/`）已存在、已測（19 個 passing tests），但**從未被任何 UI 或 API 呼叫**——它是一個孤立的純函數模組。
> 本章的任務有兩個：(1) 把現有引擎的契約、6 層算費邏輯、預設值、stub 精確記錄下來成為規格；(2) 把重建版「如何把它接上 DB / UI / 開單寫入」整條 wiring 補完。
>
> **紅線（RED LINE，最高優先）：不准改 `src/lib/quotation/calculate.ts` 的數學。** 那 252 行對齊舊報價系統（`jojo880714/FY-quotation-system-EP-` app.js 297–405 行），有 19 個測試鎖住結果。重建只允許「在外圍把它接起來」，不允許動 Layer 1–6 任何一行運算。任何「順手優化」算費都視為破壞。

---

## 0. 名詞與 grain（先講清楚原子單位）

| 名詞 | 定義 |
|---|---|
| **SKU / 原子可售單位** | 一筆 `tuition_tiers` row = `program × campus × week-band × currency × validity`。重建後此 grain 要有穩定 SKU（`VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`），DB 對整個 grain 下 `UNIQUE`。詳見第 02 章 SKU 規格。報價引擎本身**不認識 SKU**——它吃的是已組好的 `Course`/`Accommodation`/`Fee` 物件，SKU 只在「選 SKU → 組 QuotationInput」與「開單 snapshot」兩個邊界出現。 |
| **報價單 quotation** | 顧問為某個學生 / 案件針對某個方案算出來、可對外的一張單。一張 LP 可開多張報價單（學生要比不同方案）。 |
| **calculate()** | 純函數：`QuotationInput → QuotationResult`。無 side-effect、不碰 DB、不碰 global state。 |
| **vendor** | 字串 slug，**沒有 vendors 表**（Nexus-frozen）。MVP 5 校 slug：`ILAC / ILSC / KAP / EC / CG`。引擎型別把 `Vendor` 定義成 `'EP' | 'ILSC' | 'EC' | 'Kaplan' | 'SGIC' | string`——`| string` 是逃生口，任何 slug 都吃得下。**注意 slug 集合與舊 `_DRAFT_vendors.sql` 不一致**（見 §10 開放決策）。 |

---

## 1. 引擎檔案地圖（現況，照搬）

```
src/lib/quotation/
├── types.ts          型別契約：QuotationInput / QuotationResult / Course / Accommodation / Fee / AdminSettings ...
├── helpers.ts        sf() fmt() twd() getTier() isPeak()  ← isPeak 是 stub
├── calculate.ts      核心 6 層算費 + 管理員淨利試算（252 行，紅線）
├── index.ts          公開 API：export { calculate }，defaultAdminSettings，defaultRates
└── calculate.test.ts 19 個 tests（vitest）
```

跑測試：`npx vitest run src/lib/quotation/calculate.test.ts`（或 `npm test`）。重建後這個指令必須恆綠，當成 CI gate。

---

## 2. QuotationInput（引擎輸入契約）

`calculate()` 唯一參數。**重建版不改這個 shape**——所有 wiring 的目標就是「把 DB 資料映射成這個 shape」。

```ts
interface QuotationInput {
  vendor: Vendor;                       // slug 字串，e.g. 'ILAC'
  campus: string;                       // 校區名（顯示用字串，非 UUID）
  course: Course;                       // 選定課程（含週數階梯 tiers[]）
  weeks: number;                        // 上課週數（>=1，否則回 emptyResult）
  startDate?: string;                   // 'yyyy-mm-dd'，影響 isPeak（目前 stub 不影響）
  accomm: Accommodation | 'none' | null;// 住宿；null/'none' = 不選
  extras: Record<string, Fee>;          // 額外雜費（key 任意，慣例用 fee.name）
  disc: Discount;                       // 折扣（含 schoolDiscount 兩層）
  campusFees: Fee[];                     // 該校區雜費清單（註冊/教材/銀行/行政...）
  rates: Record<Currency, number>;      // 多幣別 → TWD 匯率
  adminSettings: AdminSettings;         // 影響 Layer 3–6 + 淨利試算
}
```

子型別（精確照搬 `types.ts`）：

```ts
type Currency = 'AUD' | 'GBP' | 'EUR' | 'USD' | 'CAD' | 'NZD' | 'TWD';
type PricingUnit = '按週計算' | '每週' | '按堂計算' | '按天計算' | '固定金額';
//   注意:'每週' 與 '按週計算' 等價（isWeeklyUnit() 兩者都判 true）。
//   '按堂計算' / '按天計算' 目前在 calculate() 內被當成「非按週 → 取單一固定金額」處理（見 §3 警告）。

interface PricingTier { wf: number; wt: number; price: number; fixed: number; peak: number; }
//   wf=weeks from(>=), wt=weeks to(<=), price=主價, fixed=固定金額(替代 price), peak=旺季每單位加價

interface Course { name; category; currency: Currency; unit: PricingUnit; tiers: PricingTier[]; }
interface Accommodation { type; name; currency: Currency; price; fixed; unit: PricingUnit; note?; }
interface Fee { name; category: '教材'|'註冊'|'銀行'|'行政'|'雜費'|string; currency; price; fixed; unit; wf?; wt?; }

interface Discount {
  type: string;                 // 公司折扣標籤；'原價' / '' / 未設 → 不套 Layer 5
  pct: number;                  // 公司折扣 %（Layer 5）
  fixed: number;                // 公司折扣固定額 TWD（Layer 5，pct 優先）
  schoolDiscount: SchoolDiscount | null;  // 廠商級折扣（Layer 2）
}
interface SchoolDiscount { label: string; pct: number; fixed: number; }

interface AdminSettings {
  fxBuffer: number;             // 匯差緩衝 %（預設 2）
  commissionPct: number;        // 顧問獎金 %（預設 0）
  taxRate: number;              // 營業稅率 %（預設 5）
  rebates: Record<Vendor, number>;  // 各廠商退傭 %（淨利試算用）
}
```

---

## 3. 六層算費（Layer 1–6，逐層精確說明）

`calculate(input)` 的執行順序與每層公式如下。**所有金額在進入分層前先換算成 TWD**（各項目 `twd = round(amt × rates[cur])`）。

### 前置：組明細 items[]

在分層之前，引擎先把所有費用組成 `QuotationItem[]`：

1. **課程費（Course）**
   - `tier = getTier(course.tiers, weeks)`：掃 tiers 找第一個 `weeks ∈ [wf, wt]`；**找不到就回最後一個 tier**（`tiers[tiers.length-1]`，見 §6 邊界）。
   - `baseP = tier.price || tier.fixed`。
   - `pk = isPeak(startDate)`（目前恆 false）；`pkAdd = pk ? (tier.peak || 0) : 0`。
   - 按週（`unit ∈ {'按週計算','每週'}`）：`cAmt = (baseP + pkAdd) × weeks`，note = `"${weeks}週 × ${fmt(baseP)}[ + 旺季${fmt(pkAdd)}/週]"`。
   - 非按週：`cAmt = baseP`（單一金額），note = `'固定費用'`。
   - **⚠️ 已知行為**：`'按堂計算'` / `'按天計算'` 目前**不**乘堂數/天數，被當「固定金額」取單一值。週數 only 是唯一的乘數維度。重建若要支援真正的按堂/按天，屬於改 `calculate.ts` → 觸碰紅線，需另立決策（見 §10）。
2. **自動雜費（admin fees）**：`campusFees` 中 `category ∈ {'教材','註冊','銀行'}` 且 `weeks ∈ [f.wf??1, f.wt??99]` 者自動計入；按週則 `× weeks`，否則取單值。note = `'自動計入'`。
3. **住宿（Accommodation）**：若 `accomm` 非 null/'none'，`aA = 按週 ? price×weeks : (price||fixed)`。
   - **住宿行政費連動**：在 `campusFees` 找 `category==='行政'` 且 name 含「住宿」或「安排」者，金額 > 0 則自動加一筆，note = `'住宿行政費'`。
4. **額外雜費（extras）**：`Object.values(extras)` 全部計入，按週則 `× weeks`，note = `f.category`。

### Layer 1 — rawCostTWD（原成本）
```
rawCostTWD = Σ items[i].twd        // 各項目 TWD 加總，這是「我們付給廠商的原始成本」
```

### Layer 2 — 廠商折扣（school discount）
```
if (disc.schoolDiscount):
  schoolDiscAmt   = sd.pct > 0 ? round(rawCostTWD × sd.pct/100) : (sd.fixed || 0)
  discountedCostTWD = rawCostTWD − schoolDiscAmt
  → 推一筆 discLine { label: "${sd.label}(廠商折扣)", amt: −schoolDiscAmt, type:'school' }
else:
  discountedCostTWD = rawCostTWD
```
語意：廠商給的折扣（早鳥、團報…），**先打在成本上**，影響後續所有層與淨利。

### Layer 3 — 匯差緩衝（FX buffer）
```
fxBuf  = 1 + (adminSettings.fxBuffer || 0)/100        // 預設 1.02
costTWD = round(discountedCostTWD × fxBuf)
```
語意：匯率波動的保護墊，公司實際入帳成本上浮一個 buffer。

### Layer 4 — 顧問獎金加成（commission markup）
```
commPct    = (adminSettings.commissionPct || 0)/100   // 預設 0
preTaxSell = round(costTWD × (1 + commPct))
```
語意：在成本上**加成**出顧問獎金空間，得到「稅前售價」。注意是 markup（加），不是折扣。

### Layer 5 — 公司折扣（company discount）
```
afterCoDisc = preTaxSell
if (disc.type 不是 '原價'/''/未設):
  coAmt = disc.pct>0 ? round(preTaxSell × disc.pct/100)
        : disc.fixed>0 ? disc.fixed : 0
  afterCoDisc = preTaxSell − coAmt
  if coAmt>0 → 推一筆 discLine { label:"${disc.type}(公司折扣)", amt:−coAmt, type:'company' }
```
語意：公司對外給學生的促銷折扣（春季優惠…），打在售價上。`pct` 優先於 `fixed`。

### Layer 6 — 營業稅（5% tax）
```
taxAmt   = round(afterCoDisc × (adminSettings.taxRate || 5)/100)   // 預設 5%
finalTWD = afterCoDisc + taxAmt        // ← 顧問版對外顯示金額
```

### 衍生彙總
```
discountAmt   = preTaxSell − afterCoDisc            // Layer 5 折掉的
totalDiscount = schoolDiscAmt + discountAmt          // Layer 2 + Layer 5 合計
totalOrig     = 各幣別原值字串，e.g. "A$5,640 + £80"  // 依 currency 分組加 amt 再 fmt()
```

### 管理員淨利試算（admin net-profit，跟 Layer 6 同階段算）
> 這組數字**只給管理員看**，顧問版報價單不顯示。
```
rebatePct    = adminSettings.rebates[vendor] || 0
rebateTWD    = round(discountedCostTWD × rebatePct/100)   // 廠商退傭
commissionTWD = preTaxSell − costTWD                      // = 顧問獎金實際金額
netProfit    = afterCoDisc − costTWD + rebateTWD           // 真正落袋淨利
netMargin    = finalTWD>0 ? round(netProfit/finalTWD ×1000)/10 : 0   // %，小數一位
```

### 一條龍流向圖

```
rawCostTWD ──L2 廠商折扣──▶ discountedCostTWD ──L3 ×fxBuf──▶ costTWD
   ──L4 ×(1+comm)──▶ preTaxSell ──L5 公司折扣──▶ afterCoDisc ──L6 +tax──▶ finalTWD(對外)

淨利線:  netProfit = afterCoDisc − costTWD + rebateTWD
```

---

## 4. 預設值（defaults）— 來自 `index.ts`

```ts
export const defaultAdminSettings = {
  fxBuffer: 2,        // 匯差緩衝 2%
  commissionPct: 0,   // 顧問獎金 0%（預設不加成）
  taxRate: 5,         // 營業稅 5%
  rebates: {},        // 各廠商退傭，實作 phase 從 DB 載入
} as const;

export const defaultRates = {           // ⚠️ hardcoded，重建必須改成動態載入
  AUD: 21.5, GBP: 40.2, EUR: 33.8, USD: 32.1, CAD: 23.5, NZD: 20.0, TWD: 1,
} as const;
```

**重建規則**：
- `defaultRates` 是 app.js 137 行抓下來的靜態值，**不可當正式匯率**。重建必須從匯率來源（`exchange_rates` 表 / 匯率 API / Supabase config）動態帶入，並把「開單當下匯率」snapshot 進報價單（鎖價）。
- `rebates` 與 `commissionPct` 屬管理員機密設定，從 DB（或環境設定表）載入，**不可寫死在前端 bundle**。

---

## 5. isPeak() — stub（旺季判斷，尚未實作）

```ts
// helpers.ts
export function isPeak(startDate?: string): boolean {
  if (!startDate) return false;
  // TODO: 對齊 app.js 271–277 行真實邏輯（依 vendor / 月份規則）
  return false;   // ← 目前恆 false
}
```

**現況**：`isPeak` 永遠回 `false`，所以 `tier.peak` 旺季加價在任何情況下都**不會生效**。引擎已經把 `peak` 欄位、`pkAdd`、note 的「+ 旺季」串全部接好，只差這個布林。

**重建決策**：
- isPeak 的正解依 vendor + 月份不同（每家旺季月份不一樣），需要從各廠商真實規則抽進來。
- **建議資料化**：與其在 `helpers.ts` 寫死 if-else（會隨廠商增減而改 code），不如建一張 `peak_seasons(vendor, month_from, month_to)` 或在 SKU 層帶旺季月份，讓 `isPeak` 查表。
- ⚠️ 但 `isPeak` 被 `calculate.ts` 直接 import 呼叫。若改成查表，要嘛 (a) 把 peak 月份預先算進 `QuotationInput`（純函數友善，**首選**），要嘛 (b) 讓 isPeak 收更多參數——後者會改到 `calculate.ts` 的呼叫點，**碰紅線**。**首選 (a)**：在 from-db mapper 階段就依 `startDate` 月份決定要不要把 `tier.peak` 灌成 0，`calculate.ts` 完全不動。

---

## 6. emptyResult / 邊界（edge cases）

`calculate()` 在以下情況回 `emptyResult()`（全 0、items 空、`finalTWD=0`、`fxBuf=1`）：

```ts
if (!vendor || !campus || !course || !weeks || weeks < 1) return emptyResult();
```

| 邊界 | 引擎行為 | 重建 wiring 要做的事 |
|---|---|---|
| **vendor/campus/course 缺** | `emptyResult()` | QuotePanel 在必填齊全前 disable「開單」鈕，顯示「請先選課程」。 |
| **weeks < 1 或 0** | `emptyResult()` | weeks selector 最小值綁 program/tier 的 `weeks_min`，預設帶 program.min_weeks。 |
| **沒有 programs（該校無課程）** | 顧問選不到 course → 必填缺 → emptyResult | UI 顯示「此校尚未上架課程，無法報價」，不給開單。 |
| **沒有 housing（該校無住宿）** | `accomm=null` 合法，引擎略過住宿項 | 住宿 selector 給「不選住宿」選項；空清單時只顯示「不選住宿」。 |
| **沒有 tuition_tiers（課程無報價）** | `course.tiers=[]` → `getTier` 回 `tiers[length-1]=undefined` → **執行期會炸**（`baseP = undefined.price`）| **mapper 必須擋**：tiers 為空的 program 不可進 course selector，或 mapper 回傳「此課程無有效報價」。**不可把空 tiers 丟進引擎。** |
| **weeks 落在所有 band 之外**（例如 tiers 都 ≤23 週，使用者選 30 週）| `getTier` for-loop 找不到 → 回**最後一個 tier**（fallback），不報錯 | 這是「靜默 fallback」。重建 UI 應在 weeks 超出最大 `weeks_max` 時給警示（「超出 30 週上限，沿用最後一級價格」），避免顧問誤報。 |
| **rates 缺某幣別** | `twd()` 用 `rates[cur] ?? 1`（當 1:1）→ 金額嚴重錯誤 | mapper 必須確保所有出現的 currency 都有匯率，缺則拒絕開單。 |

> 測試已覆蓋「必要欄位缺 → emptyResult」「tier 階梯三段」「多幣別換算」「6 層」「淨利」「totalOrig」，但**未覆蓋空 tiers 會炸**——重建要在 mapper 層補防護 + 補一條測試（測 mapper，不測 calculate）。

---

## 7. WIRING ① — from-db mapper（DB → QuotationInput）

引擎目前完全沒人呼叫。第一塊 wiring：把 Supabase 的 `tuition_tiers + housing + fees + programs + campuses` 映射成 `QuotationInput`。新增檔案 **`src/lib/quotation/fromDb.ts`**（純映射，不碰算費）。

### 7.1 來源表（live schema，已查證）

```
tuition_tiers: id, program_id, campus_id, weeks_min, weeks_max, price_per_week,
               note, valid_from, valid_until, currency
               (+ 待套用擴充: fixed, peak, unit DEFAULT '按週計算', category)  ← _DRAFT_tuition_tiers_extension.sql
housing:       id, school_id, city, type, subtype, season, price_per_week,
               placement_fee, min_weeks, currency, includes, commute_to_school, description
programs:      id, school_id, name, code, lessons_per_week, hours_per_week, min_weeks, ...
campuses:      id, school_id, city, address, ...
schools:       id, name, full_name, country, vendor_id(待加), ...
```

> ⚠️ **schema 落差，重建要補**：
> 1. `tuition_tiers` 目前**沒有** `fixed / peak / unit / category` 欄位——要先套 `_DRAFT_tuition_tiers_extension.sql`，引擎才有 `tier.peak`、`unit`、能區分課程 vs 雜費 row。
> 2. **`fees` 表不存在。** 引擎吃 `campusFees: Fee[]`（註冊/教材/銀行/行政），但 DB 沒有對應表。重建二選一：(a) 新建 `fees` 表（grain 同 SKU，依 campus）；(b) 用 `tuition_tiers` 的 `category != '課程'` row 兼充雜費。**建議 (a) 新建 `fees` 表**，語意乾淨，且雜費 `wf/wt` 適用區間能直接落欄位。
> 3. `housing` 是 **school 級**（`school_id`），不是 campus 級；報價以校區為主軸時，住宿要從「該校所有 housing」帶入並用 `city` 對齊校區城市過濾。
> 4. `tuition_tiers` 一筆 = 一個 `(program, campus, week-band, currency)`。引擎的 `Course.tiers[]` 需要**把同一 `(program_id, campus_id, currency)` 的多筆 tier rows 聚合成一個 Course 的 `tiers` 陣列**（GROUP BY program+campus+currency，把每筆 week-band 變成一個 PricingTier）。

### 7.2 映射函式（簽名與規則）

```ts
// src/lib/quotation/fromDb.ts
export function tiersToCourse(
  program: ProgramRow,
  tierRows: TuitionTierRow[],   // 已過濾成同 program+campus+currency
): Course {
  return {
    name: program.name,
    category: '課程',
    currency: tierRows[0].currency as Currency,
    unit: tierRows[0].unit ?? '按週計算',
    tiers: tierRows
      .sort((a,b) => a.weeks_min - b.weeks_min)
      .map(r => ({
        wf: r.weeks_min,
        wt: r.weeks_max,
        price: Number(r.price_per_week ?? 0),
        fixed: Number(r.fixed ?? 0),
        peak: Number(r.peak ?? 0),
      })),
  };
}

export function housingToAccommodation(h: HousingRow): Accommodation {
  return {
    type: h.type,
    name: [h.type, h.subtype].filter(Boolean).join('-'),
    currency: h.currency as Currency,
    price: Number(h.price_per_week ?? 0),
    fixed: 0,
    unit: '按週計算',
    note: h.includes ?? undefined,
  };
  // placement_fee 另外映成一筆 category:'行政' 的住宿安排費塞進 campusFees,
  // 引擎才會自動連動「住宿行政費」(見 Layer 前置 step 3)。
}

export function feesToCampusFees(feeRows: FeeRow[]): Fee[] { /* category/unit/wf/wt 直映 */ }

export function buildQuotationInput(args: {
  vendor: string; campus: string;
  course: Course; weeks: number; startDate?: string;
  accomm: Accommodation | 'none' | null;
  extras: Record<string, Fee>;
  disc: Discount;
  campusFees: Fee[];
  rates: Record<Currency, number>;     // 動態載入(§4)
  adminSettings: AdminSettings;        // DB 載入(§4)
}): QuotationInput { /* 純組裝 */ }
```

**mapper 防護（必做）**：
- `tierRows.length === 0` → 不產 Course，回 `null`，UI 不列此課程（擋 §6「空 tiers 炸」）。
- 所有 Course/Accommodation/Fee 的 `currency` 都要在 `rates` 內存在，缺則 mapper throw / 回錯誤（擋 §6「rates 缺幣別」）。
- `weeks` clamp 進 `[program.min_weeks ?? 1, max(weeks_max)]`，超出時在回傳帶 `warning` flag 給 UI（不靜默）。
- 旺季：依 `startDate` 月份決定是否把各 tier `peak` 帶 0（§5 首選方案 a），讓 `calculate.ts` 不動。

---

## 8. WIRING ② — QuotePanel（UI，live 呼叫 calculate）

新增 **`src/components/quotation/QuotePanel.tsx`**（authenticated 區，掛在 ProtectedRoute 後；anon 不可達）。

### 8.1 選擇器（selectors）

| 控制項 | 來源 | 行為 |
|---|---|---|
| **學校 / 校區** | 從案件已選學校 + `campuses` | 決定 vendor slug + campus 名 |
| **課程 program** | `programs`(該校) + `tuition_tiers`(該 program×campus) 經 mapper | 只列「有 tiers」的課程；選定 → `course` |
| **住宿 housing** | `housing`(該校，city 對齊) | 含「不選住宿」選項 → `accomm='none'/null` |
| **週數 weeks** | number input | min=program.min_weeks，超出 max 顯示警示 |
| **起始日 start_date** | date picker | → `startDate`；影響旺季（mapper 預算 peak） |
| **折扣 disc** | 廠商折扣下拉 + 公司折扣下拉 | → `disc.schoolDiscount`(L2) / `disc.type+pct+fixed`(L5) |
| **額外雜費 extras** | checkbox 清單 | → `extras` |

### 8.2 即時計算（live）

- 任一 selector 變動 → `buildQuotationInput()` → `calculate()` → render `QuotationResult`。
- 純函數、無 side-effect，可直接在 `useMemo([...deps])` 內同步算，**不需 API round-trip**。
- 顯示分兩視角：
  - **顧問版**：items 明細、`totalOrig`、各 discLine、`finalTWD`（對外金額）。
  - **管理員版**（role-gated）：另顯 `costTWD / preTaxSell / rebateTWD / netProfit / netMargin`。role 判斷走 `useAuth`，不靠舊 app.js 的 PIN `'991234'`（**該 PIN 機制不保留**，見 index.ts 紅線）。
- `emptyResult`（finalTWD=0）時，「開單」鈕 disabled，顯示「請補齊課程 / 週數」。

---

## 9. WIRING ③ — 開單 action（issue-quote）+ quotations 表

「開單」把當下 `QuotationInput`（payload）+ `QuotationResult`（result）snapshot 寫進 `quotations` 表。

### 9.1 quotations schema（重建版，基於 `_DRAFT_quotations.sql` + Nexus-safe 調整）

```sql
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE,                       -- 'Q-YYYYMMDD-NNNNN'(§9.3)

  -- 關聯(全部 nullable FK,Nexus-safe;Nexus 接管後不會因 FK 卡住)
  case_id   UUID REFERENCES cases(id),
  lp_id     UUID REFERENCES generated_pages(id),
  school_id UUID REFERENCES schools(id),

  -- ★ Nexus-safe 冗餘快照(copy values,不靠 UUID)
  vendor_slug   TEXT NOT NULL,                    -- 'ILAC' 等字串,不是 vendor_id
  campus_name   TEXT,                             -- 校區名字串
  program_name  TEXT,                             -- 課程名字串

  payload JSONB NOT NULL,   -- 完整 QuotationInput(含當下 rates / adminSettings)
  result  JSONB NOT NULL,   -- 完整 QuotationResult(鎖價)

  -- 常用 query 欄位(從 result/input 抽出方便 index)
  final_twd        INT  NOT NULL,
  currency_primary TEXT NOT NULL,
  weeks            INT  NOT NULL,
  start_date       DATE,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','void')),  -- §9.4
  valid_until DATE,                                -- 預設 created_at + 14 天

  created_by UUID,                                 -- auth.users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at  TIMESTAMPTZ,
  pdf_url    TEXT,
  notes      TEXT
);
CREATE INDEX quotations_case_idx       ON quotations(case_id);
CREATE INDEX quotations_status_idx     ON quotations(status);
CREATE INDEX quotations_created_by_idx ON quotations(created_by);
CREATE INDEX quotations_created_at_idx ON quotations(created_at DESC);
```

> **與 `_DRAFT_quotations.sql` 的差異（重建決策）**：
> - **狀態收斂**：草稿用 5 態 `draft/sent/accepted/rejected/expired`；重建 MVP 收成 **3 態 `draft/issued/void`**（§9.4）。`sent/accepted/rejected` 屬 CRM/Nexus 後段流程，凍結別依賴；過期用 `valid_until < today` 推導而非存 `expired` 狀態，避免要排程改 row。
> - **加冗餘字串欄位** `vendor_slug / campus_name / program_name`：Nexus-safe 硬規定——報價是 snapshot，**copy values 不存 UUID**，這樣即使 cases/schools 之後被 Nexus 改寫或刪，報價單仍可獨立呈現。
> - 所有 FK **nullable**（直接開報價、無案件時也能存）。

### 9.2 issue-quote action（寫入規則）

`src/lib/quotation/issueQuote.ts`（authenticated，走 Supabase client，RLS `TO authenticated`）：

1. 前端已有 `QuotationInput`/`QuotationResult`（QuotePanel 算好的）。
2. **後端重算驗證（建議）**：把 payload 丟進同一支 `calculate()` 重算，比對 `finalTWD`，不一致則拒（防前端竄改）。calculate 是純函數，前後端共用同一份，重算零成本。
3. snapshot 寫入：`payload=input`、`result=output`、抽 `final_twd/currency_primary/weeks/start_date`、填 `vendor_slug/campus_name/program_name` 字串。
4. `status='draft'` 起步；按「正式開出」→ `status='issued'`、`issued_at=now()`、`quote_number` 由 trigger 產生（§9.3）。
5. `valid_until = created_at + 14 days`（預設效期，§9.4 可調）。

### 9.3 quote_number 編號 — `Q-YYYYMMDD-NNNNN`

格式：`Q-20260626-00001`（前綴 `Q-`、開單日 `YYYYMMDD`、`-`、5 碼流水號）。

**全域 vs 每日序號決策 → 採「每日序號（daily）」**：
- 每日 `NNNNN` 從 `00001` 起算，跨日歸零。語意直觀（「今天第 N 張」），對 5 校 MVP 量級不會撞 5 碼上限（99999/日）。
- 全域序號雖實作簡單（單一 `SEQUENCE`），但號碼會隨時間飆大、且 `YYYYMMDD` 與序號脫鉤，閱讀性差。MVP 選 daily。

實作（trigger + 每日計數，避免 race）：

```sql
-- 用 advisory lock + 當日 count 產生 daily 流水號(在 BEFORE INSERT trigger 內)
CREATE OR REPLACE FUNCTION assign_quote_number() RETURNS trigger AS $$
DECLARE seq INT;
BEGIN
  IF NEW.quote_number IS NOT NULL THEN RETURN NEW; END IF;
  -- 以日期字串做 advisory lock key,序列化同日插入
  PERFORM pg_advisory_xact_lock(hashtext('quote:' || to_char(now(),'YYYYMMDD')));
  SELECT COUNT(*) + 1 INTO seq
    FROM quotations
    WHERE created_at::date = current_date;
  NEW.quote_number := 'Q-' || to_char(now(),'YYYYMMDD') || '-' || lpad(seq::text, 5, '0');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_quote_number
  BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION assign_quote_number();
```

> 草稿留的 `quote_number_seq`（全域 SEQUENCE）在 daily 方案下**不使用**——重建移除，改用上述 trigger。`quote_number` 在「正式 issued」時才賦值（draft 階段可為 null），避免廢棄草稿吃掉號碼。

### 9.4 生命週期 / 狀態 / 效期

| status | 語意 | 進入條件 | 可逆 |
|---|---|---|---|
| `draft` | 草稿，顧問還在調 | 開單寫入即此態，無 `quote_number` | 可改 payload、可刪 |
| `issued` | 正式開出（鎖價、給編號） | 顧問按「開出」→ trigger 配號、`issued_at`、`valid_until` | 不可改 payload；要改 → 開新單 |
| `void` | 作廢 | 顧問手動作廢（打錯、學生放棄） | 終態，保留 audit |

- **效期**：`valid_until = issued_at + 14 天`（預設，可在 adminSettings 調）。**不存 `expired` 狀態**——「是否過期」由 `valid_until < current_date` 即時推導顯示，避免要 cron 改 row。
- **鎖價原則**：`issued` 後 payload/result/rates 全凍結。匯率之後變動不影響已開單金額（snapshot 已含當下 rates）。
- **改方案**：issued 單不可編輯；學生要改 → 複製成新 draft 再 issue（保留原單 audit 鏈）。
- **與 LP/案件關係**：一張 LP 可有多張 quotation（不同方案）；`case_id`/`lp_id` 可空（直接開單）。

---

## 10. 開放決策（待 jojo 拍板）

1. **vendor slug 集合不一致**：本章 MVP 用 `ILAC / ILSC / KAP / EC / CG`；舊 `_DRAFT_vendors.sql` seed 的是 `EP / ILSC / EC / Kaplan / SGIC`；引擎型別 default 是 `EP/ILSC/EC/Kaplan/SGIC`。**請確認 MVP 5 校 slug 的最終清單**，並據此修 `Vendor` 型別 default 與 seed。（`| string` 逃生口讓任何 slug 都能跑，但 `rebates`/旺季查表需用對 slug。）
2. **`fees` 表要不要新建**？建議新建（§7.1）；否則用 `tuition_tiers` 的 `category != '課程'` row 兼充，但語意較髒、`wf/wt` 表達受限。
3. **isPeak 旺季資料來源**：建議建 `peak_seasons(vendor, month_from, month_to)` 由 mapper 預算 peak，`calculate.ts` 不動（§5）。請確認各校旺季月份規則。
4. **按堂/按天計價**：目前引擎只把週數當乘數，`'按堂計算'/'按天計算'` 退化成固定值（§3 警告）。若 5 校 MVP 有真正按堂/按天課程，需專案決策（會碰紅線，需另立任務 + 補測試）。
5. **後端重算驗證**是否納入 MVP（§9.2 step 2）——建議納入（防竄價，成本近零）。
6. **quote_number daily vs global**：本章定 daily；若 jojo 要求對外編號連續不歸零，改 global SEQUENCE。

---

## 11. 紅線與驗收（acceptance）

- **🚫 不准改 `calculate.ts` 的 6 層數學。** 19 個 vitest 必須恆綠（`npx vitest run src/lib/quotation/calculate.test.ts`），列為 CI gate。
- 所有 wiring（mapper / QuotePanel / issueQuote）**只在引擎外圍**，引擎當黑箱純函數呼叫。
- isPeak / 按堂按天 / 匯率動態化等若需動引擎，一律先過「開放決策」，且改完 19 測試 + 新測試全綠才算。
- RLS：`quotations` 政策一律 `TO authenticated`（顧問前端），**永不 `TO anon`**。公開 LP 由 Worker/EF 以 service_role 讀，不經此表的 anon 路徑。
- 報價單是 Nexus-safe snapshot：FK 全 nullable、vendor 存字串 slug、校/課程名 copy values，不依賴會被凍結的 cases/vendors/lp_school_config 實體。