# DATA_MODEL.md — 資料模型對齊

> wireframe 顯示的每個資料點 → 對應 schema 哪張表的哪欄。標出要新增 / 延伸的欄位。
> 現有 7 表：schools / campuses / programs / tuition_tiers / housing / city_info / generated_pages。

---

## 區塊 1 · 案件首頁（放洋 CMS · 案件卡）

| 畫面資料點 | 來源表.欄位 | 狀態 |
|-----------|------------|------|
| 學生姓名 | `generated_pages.student_name` | 現有 |
| 聯絡方式 | `generated_pages.student_contact` | 現有 |
| 諮詢日期 | `generated_pages.consultation_date` | 現有 |
| 案件狀態（5 種） | `generated_pages.status` | 現有（需擴充 enum：諮詢中/LP完成/報價中/已收單/已放棄） |
| LP 版本數 | 同 student 的 `generated_pages` count | 現有（前端聚合） |
| 報價數 | `quotations` count by case | **新表 quotations** |
| 最後更新 | `generated_pages.updated_at` | 現有 |
| （案件分組鍵） | `student_name + student_contact` 聚合 | 現有（前端） |
| CRM 關聯 | `generated_pages.crm_case_id` | **新增欄位**（預留遷移） |

---

## 區塊 2 · LP 產生器 Wizard

| 畫面資料點 | 來源表.欄位 | 狀態 |
|-----------|------------|------|
| 學生姓名 / 聯絡 / 日期 | `generated_pages.*`（同上） | 現有 |
| 學生條件（年齡/預算/英語/目的/週數/出發) | `generated_pages.advisor_notes` JSONB 或新 `lp_profile` | **新增**（JSONB 暫存） |
| 廠商 / 國家 / 校區 | `schools.name / .country` · `campuses.city` | 現有 |
| 校區資訊（學生數/國籍/班級） | `campuses.*` | 現有（部分欄位待補） |
| 主推課程 / 起價 | `programs.*` · `tuition_tiers.price_per_week` | 現有 |
| 選定學校 | `generated_pages.school_ids[] / campus_ids[]` | 現有 |
| LP 段落顯/隱 + 排序 | `generated_pages.advisor_notes` JSONB（section config） | **新增**（JSONB） |
| LP 樣式 / 標題 | `generated_pages.title` + style key | 現有 + **新欄位** |

---

## 區塊 3 · LP 諮詢模式（方案配置）

| 畫面資料點 | 來源表.欄位 | 狀態 |
|-----------|------------|------|
| 課程選擇 | `programs.id` | 現有 |
| 週數 | config.weeks | **新表 lp_school_config** |
| 起始週 | config.start_date | **新表 lp_school_config** |
| 住宿選擇 | `housing.id` | 現有 |
| 雜費勾選 ☑ | config.extras[] | **新表 lp_school_config** |
| 折扣 | config.discount | **新表 lp_school_config**（諮詢配置已含折扣下拉：原價/早鳥-5%/-10%/多校優惠/promo/自訂） |
| 學生反應（⭐/✓/◌/✗) | config.reaction | **新表 lp_school_config** |
| 即時備注 | config.note | **新表 lp_school_config** |
| 即時試算（課程/住宿/合計/TWD) | 前端算費引擎計算（不存） | 即算 |

> **lp_school_config**（新）：`id, generated_page_id, school_id, campus_id, program_id, weeks, start_date, housing_id, extras[], discount JSONB, reaction, note`。或以 `generated_pages.advisor_notes` JSONB 承載，實作時決定。

---

## 區塊 4 · 報價單

| 畫面資料點 | 來源表.欄位 | 狀態 |
|-----------|------------|------|
| 客戶 / 廠商 / 校區 / 課程 | 由 `lp_school_config` 帶入 | 新表帶入 |
| 課程單價 + 週數階梯 | `tuition_tiers.price_per_week` + `weeks_min/max` | 現有 |
| **計價單位 / 固定金額 / 尖峰加價** | `tuition_tiers.unit / fixed / peak` | **需延伸欄位**（ETL，OPEN_QUESTIONS T1） |
| 住宿價 | `housing.price_per_week` | 現有 |
| 雜費 extras | 各廠商 extras list | **新表 vendor_extras** 或常數 |
| 折扣（%/固定/promo） | config.discount | 新表 |
| 多幣別 + TWD 換算 | 前端 rates 表 | 常數（不存 DB） |
| 報價 6 層（廠商折扣/公司折扣/營業稅/匯差緩衝/顧問獎金/廠商退傭） | `quotations` 衍生 | **新欄位 + 設定常數** |
| 報價記錄（總額/狀態/出單日/顧問） | `quotations.*` | **新表 quotations** |
| 報價單號 | `quotations.quote_no` | **新欄位**（規則待定 T8） |
| 管理員：成本/退傭/淨利/淨利率 | `quotations` 衍生（cost/commission） | **新欄位** |

> **quotations**（新）：`id, case_id(generated_page_id), lp_id, school_id, config JSONB, total, currency, status(draft/sent/accepted/rejected), valid_until, quote_no, advisor_id, created_at`。

---

## 區塊 5 · 分析報表

| 畫面資料點 | 來源 | 狀態 |
|-----------|------|------|
| 本月產 LP / 草稿比 | `generated_pages` 聚合 | 現有 |
| demo→報價 / 成單率（漏斗） | `generated_pages.status` + `quotations.status` 聚合 | 現有 + 新表 |
| 需求→收單天數 | `created_at → quotations.accepted` 時間差 | 衍生 |
| 最常選用 / 排除學校 | `generated_pages.school_ids[]` 頻率 | 現有（聚合） |
| 高轉化條件組合 | `lp_profile` × `quotations.status` | 新表聚合 |
| 學生洞察（年齡/預算/英語/目的/國家分布、決策難題配對） | `lp_profile` + `school_ids[]` 共現 | 新表/JSONB 聚合 |
| 各顧問產 LP / 成單率 / 偏好學校 / 培訓機會 | `advisor_id` 分組 | **需 advisor_id 欄位** |

---

## 新增 / 延伸總表

| 動作 | 對象 |
|------|------|
| **延伸欄位** | `tuition_tiers` + `unit / fixed / peak`（ETL T1） |
| **新增欄位** | `generated_pages` + `crm_case_id` · 樣式 key · `advisor_id` |
| **新表** | `lp_school_config`（諮詢方案配置） |
| **新表** | `quotations`（報價記錄） |
| **新表/常數** | `vendor_extras`（各廠商雜費清單） |
