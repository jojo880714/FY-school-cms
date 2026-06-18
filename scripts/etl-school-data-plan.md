# SCHOOL_DATA ETL 計畫(Group 2 C)

**狀態**:📋 計畫(NOT APPLY)— 等實作 phase 才執行

**目標**:把報價系統現有的 `SCHOOL_DATA`(478KB,5 廠商 × N 校區 × {courses, accomm, fees})灌進 CMS Supabase DB,讓 CMS 報價 wizard 用得到。

---

## 來源 source

`jojo880714/FY-quotation-system-EP-/app.js` line 116 起的 `const SCHOOL_DATA = { ... }`,完整 478KB JSON-shape 資料。

**抓法**(實作時):

```bash
# 在 CMS repo 跑
mkdir -p scripts/etl
gh api repos/jojo880714/FY-quotation-system-EP-/contents/app.js --jq '.content' | base64 -d > scripts/etl/quotation-app.js
# 然後從 quotation-app.js 抽出 SCHOOL_DATA 變數的 JSON
```

---

## SCHOOL_DATA 來源結構

```json
{
  "EP": {
    "Brisbane": {
      "courses": [
        {
          "name": "經典上午課程 (15h)",
          "category": "課程",
          "currency": "AUD",
          "unit": "按週計算",
          "tiers": [
            {"wf": 1, "wt": 11, "price": 400, "fixed": 0, "peak": 0},
            {"wf": 12, "wt": 23, "price": 380, "fixed": 0, "peak": 0}
          ]
        }
      ],
      "accomm": [
        {
          "type": "寄宿家庭",
          "name": "寄宿家庭-單人房 (特別半食宿)",
          "currency": "AUD",
          "price": 420,
          "fixed": 0,
          "unit": "按週計算",
          "note": "限18歲以上, 平日2餐/週末3餐"
        }
      ],
      "fees": [  // 可能有,可能沒
        {
          "name": "註冊費",
          "category": "註冊",
          "currency": "AUD",
          "price": 0,
          "fixed": 285,
          "unit": "固定金額"
        }
      ]
    },
    "Manchester": { ... },
    ...
  },
  "ILSC": { ... },
  "EC": { ... },
  "Kaplan": { ... },
  "SGIC": { ... }
}
```

5 廠商 × 平均 8-15 校區 × 平均 5-10 課程/校區 × 平均 8-12 住宿選項/校區。

---

## 目標 schema(CMS DB 對映)

```
SCHOOL_DATA["EP"]                  → vendors.slug = 'EP'
SCHOOL_DATA["EP"]["Brisbane"]      → schools(name='Brisbane' or 廠商+城市 e.g. 'EP Brisbane', vendor_id=EP, country=取自城市 mapping)
                                   → campuses(city='Brisbane', school_id=該 schools)
SCHOOL_DATA["EP"]["Brisbane"].courses[i]   → programs(name=course.name, school_id=該 schools, ...)
                                            → tuition_tiers(program_id, weeks_min/max, price_per_week, currency, fixed, peak, unit, category)
SCHOOL_DATA["EP"]["Brisbane"].accomm[i]    → housing(school_id=該 schools, city='Brisbane', type=accomm.type, ...)
SCHOOL_DATA["EP"]["Brisbane"].fees[i]      → tuition_tiers(category 為 '註冊'/'教材'/'銀行'/'行政',不綁特定 program_id)
                                              (或新建 fees 表,看實作 phase 決定)
```

**注意**:
- CMS 現有 schools 是「品牌」概念。報價系統 `SCHOOL_DATA["EP"]["Brisbane"]` 是「廠商 × 校區」,**這層映射要小心**。

  兩個選項:
  - **(a)** `schools` 表加 vendor_id,每個「廠商 × 校區」是一個 school row(e.g. school name="EP Brisbane")。簡單,但 vendor=EP 跨多 schools。
  - **(b)** `schools` 維持品牌,`campuses` 加 vendor_id(每個 vendor 在這校區用什麼價)。複雜,但更貼近現實(同一校區可能多個廠商代理)。

  **推薦 (a)**,實作 phase 時細討論。

---

## ETL 步驟(實作時)

```ts
// scripts/etl/import-school-data.ts(尚未撰寫)

const SCHOOL_DATA = (await import('./quotation-school-data.json')).default;
const supabase = createServiceRoleClient();

// Step 1: 確保 vendors 表已 seed(_DRAFT_vendors.sql 已建立)
// Step 2: 對每個 vendor.campus
for (const [vendorSlug, campuses] of Object.entries(SCHOOL_DATA)) {
  const vendor = await fetchVendor(supabase, vendorSlug);

  for (const [campusName, campusData] of Object.entries(campuses)) {
    // Step 2a: 建 schools row(name='${vendorSlug} ${campusName}')
    const school = await upsertSchool(supabase, {
      name: `${vendorSlug} ${campusName}`,
      vendor_id: vendor.id,
      country: lookupCountry(campusName),  // 需要 COUNTRY_MAP
    });

    // Step 2b: 建 campuses row
    const campus = await upsertCampus(supabase, {
      school_id: school.id,
      city: campusName,
    });

    // Step 2c: 建 programs + tuition_tiers
    for (const course of campusData.courses) {
      const program = await upsertProgram(supabase, {
        school_id: school.id,
        name: course.name,
      });
      for (const tier of course.tiers) {
        await upsertTier(supabase, {
          program_id: program.id,
          campus_id: campus.id,
          weeks_min: tier.wf,
          weeks_max: tier.wt,
          price_per_week: tier.price,
          currency: course.currency,
          fixed: tier.fixed,
          peak: tier.peak,
          unit: course.unit,
          category: course.category,
        });
      }
    }

    // Step 2d: 建 housing
    for (const accomm of campusData.accomm) {
      await upsertHousing(supabase, {
        school_id: school.id,
        city: campusName,
        type: accomm.type,
        subtype: accomm.name,
        price_per_week: accomm.price,
        currency: accomm.currency,
        // ... 對應 _DRAFT_tuition_tiers_extension.sql 加的欄位
      });
    }

    // Step 2e: 雜費 fees(如 SCHOOL_DATA 有 fees 欄位)
    if (campusData.fees) {
      for (const fee of campusData.fees) {
        await upsertFee(supabase, {
          school_id: school.id,
          ...fee,
        });
      }
    }
  }
}
```

---

## COUNTRY_MAP

從 app.js line 118 抽:校區 → 國家對映(例 'Brisbane' → 'Australia')。實作時一起匯入。

---

## 驗證 SQL(實作後)

```sql
-- 5 廠商都在
SELECT slug, name_zh, (SELECT COUNT(*) FROM schools WHERE vendor_id=vendors.id) AS school_count
FROM vendors
ORDER BY sort_order;

-- 各廠商校區 / 課程 / 住宿總數
SELECT
  v.slug,
  COUNT(DISTINCT s.id) AS schools,
  COUNT(DISTINCT c.id) AS campuses,
  COUNT(DISTINCT p.id) AS programs,
  COUNT(DISTINCT t.id) AS tuition_tiers,
  COUNT(DISTINCT h.id) AS housing_options
FROM vendors v
LEFT JOIN schools s ON s.vendor_id=v.id
LEFT JOIN campuses c ON c.school_id=s.id
LEFT JOIN programs p ON p.school_id=s.id
LEFT JOIN tuition_tiers t ON t.program_id=p.id
LEFT JOIN housing h ON h.school_id=s.id
GROUP BY v.slug
ORDER BY v.sort_order;
-- 預期(粗估,實際依 SCHOOL_DATA 內容):
-- EP:     11 校區,~55 courses,~110 tiers,~100 housing
-- ILSC:   10 校區,~50 courses,~80 tiers,~80 housing
-- EC:     25 校區,~100 courses,~250 tiers,~200 housing
-- Kaplan: 22 校區,~90 courses,~200 tiers,~180 housing
-- SGIC:   3 校區,~10 courses,~20 tiers,~30 housing
-- 總共 ≈ 70 校區,~300 courses,~660 tiers,~600 housing
```

---

## 紅線

- ❌ 本計畫**未執行**。等 schema migration draft 套用後才能跑 ETL
- ❌ ETL script 也未撰寫,只是計畫
- ❌ 對 production DB 跑 ETL 必須先 dry-run + backup + user 授權
- ✅ 套用順序:vendors migration → tuition_tiers_extension migration → ETL script → 驗證 SQL
