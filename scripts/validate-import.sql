-- Phase 14c — 匯入後驗證 SQL(read-only)
-- 用法:在 Supabase Studio SQL Editor 一段段跑(或整段貼一次)
-- 配套:scripts/import-from-sheets.js / scripts/README.md

-- ──────────────────────────────────────────────────────────────────────
-- 1. 各表筆數(對照腳本 stdout 摘要)
-- ──────────────────────────────────────────────────────────────────────
SELECT 'schools'       AS table, COUNT(*) AS rows FROM schools
UNION ALL SELECT 'city_info',     COUNT(*) FROM city_info
UNION ALL SELECT 'campuses',      COUNT(*) FROM campuses
UNION ALL SELECT 'programs',      COUNT(*) FROM programs
UNION ALL SELECT 'tuition_tiers', COUNT(*) FROM tuition_tiers
UNION ALL SELECT 'housing',       COUNT(*) FROM housing
ORDER BY 1;
-- 預期:對照 import-from-sheets.js stdout 印的摘要數字

-- ──────────────────────────────────────────────────────────────────────
-- 2. FK 孤兒檢查(全部預期為 0)
-- ──────────────────────────────────────────────────────────────────────

-- campuses 沒對到 schools
SELECT 'campuses orphan' AS what, COUNT(*) AS n
FROM campuses c LEFT JOIN schools s ON s.id = c.school_id
WHERE c.school_id IS NOT NULL AND s.id IS NULL;

-- programs 沒對到 schools
SELECT 'programs orphan' AS what, COUNT(*) AS n
FROM programs p LEFT JOIN schools s ON s.id = p.school_id
WHERE p.school_id IS NOT NULL AND s.id IS NULL;

-- housing 沒對到 schools
SELECT 'housing orphan' AS what, COUNT(*) AS n
FROM housing h LEFT JOIN schools s ON s.id = h.school_id
WHERE h.school_id IS NOT NULL AND s.id IS NULL;

-- tuition_tiers 沒對到 programs
SELECT 'tuition no program' AS what, COUNT(*) AS n
FROM tuition_tiers t LEFT JOIN programs p ON p.id = t.program_id
WHERE t.program_id IS NOT NULL AND p.id IS NULL;

-- tuition_tiers 有 campus_id 但對不到 campuses(NULL 是合法的「跨校區同價」)
SELECT 'tuition bad campus' AS what, COUNT(*) AS n
FROM tuition_tiers t LEFT JOIN campuses c ON c.id = t.campus_id
WHERE t.campus_id IS NOT NULL AND c.id IS NULL;

-- campuses.city / housing.city 是否在 city_info 找得到對應
SELECT 'campuses city orphan' AS what, COUNT(*) AS n
FROM campuses cm LEFT JOIN city_info ci ON ci.city = cm.city
WHERE ci.id IS NULL;

SELECT 'housing city orphan' AS what, COUNT(*) AS n
FROM housing h LEFT JOIN city_info ci ON ci.city = h.city
WHERE ci.id IS NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 3. 國籍欄位完整性(Phase 18b 後只看 nationality_breakdown 單欄)
-- ──────────────────────────────────────────────────────────────────────

-- 3a. 每筆 schools 都應該有 nationality_breakdown(必填)
SELECT 'schools no breakdown' AS what, COUNT(*) AS n
FROM schools
WHERE nationality_breakdown IS NULL
   OR jsonb_array_length(nationality_breakdown) = 0;

-- 3b. 每筆 breakdown 條目都要有 pct(數字)
SELECT s.name AS school, item AS bad_entry
FROM schools s, jsonb_array_elements(s.nationality_breakdown) item
WHERE NOT (item ? 'pct')
   OR (item->>'pct') IS NULL
   OR jsonb_typeof(item->'pct') <> 'number';
-- 預期:0 列

-- ──────────────────────────────────────────────────────────────────────
-- 4. city_info 新欄(Phase 14a)有值 + CAD mirror
-- ──────────────────────────────────────────────────────────────────────

-- 4a. 新欄 cost_of_living_monthly / cost_of_living_currency / country 有值的城市數
SELECT
  COUNT(*) FILTER (WHERE cost_of_living_monthly IS NOT NULL) AS has_monthly,
  COUNT(*) FILTER (WHERE cost_of_living_currency IS NOT NULL) AS has_currency,
  COUNT(*) FILTER (WHERE country IS NOT NULL) AS has_country,
  COUNT(*) AS total_cities
FROM city_info;

-- 4b. CAD 城市的 _cad mirror 是否寫進去(讓現役 EF City Cards 仍能顯示)
SELECT
  COUNT(*) FILTER (WHERE cost_of_living_currency = 'CAD' AND cost_of_living_monthly_cad IS NOT NULL) AS cad_mirrored,
  COUNT(*) FILTER (WHERE cost_of_living_currency = 'CAD' AND cost_of_living_monthly_cad IS NULL) AS cad_unmirrored,
  COUNT(*) FILTER (WHERE cost_of_living_currency = 'CAD') AS cad_total
FROM city_info;
-- 預期:cad_mirrored = cad_total / cad_unmirrored = 0

-- 4c. 非 CAD 城市的 _cad 應該是 null(避免雜訊死資料)
SELECT city, cost_of_living_currency, cost_of_living_monthly_cad
FROM city_info
WHERE cost_of_living_currency <> 'CAD'
  AND cost_of_living_monthly_cad IS NOT NULL;
-- 預期:0 列

-- ──────────────────────────────────────────────────────────────────────
-- 5. 幣別都是 ISO code(tuition_tiers / housing)
-- ──────────────────────────────────────────────────────────────────────
SELECT 'tuition' AS source, currency, COUNT(*) AS n
FROM tuition_tiers GROUP BY 1, 2
UNION ALL
SELECT 'housing' AS source, currency, COUNT(*) AS n
FROM housing GROUP BY 1, 2
ORDER BY 1, 2;
-- 預期:只看到 CAD/USD/GBP/AUD/EUR/NZD 等 3-letter code,無 $ / £ / 等符號

-- ──────────────────────────────────────────────────────────────────────
-- 6. NOT NULL 完整性 spot check
-- ──────────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────────
-- 7. persona_match 對 master list 驗證(7 個有效 tag)
-- ──────────────────────────────────────────────────────────────────────
SELECT s.name AS school, p AS bad_tag
FROM schools s, unnest(s.persona_match) AS p
WHERE p NOT IN ('exam_prep','pathway_uni','pathway_grad','working_holiday','career_change','gap_year','pr_immigration');
-- 預期:0 列(若有,代表顧問把 UI-only tag 例如 lang_school / undecided 也寫進來了)
