# scripts/ — Phase 14c 語校資料匯入

Node.js 腳本,把顧問填好的 6 張 CSV 一次匯入 Supabase。

> 本腳本是 Phase 14c 的「腳本就緒」階段產出 — 已用樣本資料驗證 pipeline,**但還沒對正式 DB 匯入過任何真實資料**。等顧問填完 6 張 Sheets / CSV 才會跑 `--commit`。

---

## 檔案結構

```
scripts/
├── import-data.js          匯入主腳本(本檔)
├── README.md               本文件
└── sample-data/            自我測試樣本(2 所虛擬學校 + 範例列跳過測試)
    ├── schools.csv
    ├── city_info.csv
    ├── campuses.csv
    ├── programs.csv
    ├── tuition_tiers.csv
    └── housing.csv
```

---

## 用法

```bash
# 1. dry-run(預設,不寫 DB)— 用內建樣本資料驗證 pipeline
node scripts/import-data.js

# 2. dry-run 指定資料夾
node scripts/import-data.js --data-dir path/to/real-csvs

# 3. 真實匯入(需 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
node scripts/import-data.js --data-dir path/to/real-csvs --commit

# 4. 不跳範例列(偵錯用)
node scripts/import-data.js --keep-samples

# 5. 印 stack trace
node scripts/import-data.js --verbose
```

**安全預設**:沒加 `--commit` 一律當 dry-run,只解析+驗證+印筆數,不碰 DB。

---

## CSV 擺放規則

每張表一個檔,**檔名必須**是:

```
schools.csv        city_info.csv      campuses.csv
programs.csv       tuition_tiers.csv  housing.csv
```

第一列為 header,欄位名對齊 [IMPORT_TEMPLATES.md](../IMPORT_TEMPLATES.md)(下方有差異說明)。

---

## IMPORT_TEMPLATES.md ↔ 真實 DB 的差異(腳本已處理)

腳本實作時對照線上 schema,發現幾處 IMPORT_TEMPLATES.md 沒提但 DB 實際要求的欄位 — 腳本會明確驗證或 fallback:

| 欄位 | IMPORT_TEMPLATES | 真實 DB | 腳本處理 |
|---|---|---|---|
| `schools.full_name` | 選填 | **NOT NULL** | CSV 留空 → fallback 用 `name` 補 |
| `programs.lessons_per_week` | 沒提 | **NOT NULL** | CSV 必填,否則錯誤回報 |
| `programs.lesson_minutes` | 沒提 | NOT NULL,default 50 | 接受空值,用 default 50 |
| `programs.suitable_for` | 沒提 | TEXT(不是 ARRAY) | **目前未在 CSV 支援** — 與 `schools.suitable_for[]`(陣列)同名同欄位,需要才補 |
| `housing.city` | 沒提 | **NOT NULL** | CSV 必填,否則錯誤 |
| `tuition_tiers.min_weeks` / `max_weeks` | 用這名字 | DB 是 `weeks_min` / `weeks_max` | CSV 兩種名字都接受(`r.weeks_min ?? r.min_weeks`) |
| `tuition_tiers.campus_id` | 沒提 | 有,nullable | CSV 加可選 `city` 欄 → 有就解 campus_id,無則 NULL(課程跨校區同價) |

---

## 國籍欄位

`schools.nationality_breakdown`(必填):顧問填的 JSON 陣列,每筆 `{flag, name, pct}`,`pct` 必填數字。

> **Phase 18b 更新**:`top_nationalities` 已 DROP,本腳本不再雙寫。Edge Function Section 10 國籍卡直接讀 `nationality_breakdown`,顯示 flag + name + pct + 條狀圖。

CSV 寫法(JSON 字串):

```csv
nationality_breakdown
"[{""flag"":""🇪🇸"",""name"":""西班牙"",""pct"":24},{""flag"":""🇧🇷"",""name"":""巴西"",""pct"":18}]"
```

Excel / Google Sheets 出 CSV 時雙引號會自動處理。**`pct` 必須是數字**(不是字串),否則腳本拒絕。

---

## 範例列跳過機制

腳本會跳過下列列(預設 ON,`--keep-samples` 關閉):

1. **任一儲存格以 marker 開頭**:`__SAMPLE__`、`__EXAMPLE__`、`#`、`//`
2. **主鍵欄是模板示範名**:`ILAC`、`Kaplan`、`EC`(來自 IMPORT_TEMPLATES.md 範例 rows)

要保留示範資料當真實匯入(罕見情境):換掉 `name` / `school_name` 為其他值,或加 `--keep-samples`。

---

## env 設定

腳本會自動讀 `.env.local`、`.env`(`.gitignore` 保護中)。需要的變數:

```bash
# dry-run 只需名字存在即可(不會連線)
# --commit 模式必須真實有效
SUPABASE_URL=https://uxxpagylkdljjaxslmyj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # ← 真實匯入用,有 RLS bypass
# 或備援(實際匯入時可能被 RLS 擋,只當 fallback)
SUPABASE_ANON_KEY=eyJ...
```

**RLS 警告**:schools / campuses / programs / tuition_tiers / housing / city_info 在線上是否開 RLS 影響寫入。若用 `anon` key 寫不進去,改用 `service_role` key。

---

## 匯入後驗證 SQL

`--commit` 跑完後,請到 [Supabase Studio SQL Editor](https://supabase.com/dashboard/project/uxxpagylkdljjaxslmyj/sql/new) 跑下列 read-only 驗證(預期值寫在註解):

### 1. 各表筆數

```sql
SELECT 'schools'       AS table, COUNT(*) AS rows FROM schools
UNION ALL SELECT 'city_info',     COUNT(*) FROM city_info
UNION ALL SELECT 'campuses',      COUNT(*) FROM campuses
UNION ALL SELECT 'programs',      COUNT(*) FROM programs
UNION ALL SELECT 'tuition_tiers', COUNT(*) FROM tuition_tiers
UNION ALL SELECT 'housing',       COUNT(*) FROM housing
ORDER BY 1;
-- 預期:對照腳本 stdout 印的摘要數字
```

### 2. FK 孤兒檢查

```sql
-- campuses 沒對到 schools
SELECT 'campuses orphan' AS what, COUNT(*) AS n
FROM campuses c LEFT JOIN schools s ON s.id = c.school_id
WHERE c.school_id IS NOT NULL AND s.id IS NULL;
-- 預期:0

-- programs 沒對到 schools
SELECT 'programs orphan', COUNT(*)
FROM programs p LEFT JOIN schools s ON s.id = p.school_id
WHERE p.school_id IS NOT NULL AND s.id IS NULL;
-- 預期:0

-- housing 沒對到 schools
SELECT 'housing orphan', COUNT(*)
FROM housing h LEFT JOIN schools s ON s.id = h.school_id
WHERE h.school_id IS NOT NULL AND s.id IS NULL;
-- 預期:0

-- tuition_tiers 沒對到 programs
SELECT 'tuition no program', COUNT(*)
FROM tuition_tiers t LEFT JOIN programs p ON p.id = t.program_id
WHERE t.program_id IS NOT NULL AND p.id IS NULL;
-- 預期:0

-- tuition_tiers 有 campus_id 但沒對到 campuses
SELECT 'tuition no campus', COUNT(*)
FROM tuition_tiers t LEFT JOIN campuses c ON c.id = t.campus_id
WHERE t.campus_id IS NOT NULL AND c.id IS NULL;
-- 預期:0
```

### 3. 國籍欄位完整性

```sql
-- 每筆 schools 都有 nationality_breakdown(必填)
SELECT
  COUNT(*) FILTER (WHERE nationality_breakdown IS NULL
                      OR jsonb_array_length(nationality_breakdown) = 0) AS empty_breakdown
FROM schools;
-- 預期:0
```

```sql
-- 每筆 nationality_breakdown 條目都有 pct(數字)
SELECT s.name, item
FROM schools s,
     jsonb_array_elements(s.nationality_breakdown) item
WHERE NOT (item ? 'pct')
   OR (item->>'pct') IS NULL
   OR jsonb_typeof(item->'pct') <> 'number';
-- 預期:0 列
```

### 4. 幣別都是 ISO code

```sql
SELECT DISTINCT currency, COUNT(*) AS n
FROM tuition_tiers GROUP BY 1
UNION ALL
SELECT DISTINCT currency, COUNT(*)
FROM housing GROUP BY 1
ORDER BY 1;
-- 預期:只看到 CAD/USD/GBP/AUD/EUR/NZD/JPY/TWD 之類 3-letter code,無 $ / £ / 等符號
```

### 5. NOT NULL 完整性 spot check

```sql
SELECT
  COUNT(*) FILTER (WHERE name IS NULL)              AS schools_no_name,
  COUNT(*) FILTER (WHERE full_name IS NULL)         AS schools_no_full_name,
  COUNT(*) FILTER (WHERE country IS NULL)           AS schools_no_country
FROM schools;
-- 預期:全 0

SELECT
  COUNT(*) FILTER (WHERE city IS NULL)              AS housing_no_city,
  COUNT(*) FILTER (WHERE type IS NULL)              AS housing_no_type,
  COUNT(*) FILTER (WHERE price_per_week IS NULL)    AS housing_no_price
FROM housing;
-- 預期:全 0

SELECT
  COUNT(*) FILTER (WHERE lessons_per_week IS NULL)  AS programs_no_lpw
FROM programs;
-- 預期:0
```

---

## 不在本腳本範圍的事

- `city_info.cost_of_living_monthly_cad` 改名 / 廢棄 → Phase 14c 後續,需另外決策
- LP A/B/D 樣式分派 → Phase 18b 後續(sub-track 2,需先設計三種版型)
- 對正式 DB 跑 `--commit`(等顧問真實資料到位才執行)

## 修訂歷史

| 日期 | 變更 |
|---|---|
| 2026-06-15 | Phase 14c 初版 — 腳本就緒 |
| 2026-06-15 | Phase 18b sub-track 1 — 移除 `top_nationalities` 雙寫(該欄位已 DROP) |

---

