# OPEN_QUESTIONS.md — T1–T8 待確認

> 每題：完整題目 + 建議解法 + 阻擋哪些 sub-phase。

---

## T1 · tuition_tiers 加 fixed / peak / unit 的 ETL 方案
- **題目**：現有 `tuition_tiers` 沒有 `fixed`（固定金額）/ `peak`（尖峰加價）/ `unit`（按週/堂/天/固定）欄位，但報價系統 SCHOOL_DATA（478KB）有。如何把 SCHOOL_DATA 遷進現有 schema？
- **建議**：(a) 為 `tuition_tiers` + `housing` 加 `unit / fixed / peak` 三欄；(b) 寫一次性 ETL 把 SCHOOL_DATA 的 `courses/accomm.tiers` 攤平寫入；(c) 保留 raw JSON 於 staging 表供回溯比對。
- **阻擋**：報價單算費引擎的真實接線（目前用前端常數示意）、學費試算正確性。

## T2 · CRM 對接 protocol（案件遷移 mapping）
- **題目**：CMS 案件未來遷移到 CRM 的欄位 mapping 與時機？
- **建議**：先在 `generated_pages` 加 `crm_case_id`（nullable）。CRM 上線時用 `student_name + contact` 比對建立關聯；遷移走「CMS 推 → CRM 接」單向，CMS 保留唯讀。
- **阻擋**：案件首頁的 deep link（S4）、長期資料權責切分。

## T3 · Nexus role mapping（manager / advisor / admin？）
- **題目**：Nexus 會傳什麼 role 進 CMS？權限分層怎麼對？
- **建議**：CMS 只認兩級 — `advisor`（看總額）/ `manager`（看淨利/退傭/成本）。Nexus 的 `admin` 視為 `manager`。以 Nexus 傳入 role 直接切換，**不用 PIN**。
- **阻擋**：報價單管理員視角（S14）、分析報表「管理員面向」、紅線「移除 PIN 991234」。

## T4 · 報價 PDF 樣式
- **題目**：出 PDF 沿用報價系統現有版型，還是用 fanyang 玫瑰+金重設計？
- **建議**：重設計成 fanyang 視覺以求全站一致；版型：放洋 logo + 公司資訊 + 學生 + 學校 + 費用明細 + 付款方式 + 備注 + 報價單號 + 有效期。
- **阻擋**：報價單 Step 9 出單、品牌一致性。

## T5 · LP 草稿 / 報價單有效期
- **題目**：草稿放多久自動清？報價單預設幾天有效？
- **建議**：草稿 30 天無更新轉「封存」（不刪）；報價單預設 7 天有效，過期鎖價需重算（S12）。
- **阻擋**：S7 草稿提醒、S12 報價過期邏輯。

## T6 · 學校漲價時已產報價是否鎖價
- **題目**：廠商更新 SCHOOL_DATA 後，已產 LP / 報價是否連動？
- **建議**：**鎖價** — 已產報價凍結當時價格（存 config 快照）；重產 LP 才取新價。需確認。
- **阻擋**：S15、報價快照欄位設計。

## T7 · 學生條件 → 學校排序演算法
- **題目**：年齡 / 預算 / 英語 / 目的（7 個影響排序 tag）如何加權排序學校？
- **建議**：先用簡單加權分（persona_match 命中 +、預算落在起價區間 +、目的 tag 命中 +），軟提示不擋；演算法細節待資料量足夠後調。
- **阻擋**：wizard step 3 學校排序、分析報表「學生洞察」面向。

## T8 · 報價單編號規則
- **題目**：Q20260618-0001 還是其他格式？
- **建議**：`Q + YYYYMMDD + - + 當日流水4碼`（例 Q20260618-0007），每日歸零。
- **阻擋**：`quotations.quote_no` 欄位、PDF 版型。
