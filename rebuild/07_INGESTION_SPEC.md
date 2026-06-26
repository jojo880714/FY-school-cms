# 07 — DATA INGESTION SPEC（SKU 統一灌入規格）

> 本章定義 rebuild 後**唯一**的資料灌入管道：一條 SKU-keyed、可重複跑、UPSERT-on-grain 的 pipeline。
> 上游是顧問整理的 Google Sheets / CSV，下游是 Supabase 六張表（`schools` / `city_info` / `campuses` / `programs` / `tuition_tiers` / `housing`）。
> 核心改變：每一筆 `tuition_tiers`（= 一個可賣單元）從「隨機 UUID」升級成「帶穩定 SKU、DB UNIQUE 在完整 grain 上」。
> 對齊章節：03（SKU schema）、04（quotation engine）、06（RLS / service_role）、08（SCHOOL_DATA ETL）。

---

## 0. 為什麼要重寫這條 pipeline（問題盤點）

現行 `scripts/import-from-sheets.js`（25KB，Phase 14c）能跑、有 dry-run、有 FK 解析、有驗證 SQL，**邏輯本身是 carry-over 的資產**。但對 rebuild 來說它有四個結構性缺口，本章逐一補上：

| # | 現況問題 | 證據（現行碼） | rebuild 對策 |
|---|---|---|---|
| 1 | **可賣單元沒有穩定身分** | `tuition_tiers` 只有隨機 `id uuid`，`insertOrPlan()` 純 `insert`，重跑就重複 | 引入 deterministic **SKU**，DB `UNIQUE` 在 SKU 與完整 grain 上 |
| 2 | **灌入是 delete+reinsert** | `--truncate` 走 `DELETE ... neq(id)` 全清六表再重插；不加 `--truncate` 且 DB 非空就直接 `abort` | 改 **UPSERT on conflict (sku)**，可重複跑、可增量、可改價不洗掉 FK |
| 3 | **vendor 概念不存在於灌入層** | schema 無 `vendor` 欄；`SCHOOL_DATA` ETL 計畫想塞 `vendor_id` 但 schema frozen | template 帶 **vendor slug 字串**（display-only），SKU 第一段就是 vendor，**不建 vendors 表** |
| 4 | **parent code 全靠名稱字串對映** | `campusMap`/`programMap` 用 `school_name|city`、`school_name|program_name` 當 key，拼字錯一個字就 orphan | 引入穩定 **campus_code / program_code**，名稱只當 display |

> Frozen 紅線（不依賴）：Nexus master plan、`cases` / `vendors` / `lp_school_config` entity。本章**不建 vendors 表**，vendor 一律是 SKU 內的字串 slug。`tuition_tiers` 的 grain 與既有 19 個 quotation 測試對齊，不改價格語意。

---

## 1. Pipeline 總覽（rebuild 後）

```
[顧問做]                                  [灌入腳本做 — import-skus.ts]
──────────                               ─────────────────────────────
1. 在 master sheet 填 6 tabs              5. 讀 6 tabs(header-based)
   每 tier 帶 vendor / campus_code         6. 解析 + 型別轉換 + sentinel
   / program_code / sku(display-only)      7. 算 canonical SKU(腳本端,不信任手填)
2. dry-run 跑驗證                          8. 跑 11 道 validation gate(見 §6)
3. 看 error 回 sheet 修                    9. UPSERT on conflict(sku)→ 不洗 FK
4. dry-run 綠 → --commit                  10. 跑 validate-import.sql(read-only)
                                          11. 回報:各表 ±N / 自動處理 / 待補真值清單
```

**填寫依賴順序（沿用現行，不變）**：`schools` → `city_info` → `campuses` / `programs` / `housing` → `tuition_tiers`。
理由：parent code（campus_code / program_code）在 §3 被 provision 出來後，`tuition_tiers` 才能組出 SKU。

**安全預設（沿用現行）**：沒加 `--commit` 一律 dry-run，只驗證不寫。所有 DB 寫入用 **service_role key**（繞 RLS，對齊第 06 章：灌入是後台 batch job，不走 authenticated RLS）。

---

## 2. Import Template 規格（6 tabs + 新欄）

Tab 名稱、依賴關係、既有欄位**全部 carry-over** 自 `IMPORT_TEMPLATES.md`。本章只**疊加** SKU 所需的 identity 欄。下面只列「新增 / 變更」欄；未列欄沿用 `IMPORT_TEMPLATES.md` 原規格。

### 2.1 共通新欄原則

- 所有 `*_code` 與 `sku` 欄：**display-only / 對映用**，DB 存的仍是 UUID FK + 一個 canonical `sku` 字串。
- 顧問**可以不填** `sku`：腳本端會 deterministic 重算（§4）。若顧問填了，腳本**比對**手填 vs 算出，不一致 → WARN 並以「算出值」為準（手填只當人類可讀備註）。
- `vendor` / `campus_code` / `program_code` 顧問**應該填**（§3 說明如何 provision）；缺 `program_code` 是一個 jojo content decision（§3.3）。

### 2.2 `schools`（品牌層）— 加 1 欄

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `vendor` ⭐ | TEXT | ✅ | `ILAC` | **vendor slug**，大寫英數，SKU 第一段。MVP 5 校：`ILAC` / `ILSC` / `KAP` / `EC` / `CG`。**不建 vendors 表**,純字串。一間 school 一個 vendor;同一 vendor 可跨多 school row(對齊第 08 章 ETL 的 vendor×campus 展開) |
| `name` | TEXT | ✅ | `ILAC` | 沿用，短名 |
| `full_name` | TEXT | ✅(DB NOT NULL) | `International Language Academy of Canada` | 沿用，留空 fallback `name` |

> 既有 `schools` 其餘欄（country / nationality_breakdown / persona_match 等）全部沿用 `IMPORT_TEMPLATES.md`，本章不動。

### 2.3 `campuses`（地點層）— 加 1 欄

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | 沿用,對映 schools.name |
| `campus_code` ⭐ | TEXT | ✅ | `TOR` / `VAN` | **校區代碼**,大寫英數,3-5 碼。SKU 第二段。同一 school 內 UNIQUE。provision 規則見 §3.2 |
| `city` | TEXT | ✅ | `Toronto` | 沿用,必與 city_info.city 一致 |

> 對應 DB：`campuses` 表需新增 `campus_code TEXT`（schema 章負責 DDL；本章假設它存在）。現行 `campuses` 無此欄（已查證 live schema）。

### 2.4 `programs`（課程層）— 用既有 `code` 欄

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | 沿用 |
| `program_code` ⭐ | TEXT | ⚠ 見 §3.3 | `GE` / `IELTS` / `PWR` | **課程代碼**,大寫英數,2-6 碼。SKU 第三段。同一 school 內 UNIQUE。**對應 DB 既有 `programs.code` 欄**(已存在,目前 NULL/未用) |
| `name` | TEXT | ✅ | `General English` | 沿用,display |
| `lessons_per_week` | INT | ✅(DB NOT NULL) | `30` | 沿用,缺 → sentinel 0 + 待補(§5) |

> 好消息：`programs.code TEXT` **已存在於 live DB**（已查證），只是從沒灌過值。rebuild 直接啟用它，不需 DDL。

### 2.5 `tuition_tiers`（可賣單元 = SKU 層）— 加 vendor 對映 + sku

這是本章核心。一筆 = **program × campus × week-band × currency × validity**。

| 欄位 | 類型 | 必填 | 範例 | 說明 |
|---|---|:---:|---|---|
| `school_name` ⚠ | TEXT | ✅ | `ILAC` | 沿用,解 program/campus |
| `program_name` ⚠ | TEXT | ✅ | `Intensive English` | 沿用,聯合解 program_id |
| `city` ⚠ | TEXT | △ | `Toronto` | 沿用。**有值**→綁 campus(校區獨立價);**留空**→ campus_id=NULL(跨校區同價),SKU 用 `ALL` 段 |
| `sku` ⭐ | TEXT | (display) | `ILAC-TOR-IELTS-W1-CAD` | **display-only**。顧問可留空,腳本重算。填了就比對(§4) |
| `weeks_min` | INT | ✅ | `1` | 沿用(也接受 `min_weeks`)。SKU 的 `Wmin` 段來源 |
| `weeks_max` | INT | △ | `11` | 沿用。NULL = 開放上限(`24+`) |
| `price_per_week` | NUMERIC | ✅ | `380` | 沿用,不含幣別符號 |
| `currency` | TEXT | ✅ | `CAD` | 沿用,ISO code。SKU 末段 |
| `valid_from` | DATE | △ | `2026-01-01` | 沿用(現行 DB 有,腳本沒讀)。NULL = 不分季 |
| `valid_until` | DATE | △ | `2026-12-31` | 沿用 |
| `season` ⭐ | TEXT | △ | `PEAK` / `OFF` | **optional**,僅當同 grain 有淡旺季兩價才需。進 SKU 的 optional `SEASON` 段(§4.3) |
| `note` | TEXT | △ | `長期優惠` | 沿用 |

> `vendor` **不重複填在 tuition_tiers**：腳本從 `school_name → schools.vendor` 帶出，避免人為不一致。

---

## 3. Parent-code 供給規則（campus_code / program_code 怎麼來）

SKU 的穩定性 100% 仰賴 parent code 的穩定性。這節定義它們**從哪來、誰決定、缺了怎麼辦**。

### 3.1 vendor slug（已凍定，5 個）

MVP 直接用既定 5 個 slug，**不需任何決策**：

| vendor slug | 全名 | 國家主軸 |
|---|---|---|
| `ILAC` | International Language Academy of Canada | Canada |
| `ILSC` | International Language Schools of Canada | Canada |
| `KAP` | Kaplan International Languages | UK / 全球 |
| `EC` | EC English Language Centres | UK / 全球 |
| `CG` | Cebu Globalization | Philippines |

規則：大寫、`^[A-Z0-9]{2,6}$`、不含連字號（連字號是 SKU 分隔符，vendor 內不可有）。

### 3.2 campus_code（腳本可半自動 provision）

campus_code 是「city → 短碼」的穩定映射。採 **顧問先填、腳本驗證** 模式，並提供一張 seed 對照表降低手動成本：

**provision 規則（優先序）**：
1. **顧問已填** `campus_code` → 直接用（驗 `^[A-Z0-9]{3,5}$`、同 school 內 UNIQUE）。
2. **顧問留空** → 腳本查 `CAMPUS_CODE_SEED`（內建 city→code 對照，見下）。命中 → 用，並 WARN「自動帶入 campus_code=TOR」。
3. **seed 也沒有** → 腳本**用 city 前 3 碼大寫**當 fallback（`Brisbane`→`BRI`），WARN 並列入「待 jojo 確認 code 清單」。**不 fabricate 語意**，純機械 derive，可事後改。

**`CAMPUS_CODE_SEED`（腳本內建，可擴充）**：

| city | code | city | code |
|---|---|---|---|
| Toronto | TOR | London | LON |
| Vancouver | VAN | Manchester | MAN |
| Sydney | SYD | New York | NYC |
| Brisbane | BRI | Boston | BOS |
| Cebu | CEB | Los Angeles | LAX |

> ⚠ campus_code 一旦進過 production SKU 就**凍結**（改 code = 換 SKU = 報價對不回）。所以 fallback 進來的 code 要在「待 jojo 確認」清單，趁早定案。

### 3.3 program_code（**content decision，需 jojo 拍板**）🚩

program_code 無法機械決定，因為「同一個 General English 在 ILAC 叫 Intensive、在 EC 叫 General」這種命名差異是**商業/內容判斷**，不是字串規則。

**處理規則**：
1. 顧問填了 `program_code` → 用（驗 `^[A-Z0-9]{2,6}$`、同 school 內 UNIQUE）。
2. 留空 → 腳本**不 fabricate code**。改用 program_name slug 化的 fallback（取英數、大寫、截 6 碼，`IELTS Preparation`→`IELTSP`），WARN 並**強制列入「待 jojo 補 program_code 清單」**。
3. 這份清單是 §5「待 jojo 補真值清單」的一個子類，**標記為 content decision（非單純缺值）**：jojo 要決定全 vendor 統一的 program_code 字典（建議 `GE`=General English、`IELTS`、`PWR`=Power、`BUS`=Business、`CAM`=Cambridge…），讓跨 vendor 報價可比較。

> 🚩 **OPEN DECISION（給 jojo）**：是否要一份**跨 vendor 統一的 program_code 字典**？
> - 統一字典：`ILAC-TOR-GE-...` 和 `EC-LON-GE-...` 都用 `GE`，未來「跨校比同類課程」一句 SQL 搞定。
> - 各 vendor 自訂：貼近 vendor 官方命名，但跨校比較要 mapping 表。
> 本章**預設走統一字典**，但這需 jojo 確認。在拍板前，腳本用 name-slug fallback 並全部 WARN，不擋灌入。

---

## 4. Deterministic SKU 生成規則

SKU 由**腳本端**從已解析的 canonical 欄位算出，**永不信任手填的 sku 欄**（手填只用來人工核對）。

### 4.1 Canonical 格式

```
VENDOR-CAMPUS-PROGRAM-Wmin-CUR[-SEASON]
```

| 段 | 來源 | 規則 | 範例 |
|---|---|---|---|
| `VENDOR` | `schools.vendor`（經 school_name 帶出） | `^[A-Z0-9]{2,6}$` | `ILAC` |
| `CAMPUS` | `campus_code`（city 為空時用 `ALL`） | `^[A-Z0-9]{3,5}$` 或字面 `ALL` | `TOR` / `ALL` |
| `PROGRAM` | `program_code` | `^[A-Z0-9]{2,6}$` | `IELTS` |
| `Wmin` | `weeks_min`，前綴 `W` | `W` + 整數 | `W1` / `W12` / `W24` |
| `CUR` | `currency`，ISO | `^[A-Z]{3}$` | `CAD` |
| `SEASON`（optional） | `season` 欄，僅存在時加 | `^[A-Z]{2,4}$` | `PEAK` / `OFF` |

完整 SKU regex（validation gate 用）：

```
^[A-Z0-9]{2,6}-([A-Z0-9]{3,5}|ALL)-[A-Z0-9]{2,6}-W\d{1,3}-[A-Z]{3}(-[A-Z]{2,4})?$
```

### 4.2 為什麼用 `Wmin` 而不是整個 week-band

一筆 tier 的 grain 已含 `weeks_min` + `weeks_max`，但 SKU 只取 `Wmin` 當識別段，理由：
- week-band 是**連續不重疊區間**（1–11 / 12–23 / 24+），`weeks_min` 已足以唯一定位該 band（同 program×campus×currency 下 `weeks_min` 不會重複——這正是 §6 的 overlap gate 保證的）。
- `weeks_max` 可能是 NULL（開放上限），放進 SKU 會產生 `W24-` 這種尾巴，反而不穩。
- 報價引擎（第 04 章）查 tier 用 `weeks BETWEEN weeks_min AND COALESCE(weeks_max, 9999)`，SKU 只需穩定指回**這一行**，不需編碼整個區間。

### 4.3 SEASON 段：何時出現

- **預設不加**：絕大多數 tier 沒有淡旺季差價，SKU 不帶 SEASON。
- **只有當同一 `VENDOR-CAMPUS-PROGRAM-Wmin-CUR` grain 出現 ≥2 筆且靠 `season` 區分**（例 PEAK 漲價、OFF 原價）才加 SEASON 段，否則兩筆會 SKU 撞號被 §6 reject。
- 規則：若該 grain 只有 1 筆，`season` 欄留空，SKU 無 SEASON 段；若 ≥2 筆，**每筆都必須有非空 season**，否則 reject（避免一筆有季一筆沒季導致 SKU 一個帶段一個不帶段、語意不對稱）。

### 4.4 DB 上的唯一性（兩道 UNIQUE）

schema 章負責建，灌入章依賴：

```sql
-- A. SKU 字串唯一(report-facing 穩定 id,報價 snapshot 存它)
ALTER TABLE tuition_tiers ADD COLUMN sku TEXT;
CREATE UNIQUE INDEX uq_tuition_sku ON tuition_tiers (sku);

-- B. 完整 grain 唯一(防「SKU 算錯但 grain 撞號」的雙保險)
CREATE UNIQUE INDEX uq_tuition_grain ON tuition_tiers
  (program_id, COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid),
   weeks_min, currency, COALESCE(season, ''));
```

> 兩道 UNIQUE 互為冗餘校驗：SKU 是 grain 的 deterministic 函數，理論上 A 唯一 ⟺ B 唯一。若兩者打架（A 過 B 不過，或反之），代表 SKU 生成函數有 bug，灌入**硬 fail**，不寫 DB。

---

## 5. delete+reinsert → UPSERT 的切換

### 5.1 現行（要廢除）

`import-from-sheets.js` 現在是：
- `insertOrPlan()` 純 `supabase.from(t).insert()`。
- 重跑前若 DB 非空 → `abort`（要嘛全清要嘛不跑）。
- `--truncate` = `DELETE` 全六表再重插 → **每次重灌都換一批新 UUID**，任何引用 tier id 的東西（報價草稿、LP 快照）全部斷鏈。

### 5.2 Rebuild（UPSERT on conflict）

每張表用各自的 **natural key** 做 `upsert`，conflict 時 update 非 key 欄、保留 `id`：

| 表 | conflict target（natural key） | 備註 |
|---|---|---|
| `schools` | `(vendor, name)` | 一 vendor 一品牌名唯一 |
| `city_info` | `(city)` | city 全域唯一 |
| `campuses` | `(school_id, campus_code)` | 同校 campus_code 唯一 |
| `programs` | `(school_id, code)` | 同校 program_code 唯一 |
| `tuition_tiers` | **`(sku)`** | ⭐ 本章主角 |
| `housing` | `(school_id, city, type, subtype)` | 無天然 code,用語意四元組 |

腳本寫入改為（pseudo）：

```ts
await supabase.from('tuition_tiers')
  .upsert(rows, { onConflict: 'sku', ignoreDuplicates: false })
  .select('id, sku');
```

**效果**：
- **可重複跑**：同一份 sheet 跑 N 次,結果一致,id 不變。
- **可改價**：改 sheet 的 `price_per_week` 再跑 → UPSERT update 同一行,`id`/`sku` 不動,報價/LP 引用不斷。
- **可增量**：新增一筆 tier → 只 insert 那一筆,其餘 update（值相同等同 no-op）。
- **不再需要 `--truncate`**：保留 `--truncate` 旗標但改成「明確 opt-in 的危險操作」,日常絕不用。

### 5.3 刪除語意（soft 處理）

UPSERT 不會刪掉「sheet 已移除但 DB 還在」的 tier。rebuild 規則：
- 灌入腳本**不自動硬刪** tier（避免誤刪斷報價鏈）。
- 改報「**orphan-in-DB 清單**」：DB 有、本次 sheet 無的 sku，列出來給 jojo。
- 真要下架某 tier → 未來加 `is_active BOOL`（schema 章決定），灌入時 sheet 缺的標 `is_active=false`，**不刪行**。本章標為 OPEN DECISION。

---

## 6. Validation Layer（11 道 gate）

dry-run 跑全部，任何 **blocking** gate 有命中就不寫 DB；**warn** 級別不擋。沿用現行 `errors[]` / `warnings[]` 收集模型。

| # | Gate | 級別 | 規則 |
|---|---|:---:|---|
| 1 | **SKU regex** | block | 算出的 SKU 必須匹配 §4.1 完整 regex |
| 2 | **SKU collision** | block | 同一次灌入內,兩筆算出相同 SKU → reject（列出衝突兩列） |
| 3 | **grain collision** | block | §4.4 B 的 grain 在本批內重複 → reject |
| 4 | **手填 vs 算出 SKU 不符** | warn | 顧問填的 `sku` ≠ 腳本算出 → WARN,以算出為準 |
| 5 | **week-band overlap** | block | 同 `program_id × campus_id × currency × season` 下,`[weeks_min, weeks_max]` 區間不可重疊（NULL max 視為 ∞） |
| 6 | **week-band gap** | warn | 同上分組下區間有缺口（如 1–11 後直接 24+,缺 12–23）→ WARN（可能是真實沒這檔,顧問確認） |
| 7 | **every program has ≥1 tier** | block | 每筆 `programs` 至少要被一筆 `tuition_tiers` 引用,否則該課程無法報價 → reject（列出無價 program） |
| 8 | **parent-code resolvable** | block | tier 的 (school,program_name)→program_code、(school,city)→campus_code 必須都解得到 |
| 9 | **NULL-FK / orphan** | block | program_id / campus_id（非 NULL 時）/ school_id 必須對得到 parent;city 必須在 city_info |
| 10 | **currency ISO** | block | 在 `VALID_CURRENCIES` 白名單內（沿用現行 `CAD/USD/GBP/AUD/EUR/NZD/JPY/TWD/IEP/MTL`） |
| 11 | **NOT NULL sentinel 標記** | warn | DB NOT NULL 但 sheet 缺值的欄（`lessons_per_week` 等）→ 填 sentinel(§7)並列「待補真值」 |

> Gate 5（overlap）是 SKU 穩定性的隱形支柱：唯有區間不重疊,`Wmin` 才能唯一定位 band(§4.2)。
> 灌入後再跑 read-only 的 `validate-import.sql`(carry-over,需擴充加 sku 唯一性、every-program-has-tier 兩段)做 DB 端覆驗。

---

## 7. Sentinel / Placeholder 規則（不 fabricate）

完全 carry-over `scripts/data-loading-rules.md` 的鐵則，並對 SKU 場景補強：

| 缺值類型 | 處理 | 是否擋灌入 |
|---|---|:---:|
| **DB NOT NULL 但 sheet 缺**(`lessons_per_week` / `lesson_minutes`) | 存 sentinel `0`;LP 渲染時把 0 當「未提供」顯示 `—`,**絕不顯示成假數字** | 否,列待補 |
| **內容欄缺**(`nationality_breakdown` / `persona_match`) | 該 LP section 顯示「請洽顧問取得」placeholder,**不編造比例** | 否 |
| **格式跑掉的列**(欄位錯位) | 依上下文機械還原,回報「修了哪幾列」;無法合理還原才停 | 視情況 |
| **campus_code 缺** | seed → 命中用,沒命中用 city 前 3 碼 fallback + WARN | 否,列待確認 |
| **program_code 缺** | name-slug fallback + WARN | 否,列 **content decision 待 jojo** |
| **price / currency / weeks_min 缺** | 這是 SKU 必要段,**沒得 fabricate** → block | ✅ 擋 |

**鐵律**：SKU 的五個必要段(vendor/campus/program/Wmin/cur)裡,vendor/campus/program 可用機械 fallback(可事後改),但 **price/weeks/currency 是真實事實,缺了就 block**——顧問會照著對學生講,假數字風險最高。

---

## 8. Worked Example：灌一個校區 end-to-end（ILAC Toronto）

### 8.1 顧問填的 sheet（節錄）

**schools**：

| vendor | name | full_name | country |
|---|---|---|---|
| ILAC | ILAC | International Language Academy of Canada | Canada |

**campuses**：

| school_name | campus_code | city | metro_station |
|---|---|---|---|
| ILAC | TOR | Toronto | Yonge |

**programs**：

| school_name | program_code | name | lessons_per_week |
|---|---|---|---|
| ILAC | IELTS | IELTS Preparation | 32 |
| ILAC | GE | Intensive English | 30 |

**tuition_tiers**（顧問把 `sku` 留空，讓腳本算）：

| school_name | program_name | city | weeks_min | weeks_max | price_per_week | currency |
|---|---|---|---|---|---|---|
| ILAC | IELTS Preparation | Toronto | 1 | 11 | 400 | CAD |
| ILAC | IELTS Preparation | Toronto | 12 | 23 | 380 | CAD |
| ILAC | Intensive English |  | 1 | 11 | 380 | CAD |
| ILAC | Intensive English |  | 12 | 23 | 360 | CAD |
| ILAC | Intensive English |  | 24 |  | 340 | CAD |

### 8.2 腳本解析 + 算 SKU

| program_name | city→campus | weeks_min | 算出的 SKU |
|---|---|---|---|
| IELTS Preparation | Toronto→`TOR` | 1 | `ILAC-TOR-IELTS-W1-CAD` |
| IELTS Preparation | Toronto→`TOR` | 12 | `ILAC-TOR-IELTS-W12-CAD` |
| Intensive English | (空)→`ALL` | 1 | `ILAC-ALL-GE-W1-CAD` |
| Intensive English | (空)→`ALL` | 12 | `ILAC-ALL-GE-W12-CAD` |
| Intensive English | (空)→`ALL` | 24 | `ILAC-ALL-GE-W24-CAD` |

### 8.3 validation 結果

- Gate 1 SKU regex：5/5 pass。
- Gate 2/3 collision：無撞號 pass。
- Gate 5 overlap：IELTS 的 1–11 / 12–23 不重疊 pass；GE 的 1–11 / 12–23 / 24–∞ 不重疊 pass。
- Gate 7 every-program-has-tier：IELTS 有 2 筆、GE 有 3 筆 pass。
- Gate 9 NULL-FK：Toronto 在 city_info 有列 pass。

### 8.4 UPSERT 結果（首跑）

```
✓ schools         1 (insert)
✓ campuses        1 (insert)
✓ programs        2 (insert)
✓ tuition_tiers   5 (insert, 5 new SKUs)
```

### 8.5 重跑（顧問把 IELTS W1 改價 400→420）

只改 `price_per_week`，再跑 `--commit`：

```
= schools         1 (no change)
= campuses        1 (no change)
= programs        2 (no change)
✓ tuition_tiers   5 (1 updated: ILAC-TOR-IELTS-W1-CAD price 400→420, id 不變)
```

→ `ILAC-TOR-IELTS-W1-CAD` 這行的 `id` 與 `sku` **完全不動**，只 `price_per_week` 改了。任何引用此 SKU 的報價草稿/LP 快照不斷鏈。這就是 UPSERT-on-SKU 相對 delete+reinsert 的決定性差異。

---

## 9. 未來 SCHOOL_DATA ETL 如何機械對齊（第 08 章接口）

`etl-school-data-plan.md` 規劃把報價系統的 `SCHOOL_DATA`（5 vendor × ~70 campus × courses/accomm/fees，478KB JSON）灌進 CMS。一旦本章 SKU 機制就位，那條 ETL 從「需要人工映射」降級成「純機械展開」：

| SCHOOL_DATA 結構 | → CMS | SKU 對映 |
|---|---|---|
| `SCHOOL_DATA["EP"]` | `schools.vendor='EP'`（字串，不建 vendors 表） | SKU 第 1 段 |
| `SCHOOL_DATA["EP"]["Brisbane"]` | `campuses.campus_code='BRI'`（seed/fallback） | SKU 第 2 段 |
| `...courses[i]` | `programs.code`（需 jojo program_code 字典） | SKU 第 3 段 |
| `...courses[i].tiers[j]` `{wf,wt,price}` | `tuition_tiers` `weeks_min=wf` | SKU `Wmin` 段 |
| `course.currency` | `tuition_tiers.currency` | SKU 末段 |
| `tier.peak` ≠ 0 | `season='PEAK'` | SKU optional SEASON 段 |

ETL 腳本只要：(1) 對每個 vendor×campus×course×tier 套同一個 `buildSku()` 函數（與本章灌入腳本**共用同一份純函數**），(2) 走同 11 道 validation gate，(3) 走同 UPSERT-on-sku。**`SCHOOL_DATA` 的 478KB 因此變成一次 dry-run + 一次 commit 就能灌完的純資料**，不需逐校手填 sheet。

> 對齊紅線（沿用 etl plan）：ETL 對 production 跑前必須 dry-run + backup + jojo 授權；`tier.peak`/`fixed`/`unit`/`category` 這些報價系統獨有欄如何落 CMS schema，屬第 03/08 章決策，本章只保證 SKU 段對得上。

---

## 10. Carryover / 重建清單

**直接 carry-over（不重寫）**：
- `import-from-sheets.js` 的 header-based 對映、型別轉換 helpers（`csvArr`/`csvBool`/`csvNum`/`csvInt`/`csvJsonArr`/`normalizeCurrency`）、`errors[]`/`warnings[]` 收集、FK-safe 寫入順序、service_role 認證、dry-run 預設。
- `validate-import.sql` 的 7 區塊（FK 孤兒、國籍完整性、幣別 ISO、NOT NULL spot check、persona master list）——**擴充**加 sku 唯一性 + every-program-has-tier 兩段。
- `data-loading-rules.md` 的 sentinel / 不 fabricate / 待補真值清單機制——**全留**。

**重建（rebuild）**：
- `insertOrPlan()` 純 insert → 全表改 **UPSERT on natural key**。
- 移除「DB 非空就 abort」與日常 `--truncate` 依賴。
- 新增 `buildSku()` 純函數（灌入 + 未來 ETL 共用）。
- 新增 11 道 validation gate（現行只有 FK/必填/幣別/persona 約 6 道）。
- template 加 `vendor` / `campus_code` / `program_code` / `sku`(display) / `season` 欄。
- schema 依賴：`tuition_tiers.sku` + 兩道 UNIQUE、`campuses.campus_code`（新欄）、啟用既有 `programs.code`、`schools.vendor`（新欄）。

---

## 11. 給 jojo 的 OPEN DECISIONS（彙整）

1. **program_code 字典**：跨 vendor 統一（推薦）還是各 vendor 自訂？決定 SKU 第 3 段語意。在拍板前腳本走 name-slug fallback + WARN，不擋灌入。
2. **下架語意**：tier 從 sheet 移除時，要不要加 `is_active BOOL` 軟下架，而非硬刪？（本章預設不硬刪、只報 orphan-in-DB 清單。）
3. **campus_code seed 表**：確認 §3.2 內建 10 個 city→code 對照是否符合放洋慣用簡碼；fallback 進來的待確認 code 趁早定案（一旦進 production SKU 即凍結）。
4. **SEASON 維度範圍**：除了 PEAK/OFF，是否有第三種季別（如 summer-only 課）需進 SKU？影響 §4.3。
