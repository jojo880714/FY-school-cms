# scripts/ — Phase 14c 語校資料匯入

兩種匯入 pipeline,共用驗證 SQL:

| 腳本 | 來源 | 狀態 |
|---|---|:---:|
| **`import-from-sheets.js`** | 直連 Google Sheets API | ⭐ 主路徑 |
| `import-data.js` | 6 個 CSV 檔案 | 備援 / 離線測試用 |

兩支都跑同一份目標 schema、同樣的 FK 解析邏輯、同樣的驗證 SQL。差別只在資料從哪讀。

---

## 檔案結構

```
scripts/
├── import-from-sheets.js    Sheets 直連匯入主腳本(Phase 14c primary)
├── import-data.js           CSV 匯入腳本(備援)
├── validate-import.sql      匯入後驗證 SQL(read-only,共用)
├── README.md                本文件
└── sample-data/             CSV 備援腳本的測試樣本
    ├── schools.csv
    ├── city_info.csv
    ├── campuses.csv
    ├── programs.csv
    ├── tuition_tiers.csv
    └── housing.csv
```

---

## ⭐ 主路徑:Sheets 直連(`import-from-sheets.js`)

### 用法

```bash
# 1. dry-run(預設,只驗證 + 印筆數,不寫 DB)
node scripts/import-from-sheets.js

# 2. 真實匯入(DB 預設要是空的,有資料會 abort)
node scripts/import-from-sheets.js --commit

# 3. 重灌(先 DELETE 6 個 table 再寫)— 破壞性,先確認再跑
node scripts/import-from-sheets.js --commit --truncate

# 4. 覆寫預設 spreadsheet ID
node scripts/import-from-sheets.js --sheet-id <google_sheet_id>

# 5. 印 stack trace
node scripts/import-from-sheets.js --verbose
```

**安全預設**:沒加 `--commit` 一律當 dry-run,只驗證不寫。

### 認證設定(三選一,優先序由上而下)

複製 `.env.example` 成 `.env.local` 並填入。下列三個任一即可:

**選項 1:service account 金鑰檔(推薦)**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```
1. Google Cloud Console → 建 service account → 下載 JSON 金鑰
2. 把試算表「檢視」分享給 SA email(`xxx@PROJECT.iam.gserviceaccount.com`)
3. JSON 檔放本機,路徑填上

**選項 2:service account 金鑰內容(避免管檔)**
```bash
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```
用 `jq -c . sa.json` 把整段 JSON 壓成一行。同樣需要「分享給 SA email」。

**選項 3:API key(僅讀「知道連結即可檢視」的 sheet)**
```bash
GOOGLE_SHEETS_API_KEY=AIza...
```
Google Cloud Console → API & Services → Credentials → Create API key

### Supabase 寫入認證

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # service_role,繞 RLS
```
`--commit` 才會用到。ANON key 會被 RLS 擋,**必須用 service_role**。
來源:Supabase Studio → Project Settings → API → service_role secret。

### 試算表結構約定

**6 個 tab 名稱一字不差**(缺一或多出未知 tab 直接報錯停止):
- `schools` / `city_info` / `campuses` / `programs` / `tuition_tiers` / `housing`

每 tab 第 1 列為 header,**欄位以名稱對映**(欄序隨意,重排不會壞)。
空 cell → null,逗號分隔陣列欄空 → null。

### 寫入流程

腳本依 FK 安全順序:
```
schools → city_info → campuses → programs → tuition_tiers → housing
```

`--commit` 模式會先 SELECT 各表現有筆數;**任一非空 → 預設 abort**,避免重複插入。要重灌需顯式 `--truncate`(會 DELETE 全部 6 個 table)。

### 已知的設計選擇

- **國籍欄位單寫**:只讀 sheet 的 `nationality_breakdown` 寫進 DB。sheet 若還有 `top_nationalities` 欄(18b 之前殘留)**完全 ignore** — DB 該欄已在 Phase 18b sub-track 1 DROP(commit `cfcf493`)。
- **生活費寫新欄不 mirror**:寫 `cost_of_living_monthly` + `cost_of_living_currency`。舊欄 `cost_of_living_monthly_cad` 已 Phase 18b backlog DROP(EF v28 已切到新欄),不再需要 mirror。
- **`tuition_tiers.campus_id` 缺 city**:DB 該欄 nullable → 設 null + WARN(非 blocking),語意是「課程跨校區同價」。
- **`housing.city` 缺**:DB NOT NULL → blocking error(報出來,等顧問補 city)。
- **integer 欄位 round + warn**:`cost_of_living_monthly` / `founded` / `nationality_count` / `class_size_*` 等 integer 欄若 sheet 出現非整數值,自動 round 並 WARN(避免靜默截斷)。

### 顧問跑的順序

1. 備認證(SA 金鑰 + sheet 分享 SA email,或設好 OAuth / API key)
2. `node scripts/import-from-sheets.js`(dry-run)→ 看 error / warn,有的話**回去 sheet 補資料**
3. dry-run 乾淨後加 `--commit`(若 DB 已有資料 → 加 `--truncate`)
4. 到 [Supabase Studio SQL Editor](https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/sql/new) 跑 `scripts/validate-import.sql` 驗證

---

## 備援路徑:CSV(`import-data.js`)

跟主路徑同邏輯,只是資料從 CSV 檔讀。離線測試 / sheet 故障時用。

```bash
# dry-run(用內建 sample-data/)
node scripts/import-data.js

# dry-run 指定資料夾
node scripts/import-data.js --data-dir path/to/real-csvs

# 真實匯入
node scripts/import-data.js --data-dir path/to/real-csvs --commit

# 不跳範例列(偵錯)
node scripts/import-data.js --keep-samples
```

CSV 寫法見 [IMPORT_TEMPLATES.md](../IMPORT_TEMPLATES.md)。`sample-data/` 內有 2 所虛構學校的範本可參考。

---

## IMPORT_TEMPLATES.md ↔ 真實 DB 的差異(兩支腳本都已處理)

| 欄位 | 文件 | 真實 DB | 腳本處理 |
|---|---|---|---|
| `schools.full_name` | 選填 | **NOT NULL** | 留空 → fallback `name` |
| `programs.lessons_per_week` | 沒提 | **NOT NULL** | CSV/sheet 必填 |
| `programs.lesson_minutes` | 沒提 | NOT NULL,default 50 | 接受空,用 default |
| `housing.city` | 沒提 | **NOT NULL** | 必填,缺 → blocking |
| `tuition_tiers.weeks_min/max` | `min_weeks/max_weeks` | DB 是 `weeks_min/max` | 兩種名字都接受 |
| `tuition_tiers.campus_id` | 沒提 | 有,nullable | sheet 加可選 `city` → 解 campus_id;無則 null + WARN |

---

## 匯入後驗證 SQL(`validate-import.sql`)

`--commit` 跑完後,到 [Supabase Studio SQL Editor](https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/sql/new) 整段貼或一段段跑。

7 大檢查區塊:
1. **各表筆數**(對照腳本 stdout 摘要)
2. **FK 孤兒檢查**(全 0)
3. **國籍欄位完整性**(每筆 schools 都有 nationality_breakdown,每條目都有 pct)
4. **city_info 新欄 + CAD mirror**(CAD 城市 _cad mirror 完整)
5. **幣別都是 ISO code**(無 `$` / `£` 符號)
6. **NOT NULL 完整性 spot check**
7. **persona_match 對 master list 驗證**(7 個有效 tag,UI-only 4 個不該出現)

---

## 不在本腳本範圍的事

(Phase 18b backlog 全部落地於 2026-06-16 commit chain,EF v28)

---

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-15 | Phase 14c 初版 — CSV 路徑 `import-data.js` 就緒 |
| 2026-06-15 | Phase 18b sub-track 1 — 移除 `top_nationalities` 雙寫(該欄位已 DROP) |
| 2026-06-16 | Phase 14c 加 Sheets 直連 `import-from-sheets.js`(主路徑);共用 `validate-import.sql`;CSV 路徑改為備援 |
