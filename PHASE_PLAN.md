# PHASE_PLAN.md — Phase 2：city_info 鏈路完整化

> 版本：v1.1 / 完工 2026-05-19  
> 狀態：✅ Phase 2 完工  
> 前提：Phase 1 ✅、問題一 ✅、問題二 ✅，系統處於穩定狀態

---

## 1. 目標

確保 city_info 從資料庫到渲染頁面的完整鏈路沒有靜默缺口：
- 所有 `campuses` 城市都有對應的 `city_info` 資料
- `city_info` 每筆資料欄位填寫完整，不出現「待補充」
- 比對邏輯具備基本防呆能力

---

## 2. 現況鏈路圖

```
[資料庫 city_info table]
        ↓ SELECT *
[前台 CreatePage.tsx]
        ↓ 過濾出各 school 旗下校區所在城市
        ↓ 嵌入 schoolsInfo[].cityInfo（陣列）
        ↓ HTTP POST body
[Edge Function generate-page v21]
        ↓ allCityInfo = schools.flatMap(item => item.cityInfo || [])
        ↓ allCityInfo.find(x => x.city === c.city)   ← 完全字串比對
        ↓ 填入 HTML 模板 comparison.html
[Cloudflare Worker 渲染]
        ↓
[generated_pages 儲存 / 使用者瀏覽]
```

---

## 3. 已知潛在缺口（需驗證）

| # | 缺口描述 | 風險等級 | 驗證方式 |
|---|---------|---------|---------|
| A | `campuses` 有城市但 `city_info` 無對應資料 → 渲染「待補充」 | 高 | SQL diff（見第 4 節） |
| B | `city_info` 某些欄位為 NULL → 部分區塊「待補充」 | 中 | SQL 欄位完整度查詢 |
| C | `x.city === c.city` 完全比對：空白或大小寫差異 → 靜默比對失敗 | 中（未來風險） | SQL 資料抽查 + 肉眼確認 |
| D | 前台只撈「選中學校校區的城市」，若同城市有多筆 city_info 可能重複 | 低 | SQL 確認 city 是否唯一 |

---

## 4. 驗證 SQL（在 Claude Code 執行，唯讀）

### 4-1 city_info 有哪些城市？
```sql
SELECT city FROM city_info ORDER BY city;
```

### 4-2 campuses 有哪些不重複城市？
```sql
SELECT DISTINCT city FROM campuses ORDER BY city;
```

### 4-3 缺口 A：校區城市無對應 city_info（最重要）
```sql
SELECT DISTINCT c.city AS campus_city
FROM campuses c
LEFT JOIN city_info ci ON c.city = ci.city
WHERE ci.city IS NULL
ORDER BY c.city;
```
> 預期結果：0 筆。若有資料，代表有城市會顯示「待補充」。

### 4-4 缺口 B：city_info 欄位完整度
```sql
SELECT
  city,
  (population IS NOT NULL AND population != '')                        AS has_population,
  (climate IS NOT NULL AND climate != '')                              AS has_climate,
  (cost_of_living_monthly_cad IS NOT NULL)                            AS has_cost,
  (transit_monthly_cad IS NOT NULL)                                   AS has_transit_cost,
  (transit_card_name IS NOT NULL AND transit_card_name != '')         AS has_transit_card,
  (highlights IS NOT NULL AND array_length(highlights, 1) > 0)       AS has_highlights
FROM city_info ORDER BY city;
```
> 預期結果：每欄皆 true。若有 false，該欄需補資料。

### 4-5 缺口 C：大小寫 / 空白抽查
```sql
SELECT DISTINCT city FROM campuses
UNION
SELECT DISTINCT city FROM city_info
ORDER BY city;
```
> 肉眼確認兩表的城市名稱拼寫完全一致（大小寫、空白、特殊字元）。

### 4-6 缺口 D：city_info city 欄唯一性
```sql
SELECT city, COUNT(*) AS cnt
FROM city_info
GROUP BY city
HAVING COUNT(*) > 1;
```
> 預期結果：0 筆。若有重複，`find()` 只取第一筆，可能導致非預期結果。

---

## 5. 依驗證結果決定工作項目

### 情境一：所有查詢結果符合預期（零缺口）

→ **Phase 2 僅做一件事**：Edge Function 城市比對防呆（低風險優化）

**修改範圍**：`generate-page/index.ts`

```diff
- allCityInfo.find(x => x.city === c.city)
+ allCityInfo.find(x => x.city.trim().toLowerCase() === c.city.trim().toLowerCase())
```

> 同步在 `campuses.city` 寫入時也加 trim，或在前台 CreatePage.tsx 過濾時 normalize。  
> 此修改需 deploy Edge Function（v21 → v22），需在場互動確認。

---

### 情境二：4-3 有缺口（有城市無 city_info）

→ **先補資料，再做防呆**

步驟：
1. 確認缺口城市清單
2. 在 `city_info` 補齊資料（Supabase Dashboard Table Editor 手動新增，或準備 INSERT SQL）
3. 重新執行 4-3 確認歸零
4. 再進行情境一的防呆修改

---

### 情境三：4-4 有欄位 NULL

→ **補欄位資料**

步驟：
1. 確認哪些城市哪些欄位缺資料
2. 補齊（Table Editor 或 UPDATE SQL）
3. 重新執行 4-4 確認全 true

---

### 情境四：4-5 發現大小寫/空白不一致

→ **修資料（優先）或加 normalize**

步驟：
1. 統一資料（UPDATE SQL 修正拼寫）
2. 若資料無法統一（如外部資料源），則改 Edge Function 用 normalize 比對

---

## 6. 驗收條件

Phase 2 完成的定義（需全部達成）：

- [x] SQL 4-3 執行結果：0 筆（無城市缺口）
- [x] SQL 4-4 執行結果：三城市 × 6 欄位（population / climate / cost_of_living_monthly_cad / transit_monthly_cad / transit_card_name / highlights）全部為 true
- [x] SQL 4-5 確認：兩表城市名稱完全一致
- [x] SQL 4-6 確認：city_info 無重複城市
- [x] Edge Function 城市比對改為 trim + toLowerCase，deploy 至線上
- [x] 前台選含所有現有城市的學校組合，產生頁面，肉眼確認所有城市資訊區塊無「待補充」

---

## 7. 注意事項

- **本 Phase 不動 `campuses` 結構**（Phase 3 的範圍），只確認 `city` 欄位資料
- **Edge Function deploy 需要在場**：改完 `index.ts` 後執行 `supabase functions deploy generate-page` 或用 Supabase MCP `deploy_edge_function`，確認版本號從 v21 → v22
- **不動 `comparison.html` 模板**（Phase 3/4 後的視覺升級範圍）
- **資料補充建議用 SQL**，方便留紀錄；若用 Table Editor 請截圖備查
- **Phase 3 含 ALTER TABLE**，必須獨立排時間，本 Phase 不觸碰

---

## 8. 執行順序

```
Step 1  在 Claude Code 執行第 4 節全部 SQL（唯讀，5 分鐘）
Step 2  對照第 5 節判斷屬於哪個情境
Step 3  依情境補資料或跳過
Step 4  修改 Edge Function index.ts（防呆 normalize）
Step 5  deploy Edge Function，確認版本號
Step 6  前台產生頁面，執行驗收條件清單
Step 7  所有驗收條件打勾 → Phase 2 完成，更新 README 進度
```

---

*文件由 Claude (claude.ai) 產出，基於專案快照 v20260519 靜態分析。  
資料層驗證（第 4 節 SQL）需在 Claude Code 環境搭配 Supabase MCP 執行後補全。*
