# 00 · README — FY-school-cms 重建套件(Rebuild Spec Kit)

> 這是「**如果要整個重建這個專案**」的完整彙整 + 規格書 + 指令包。
> 建立:2026-06-26。基於兩輪 code-grounded 研究(5 路調查 + 3 路審查 + 8 路規格產出),所有數字對現役 Supabase `uxxpagylkdljjaxslmyj` live 查核。
> 衝突時:`/CLAUDE.md`(工作憲法) > `rebuild/CLAUDE.md`(重建版憲法) > 本套件章節 > 其他 docs。

---

## 0. 先讀這段:最重要的一個決定

你問「要不要整個重建」。我把三條路攤開,**誠實推薦 HYBRID**(不是 full rebuild):

| 路 | 是什麼 | 到 MVP 時程 | 27 學生 LP 風險 | 長期負債 | 推薦 |
|---|---|---|---|---|---|
| **A. CONTINUE 增量** | 照 `/CLAUDE.md` Phase 0–6 就地補 | 最短 | 低(沒搬就不壞) | 較高(債累積) | |
| **B. HYBRID** ⭐ | **採用本套件的「設計」,不做「搬家」**;在現役專案用一份 baseline-clean migration 收割清潔紅利(開 RLS / 砍 dead 表 / SKU grain),其餘照 Phase 0–6 | 短 | 低 | 低(收清潔紅利) | ⭐ **推薦** |
| **C. FULL REBUILD** | 開新 Supabase 專案 + 搬資料 + cut-over(本套件 ch08 §8.6 七步 runbook) | 最長 | 中(cut-over 集中,md5 gate 可控) | 最低(一次還清) | 只在 Nexus 落地 / 換帳號 / 交接新團隊時 |

**為什麼推薦 B 不是 C**:
1. 你的資產**價值在資料(~107 內容 rows)+ 引擎(純函式 19 測試)**,不在 app 結構。這兩塊無論哪條路成本幾乎一樣。
2. rebuild 唯一真紅利 =「RLS 從 day 1 乾淨」+「砍 dead schema」。這兩件能用**一份 migration** 在現役專案達成,不必承擔 cut-over 27 個學生頁的風險。
3. cut-over 27 legacy LP 是**純下行風險**:做對 = 學生看到一模一樣(零增益);做錯 = 學生頁壞(純損失)。

> **本套件的價值不是逼你重建,而是給你「終態藍圖 + 驗收標準 + 真要重建時可直接執行的 runbook」。** 採用 B,本套件當設計規格;哪天要 C,ch08 §8.6 已備好完整搬遷步驟。

---

## 1. 這套件有什麼(9 份)

| 檔 | 內容 | 你什麼時候讀 |
|---|---|---|
| **00_README**(本檔) | 策略決定 + 怎麼用 + 建置順序 + 決策表 + 你要交付什麼 | 先讀 |
| **CLAUDE.md**(重建版憲法) | 重建後專案的工作憲法(若走 C,新 repo 直接用) | 執行前讀 |
| **01_PRODUCT_SPEC** | 產品規格(願景/角色/核心流程/MVP 範圍/詞彙表) | 對齊產品 |
| **02_DATA_MODEL** | 乾淨 schema(SKU-first,全表 DDL,RLS) | 建庫 |
| **03_ARCHITECTURE** | 系統架構 + 認證角色 + 部署 + 資料流 + folder 結構 | 搭骨架 |
| **04_LP_SPEC** | LP 23 段規格 + 互動模型(JSON island)+ render 順序 | 做 LP |
| **05_QUOTATION_SPEC** | 報價引擎 I/O + 6 層 + mapper + QuotePanel + 生命週期 | 接報價 |
| **06_MATCHING_SPEC** | 選校配對(persona/budget/週數/年齡/英文,73 測試) | 做選校 |
| **07_INGESTION_SPEC** | SKU 統一灌入 + upsert + 驗證 + import 範本 | 灌資料 |
| **08_CONSOLIDATION** | 彙整/搬遷:匯出什麼/沿用什麼/重建什麼 + cut-over runbook | 搬遷(走 C 才需) |

---

## 2. 建置順序(HYBRID;對齊 `/CLAUDE.md` Phase 0–6)

> 走 B,Phase 0 多一個「baseline-clean 收割」子步(ch08 §8.7.3);其餘同 `/CLAUDE.md §8`。每 phase 有 fail-stop 查核點。

| Phase | 做什麼 | 主要章節 | 查核點 |
|---|---|---|---|
| **0 安全+基線+rollback** | 4 表 ENABLE RLS(authenticated-only)、收緊 always-true 寫 policy、修 PAGE_STRUCTURE、EF CLI deploy、**baseline-clean 收割(砍 dead 表 + SKU grain 前置)**、migration 四件套(含 down SQL)+ 動表前 backup | 02/03/08 | G0(見 /CLAUDE.md §8) |
| **1 LP 補段 T1** | 6 個 static 段(sec10/11/12/13/safety/return)→ 16/23 | 04 | G1 |
| **2 LP 互動化(重寫)** | sec05/06 + sec07 互動(EF emit JSON island + 新 vanilla JS)+ URL state | 04/05 | G2 |
| **3 報價 carve-out** | 改 quotations draft(拔 cases FK)→ apply → from-db mapper → QuotePanel → LP→quote | 05 | G3 |
| **4 SKU 資料層** | campuses.code + programs.code backfill → grain UNIQUE → upsert → backfill 38 | 02/07 | G4 |
| **5 補真值** | jojo 交付(§4)→ batch 灌(含 KAP/EC 新校) | 07 | G5 |
| **6 sec_costfull + 上線** | T3 段 + E2E + 部署 | 04/08 | G6 |
| **選校整併**(可併入 1/2) | 刪 CreatePage L75-655 inline 複本,改 import student-filter module | 06 | filter 73 測試綠 |

---

## 3. 決策表(我已給推薦;你「最快上線」前提下可直接採用)

> 大部分我已選好(最快上線路徑),你只需否決你不同意的。**只有標「🔴 需你給」的是我無法替你決的內容決策。**

| # | 決策 | 我的推薦 | 來源章 |
|---|---|---|---|
| D1 | 重建路線 | **HYBRID(B)** | 08 |
| D2 | LP→報價 transport | **URL state**(顧問單畫面) | 01/05 |
| D3 | quote_number 序號 | **每日歸零 `Q-YYYYMMDD-NNNNN`**(ch05 已選,可讀性佳;會同步改 /CLAUDE.md 的「全域」建議) | 02/05 |
| D4 | vendor slug 名單 | **ILAC/ILSC/KAP/EC/CG**(同步改引擎 Vendor type default 從 EP/SGIC) | 05 |
| D5 | ABCD card variant | **commit 保留,預設 A** | 01 |
| D6 | 多校跨幣別報價 | **MVP 單校 happy path**,多校 Post-MVP | 01 |
| D7 | RLS 粒度 | **MVP 顧問共享池**(authenticated 全開),Post-MVP 再收 created_by | 02 |
| D8 | cases 表 | **MVP 不建**(case_id 留 nullable bare,續凍) | 02/凍住 |
| D9 | fees 表(註冊/教材/銀行/行政) | **建一張簡單 fees 表**(引擎吃 campusFees) | 05 |
| D10 | isPeak 旺季 | **MVP stub=false**,Post-MVP 建 peak_seasons(需你給旺季月份) | 05 |
| D11 | valid_until 效期 | **14 天** | 05 |
| D12 | 按堂/按天計價 | **MVP 不做**(會碰 calculate.ts 紅線) | 05 |
| D13 | budget-fit 跨幣換算 | **MVP 不做**(維持現有無 FX 行為) | 06 |
| D14 | 學生 profile 持久化 | **MVP session-only** | 06 |
| D15 | tier 下架 | **is_active 軟下架**(不硬刪) | 07 |
| D16 | Worker cache 失效 | **EF 完成後主動 purge** | 03 |
| D17 | 網域 | **MVP 沿用 workers.dev + gh-pages 子路徑** | 03 |
| **C1** | 🔴 **program_code 命名慣例**(GE15/IELTS…) | **需你給或核可**(內容決策,SKU 前置卡這個) | 02/07/08 |
| **C2** | 🔴 **campus_code 對照**(TOR/VAN/CEB…) | 半機械我先擬,**需你終核** | 02/07 |

---

## 4. 你要交付的東西(資料缺口 — live 查核)

> 搬遷只能搬「現役有的」。下列是現役**缺**的真實事實,需你交付(格式見 `/CLAUDE.md §7` TSV 範本)。缺則 placeholder 不捏造。

| 缺口 | 現況 | 需要 | 優先 |
|---|---|---|---|
| **KAP / EC 兩校全部資料** | DB 完全沒有(現有真實校只 ILAC/ILSC/CG) | schools/campuses/programs/tuition_tiers/housing TSV | 🔴 高(MVP 5 校缺 2) |
| **18 個 programs.code** | NULL | GE15/IELTS… 命名慣例(C1) | 🔴 高(SKU 卡這個) |
| **campuses.code 10 個** | 欄不存在 | city→code(我先擬,你核) | 中 |
| **photos.image_url 4 筆** | 全 placehold.co | 真實校區照 URL | 中 |
| **各校 mood/day_schedule/voices/faq 空缺** | 部分空 | §7 TSV;缺則 placeholder | 中 |
| **旺季月份(若要 isPeak)** | 無 | 各校 peak 月份(Post-MVP) | 低 |

---

## 5. 現役系統盤點摘要(ch08 live 查核)

- **資產(carry over)**:報價引擎(19 測試)、選校過濾(73 測試)、27 legacy LP 的 html_content(學生在看,永不重生成)、Worker、LP 設計源、tokens.css
- **重灌**:8 內容表 ~107 rows(schools6/campuses10/programs24/tuition38/housing23/city6 + 4 LP 表30)
- **重做**:EF(補滿 23 段,現 10 段)、灌入腳本(改 upsert)、quotations 表(拔 cases FK)、SKU 層
- **丟棄**:16 個增量 migration(轉 baseline)、ep_consult_notes/promoted_faqs/qa_items、cases/vendors/lp_school_config draft(凍)
- ⚠️ **狀態漂移證據**:docs 寫 EF v28/v6,live 是 **v39/v7**。這本身是「為什麼想重建」的佐證,HYBRID 的 baseline-clean 會一次校正。

---

## 6. 跨章已知差異(都是決策非錯誤,已在 §3 收斂)

- quote_number:ch05/ch02 用 **daily**,原 `/CLAUDE.md` 建議 global → 採 daily(D3),會同步修 /CLAUDE.md。
- cases 表:ch02 提「CMS 內輕量 cases 表(不建 FK)」vs 凍住紀律「不建 cases」→ MVP **不建**(D8)。
- vendor slug:引擎 type default 是 EP/ILSC/EC/Kaplan/SGIC,MVP 是 ILAC/ILSC/KAP/EC/CG → 採後者並改引擎 default(D4)。

---

## 7. 下一步

1. 你看完本 README + ch08(搬遷)→ 拍 **D1 重建路線**(我推 HYBRID)。
2. 否決 §3 任何你不同意的決策;給 **C1 program_code 慣例**(SKU 前置卡這個)。
3. 排 §4 資料交付(尤其 KAP/EC 兩校)。
4. 確認後我從 **Phase 0** 開始(安全 + baseline-clean),逐 phase fail-stop。

> 若你只是想「看看重建要什麼」而非真要做:本套件已是完整答案,採 HYBRID 就是「用設計、不搬家」,現役系統照 `/CLAUDE.md` Phase 0–6 上線即可。
