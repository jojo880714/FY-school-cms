# PHASE4_PLAN.md — Phase 4：CreatePage 改選「校區」而非「學校」

> 版本：v1.0 / 2026-05-19
> 狀態：**草稿，待確認後動工**
> 前提：Phase 1 ✅、Phase 2 ✅、Phase 3 暫緩

---

## 1. 目標

將 CreatePage 的比較單位從「學校」改為「校區」：
- 顧問選擇的單位從「ILSC」→「ILSC Vancouver」
- 一頁比較頁最多選 3 個校區，不限城市
- 校區卡片顯示 `school.name + city`（例：ILSC Vancouver）
- `generated_pages` 同時儲存 school_ids 與 campus_ids

---

## 2. 現況 vs 目標結構

### 現況
```
selected: SchoolWithCampuses[]
  └─ school.id, school.name, school.campuses[]

schoolsInfo = selected.map(school => ({
  school,
  campuses: campusData.filter(c => c.school_id === school.id),
  programs: programData.filter(p => p.school_id === school.id),
  ...
}))
```

### 目標
```
selected: CampusWithSchool[]
  └─ campus.id, campus.city, campus.school_id, school (joined)

schoolsInfo = selected.map(campus => ({
  school: campus.school,
  campuses: [campus],          ← 只傳這一個校區
  programs: programData.filter(p => p.school_id === campus.school_id),
  tiers: ...,
  housing: housingData.filter(h => h.school_id === campus.school_id),
  note: notes[campus.id] || '',
  cityInfo: cityData.filter(ci => ci.city === campus.city),
}))
```

---

## 3. 影響範圍

### 3-1 前台 CreatePage.tsx

| 項目 | 現在 | 改後 |
|------|------|------|
| state 型別 | `SchoolWithCampuses[]` | `CampusWithSchool[]` |
| 資料撈取 | schools + campuses join | campuses + schools join |
| 卡片元件 | `SchoolCard`（一卡一校） | `CampusCard`（一卡一校區）|
| 卡片標題 | `school.name` | `school.name + ' ' + campus.city` |
| toggle 邏輯 | `school.id` 為 key | `campus.id` 為 key |
| 上限控制 | 目前無明確限制 | 最多 3 個校區 |
| notes key | `notes[school.id]` | `notes[campus.id]` |
| slug 產生 | `school.name.toLowerCase()` | `school.name.toLowerCase() + '-' + city.toLowerCase()` |
| pageTitle | `school.name join` | `school.name + ' ' + city join` |
| schoolsInfo 建構 | 以學校為單位，帶全部校區 | 以校區為單位，只帶該校區 |
| generated_pages 寫入 | `school_ids` | `school_ids` + `campus_ids`（新增欄位） |

### 3-2 Edge Function generate-page/index.ts

`schoolsInfo` 結構改變後，Edge Function 接收的資料也跟著變：

- `item.campuses` 現在永遠只有 1 個元素（該校區）
- `item.school` 結構不變
- `item.programs`、`item.housing`、`item.tiers` 結構不變
- `item.cityInfo` 現在只會有 1 個城市

**Edge Function 邏輯需確認：**
- 城市卡片 `cityCards` 是用 `item.campuses` 去 dedupe 城市，改後邏輯不變但結果從「一個學校多城市」變成「一個校區一城市」
- 比較表格城市欄 `item.campuses.map(c => c.city).join('、')` 改後只會顯示一個城市（正確）

### 3-3 generated_pages table（資料庫）

需新增 `campus_ids` 欄位：
```sql
ALTER TABLE generated_pages
ADD COLUMN campus_ids uuid[] DEFAULT '{}';
```

⚠️ 這是不可逆操作，需要寫 migration，須在場互動確認。

---

## 4. 執行順序

```
Step 1  ALTER TABLE generated_pages 新增 campus_ids 欄位
        → 寫 migration，在場互動執行

Step 2  修改 CreatePage.tsx
        2-1  新增 CampusWithSchool 型別定義
        2-2  修改資料撈取邏輯（campuses join schools）
        2-3  新增 CampusCard 元件（取代 SchoolCard）
        2-4  修改 toggleCampus 邏輯（campus.id 為 key，上限 3）
        2-5  修改 schoolsInfo 建構邏輯
        2-6  修改 slug、pageTitle 產生方式
        2-7  修改 generated_pages insert（加入 campus_ids）
        2-8  修改 notes key

Step 3  確認 Edge Function generate-page/index.ts
        → 確認 campuses 只有 1 個元素時邏輯正確
        → 若有問題則修改，重新 deploy

Step 4  前台測試
        → 選 2 個同城市校區，產生頁面，確認正常
        → 選 2 個不同城市校區，產生頁面，確認正常
        → 選 3 個校區，產生頁面，確認正常
        → 嘗試選第 4 個，確認被擋住

Step 5  驗收 generated_pages
        → 確認 campus_ids 有正確寫入
        → Dashboard 舊頁面（school_ids 為主）確認仍正常顯示
```

---

## 5. 既有頁面相容性

改動後新產生的頁面以校區為單位，但 **generated_pages 表中已有的 13 筆歷史頁面** 是以學校為單位產生的，不受影響（只讀不改）。

`campus_ids` 欄位新增後預設為空陣列 `{}`，歷史頁面的 `campus_ids` 為空，`school_ids` 仍有值，Dashboard 讀取邏輯需能相容兩種情況。

---

## 6. 驗收條件

- [ ] ALTER TABLE 完成，`generated_pages` 有 `campus_ids` 欄位
- [ ] CreatePage 顯示校區卡片（格式：`school.name + city`）
- [ ] 最多選 3 個校區，第 4 個無法選取
- [ ] 不同城市的校區可以同時選取
- [ ] 產生頁面成功，slug 包含校區城市資訊
- [ ] 城市資訊區塊正常顯示
- [ ] `generated_pages` 寫入時 `campus_ids` 有值
- [ ] Dashboard 歷史頁面（舊格式）仍正常顯示
- [ ] Edge Function 版本號從 v22 升至 v23（若有改動）

---

## 7. 注意事項

- **ALTER TABLE 需要在場**：不可逆，須互動式確認
- **Edge Function 改動需要 deploy**：改完要確認版本號
- **SchoolCard 元件保留或刪除**：建議先保留，確認新功能穩定後再清理
- **Dashboard 相容性**：目前 Dashboard 用 `school_ids` 讀歷史頁面，改動後新頁面有 `campus_ids`，需確認 Dashboard 不會因此爆掉
- **不動 comparison.html 模板**：視覺升級是 P3 未來優化清單的項目

---

*文件由 Claude (claude.ai) 產出，2026-05-19。動工前請在 Claude Code 環境互動式執行。*
