# 01 — 產品規格書 (Product Spec)

> FY-school-cms 重建版規格書 · Chapter 01
> 本章只談「產品是什麼、為誰、解決什麼、做哪些不做哪些」。**不含 schema / code / RLS / SKU 欄位**——那些落在後續章節。
> 寫作慣例:繁體中文敘述 + 英文技術名詞/識別字。本章為 rebuild spec,描述「重建後應該長成的樣子」,而非現狀回顧。

---

## 1. 產品願景 (Product Vision)

放洋 (FangYang / TKB) 的語校顧問每天面對的核心動作是「當面諮詢時,幫一個學生在幾所候選語言學校之間做出選擇,並當場收斂成一張可成交的報價單」。FY-school-cms 是顧問用的**選校 + 互動式 LP 生成 + 報價**一體化工具:顧問登入後機械式地從資料庫挑選 2–3 所學校的特定校區與課程,系統用固定模板 (非 AI 自由生成,確保品質穩定一致) 套出一個 23 段的互動式 landing page,顧問在諮詢時於自己的螢幕上打開這個 LP 當作銷售簡報展示給學生看;學生看著 LP 一起決定要上哪個課程方案、住哪種房型、讀幾週,顧問把這些選擇一鍵帶入報價面板,當場用一個已驗證的 6 層計價引擎算出新台幣總額並開出一張帶序號的報價單。整套產品把「顧問口頭比較 → 手算報價」這個高摩擦、易出錯的人工流程,壓縮成「選校 → demo → 開單」的單一連貫動線。

---

## 2. 角色與受眾 (Actors & Audience)

系統只有**一種會操作系統的人**,加上**一種不碰系統的觀眾**。這個區分是後面整個權限與資料流模型的地基,務必先釐清。

| 角色 | 是誰 | 與系統的關係 | 有帳號嗎 | 走哪條技術路徑 |
|---|---|---|---|---|
| **顧問 (advisor)** | 放洋的語校銷售顧問 | 唯一的 operator:選校、生成 LP、demo、開報價 | **有** (authenticated 登入使用者) | CMS SPA 前台,受 `ProtectedRoute` + `useAuth` 保護,所有 DB 存取受 RLS 管,policy 一律 `TO authenticated` |
| **學生 (student)** | 來諮詢的潛在客戶 | 純**受眾 (audience)**:在顧問螢幕上看 LP、一起做選擇、聽報價 | **沒有** (無帳號、無登入、無自有裝置即時同步) | 不直接操作系統。學生看到的 LP 是 Worker 服務的靜態 cache HTML,runtime 不連 DB |

### 2.1 兩個必懂的推論

1. **沒有 anon 使用情境。** 學生不登入也不打 DB。公開 LP = Cloudflare Worker 服務的靜態 HTML;互動所需的資料,是在 LP 生成當下由 Edge Function 以 `service_role` 讀庫、把資料當成 JSON data island 一起 emit 進那份靜態 HTML 的。因此產品層面**不存在「未登入使用者讀資料庫」這件事**——任何把資料開放給 anon 的設計都是錯的。
2. **MVP 是「顧問單畫面驅動」。** jojo 的真實諮詢場景是顧問在自己的螢幕上 demo 給學生看,不是學生拿自己的手機同步操作。所以「學生選了什麼」這件事在顧問的同一個瀏覽器內就完成傳遞,**不需要跨裝置即時同步**。這讓 MVP 可以用最輕的方式 (URL state) 把 LP 上的選擇帶進報價面板,無需新增任何後端寫入面或學生帳號。

> 內部還有兩個 server 端身分 (`service_role`:Cloudflare Worker 讀已生成 HTML、generate-page EF 讀所有內容表),它們繞過 RLS,屬於系統基礎設施而非「產品角色」。本章不展開,僅標記其存在以說明「為何學生不需要帳號也能看到互動 LP」。

---

## 3. 核心端到端流程 (Core End-to-End Flow)

一句話:**顧問登入 → 選校/選校區 → 生成互動式 LP → 在自己畫面打開 demo → 學生選課程+住宿+週數 → 顧問開報價單。**

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│ 1. 登入      │ → │ 2. 選校/校區  │ → │ 3. 生成 LP    │ → │ 4. demo     │ → │ 5. 學生選方案 │ → │ 6. 開報價單  │
│ (advisor)   │   │ (campus 級)  │   │ (23 段渲染)   │   │ (顧問畫面)   │   │ (課程/住宿/週)│   │ (序號報價)   │
└─────────────┘   └──────────────┘   └──────────────┘   └─────────────┘   └──────────────┘   └─────────────┘
     authenticated      固定模板填空       靜態 cache HTML      URL state 帶選擇      6 層計價引擎       snapshot 複製值
```

### 3.1 各階段產品行為

| 步 | 階段 | 顧問做什麼 | 系統做什麼 | 產出 |
|---|---|---|---|---|
| 1 | **登入** | 用放洋帳號登入 CMS | 認證為 `authenticated`,進 `ProtectedRoute` 後的工作區 | session |
| 2 | **選校 / 選校區** | 挑 2–3 所學校的**特定校區**與要呈現的課程 (比較單位是「校區」不是「學校」,例:ILSC 溫哥華 vs Kaplan 溫哥華) | 撈 campuses / programs / tuition_tiers / housing / city_info 等內容 | 一組選校設定 |
| 3 | **生成 LP** | 按「生成」 | generate-page EF 以 service_role 讀內容表 → 套固定模板填空 → 把互動所需資料 emit 成 per-school JSON island → upsert 進 generated_pages → 回傳一個 Worker 連結 | 一個可分享連結的 23 段互動式 LP (靜態 cache HTML) |
| 4 | **demo** | 在自己螢幕打開連結,捲動 LP 對學生講解 (Hero / 氛圍 / 在當地的一天 / 比較表 / 學員見證 / FAQ…);advisor-only 段落 (校區照片、回國銜接) 用 demoToggle 控制顯示 | 渲染 23 段;互動段 (學費試算) 由 JSON island + vanilla JS 在 client 端即時運算,**不連 DB** | 一場銷售簡報 |
| 5 | **學生選方案** | 和學生在 LP 的學費試算段一起選:**課程方案 (program) + 住宿 (housing) + 週數 (weeks) + 開課日**,即時看到試算金額變化 | 選擇寫進 URL (`?weeks=12&program-{school}=X&housing-{school}=Y`);即時用 island 資料重算顯示 | 一個帶完整選擇的 URL |
| 6 | **開報價單** | 確認方案 → 在 CMS 報價面板按「開報價」 | QuotePanel 讀 URL params 帶入 → mapper 餵 6 層計價引擎 `calculate()` → 算出 final_twd → **把當下價格/匯率/設定複製成 snapshot** 寫進報價 + 生成 quote_number | 一張帶序號 (`Q-YYYYMMDD-NNNNN`)、可成交的報價單 |

### 3.2 流程的三條產品鐵律

1. **LP 是顧問的銷售簡報,不是給學生帶走的網站。** 頁面不對外公開行銷,只供顧問當面 demo;它的價值在「一場諮詢內把比較講清楚」。
2. **學生的選擇透過 URL 從 LP 流到報價面板。** 同一顧問、同一瀏覽器,選完即帶,不需要學生帳號也不需要跨裝置同步。
3. **報價是「當下的快照」。** 報價把成交那一刻的價格、匯率、設定**複製值**存進去,日後資料重灌或調價都不影響已開出的報價單。

---

## 4. 價值主張 (Value Proposition)

| 對象 | 痛點 (現狀) | FY-school-cms 提供的價值 |
|---|---|---|
| **顧問** | 口頭比較多校易漏、易說錯;報價要事後手算 Excel,慢且易錯;每次諮詢重複勞動 | 機械式選校 → 一鍵生出專業、一致的 23 段比較簡報;諮詢中即時試算;結束直接開出帶序號報價,**諮詢與報價合一**,零手算 |
| **學生** | 面對多校資訊零碎、難以橫向比較、看不到「在當地的一天」這種感性決策素材 | 一個結構化、有情感錨點 (Hero/氛圍/一天/見證) 又有硬數據 (比較表/學費試算) 的互動頁,當場可調參數看價格,決策有依據 |
| **放洋 (公司)** | 諮詢品質依賴顧問個人功力、報價格式不一、資料散落 | 固定模板保證每場諮詢輸出品質一致;報價統一編號 (`Q-YYYYMMDD-NNNNN`) 可追蹤;學校資料 SKU 化後可機械式統一灌入,新廠商上架成本低 |

**一句話價值主張:** 把「比較 → demo → 報價」三件原本分散、靠人腦與手算串起來的事,收斂成顧問在一次諮詢內、一個畫面上就能完成的連貫動線,且每一步的輸出品質都穩定可重複。

---

## 5. MVP 範圍 (In / Out)

> 範圍邊界以 [CLAUDE.md](../CLAUDE.md) §2 為準,本節為產品層摘要。重建版的目標:把 SKU、完整 23 段 LP、報價動線、正確 RLS 從 day 1 就做成一等公民。

### 5.1 MVP 內 (IN — MUST HAVE)

| # | 項目 | 產品層說明 |
|---|---|---|
| M1 | **選校 → 生成 LP → 打開 demo** | 核心動線前半段必須順 |
| M2 | **LP 互動:課程方案 + 住宿可選** | 學生諮詢時能在學費試算段自選 program / housing / weeks 並即時重算 (重建版 day-1 互動,非事後 port) |
| M3 | **諮詢結束 → 確認方案 → 直接開報價單** | 報價做進 CMS,從 LP 選擇一鍵帶入,開出帶序號的有效報價 |
| M4 | **LP 23 段完整渲染** | 重建版以 23 段為基準 (現狀只 10 段),至少補到 MVP Tier |
| M5 | **校區資料 SKU 化** | 可賣單位有穩定 SKU,廠商資料可機械式、可重複 (idempotent) 統一灌入 |
| M6 | **5 所真實學校資料完整** | ILAC / ILSC / Kaplan / EC / CG 五校的 LP 內容到位 |
| M7 | **RLS 安全修復** | 上線前必過:authenticated-only,anon 全擋 |
| M8 | **部署** | gh-pages (CMS 前台) + Cloudflare Worker (公開 LP) |

### 5.2 MVP 外 (OUT — NOT IN MVP)

| 排除項 | 為什麼 / 何時做 |
|---|---|
| ❌ Nexus / TKB 三系統整合、cases / vendors / lp_school_config entity | 凍住區:Nexus 是 SSOT,master plan 未落地。報價必須是 Nexus-safe snapshot,不依賴這些 entity |
| ❌ 學生帳號 / SSO / 學生自有裝置即時同步 | MVP 是顧問單畫面驅動,URL state 已足夠 |
| ❌ LP 4 段需新表的段落 (校區周邊 area / 氣候 climate / 花費 spend / 機票 flight) | 需新表 + 新內容,Post-MVP |
| ❌ ABCD 卡片 variant 的 UI 打磨 | EF 已支援,MVP 預設 A variant |
| ❌ 多校跨幣別報價總和 | MVP 走單校 happy path |
| ❌ 報價 PDF export / 報價 wizard / 後台 CRUD / 分析報表 | Post-MVP backlog |

---

## 6. 非目標 (Non-Goals)

明確宣告「這個產品**不打算**做的事」,避免範圍蔓延:

1. **不做 AI 自由生成內容。** LP 採固定模板填空,刻意換取品質穩定與可預期,不引入生成式不確定性。
2. **不做學生自助平台。** 學生不是使用者,沒有帳號、不自己操作、不收到「給自己玩」的網站。產品服務的是顧問的諮詢場景。
3. **不做對外公開行銷頁。** LP 不是 SEO 行銷資產;它是顧問當面 demo 的銷售輔助,頁面不對外公開散布。
4. **不做身分 / 廠商 master。** 顧問身分模型維持 `authenticated` 即可;vendor 是字串 slug (literal,不建 vendors 表)。身分與廠商的 SSOT 屬於 Nexus,本系統不越界。
5. **不重算或重寫計價公式。** 6 層計價引擎是已驗證合約 (19 個通過的測試);產品只負責把選擇 map 成引擎輸入,不碰數學。
6. **不碰既有 legacy LP。** 學生正在看的既有 LP (template_version='legacy') 已 cache,永不重生成。
7. **不做缺料捏造。** 真實資料缺漏時顯示 placeholder (「請洽顧問取得 X」),絕不捏造假數字或假見證。

---

## 7. 領域詞彙表 (Glossary)

> 後續所有章節共用此詞彙。技術名詞維持英文,語意以放洋語校業務為準。

| 詞 | 英文 / 識別字 | 定義 |
|---|---|---|
| **校 (學校)** | school / vendor | 一個語言學校品牌/廠商,例:ILAC、ILSC、Kaplan、EC、CG。在資料層以**字串 slug** 表示 (不建 vendors 表):ILAC / ILSC / KAP / EC / CG |
| **校區** | campus | 同一所學校在不同城市的分校,例:ILSC 溫哥華、ILSC 多倫多。**選校與比較的真正單位是校區,不是學校** (例:ILSC 溫哥華 vs Kaplan 溫哥華) |
| **課程** | program | 校區開設的課程類型,例:General English (GE15)、IELTS 衝刺、學術銜接。一個校區有多個 program |
| **週數帶** | week-band (weeks_min ~ weeks_max) | 課程定價的週數區間。同一課程不同週數帶可能單價不同 (例:12–23 週一個價、24+ 週另一個價);學生選的週數會落進某一帶 |
| **可賣單位** | atomic sellable unit | 學生真正「買的那一行」= 一列 tuition_tiers = **某廠商某課程 × 某校區 × 某週數帶 × 某幣別 × 某有效期**。報價一行 reference 的就是這個層級 |
| **SKU** | SKU | 可賣單位的穩定、人類可讀標籤,格式 `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR[-SEASON]` (例:`ILAC-TOR-GE15-W12-CAD`)。讓資料可機械式、可重複 (idempotent) 灌入,不靠 name-string 比對。住宿有平行 SKU (例:`ILAC-TOR-HS-SINGLE`) |
| **報價** | quote / quotation | 諮詢收斂出的成交文件,含 quote_number (`Q-YYYYMMDD-NNNNN`)、課程/住宿/週數選擇、新台幣總額。是**當下的 snapshot (複製值)**,日後調價/重灌不影響已開報價 |
| **計價引擎** | quotation engine / `calculate.ts` | 純函式的 6 層計價邏輯,有 19 個通過的測試,是**不可動的合約**。產品只透過 mapper 餵它輸入 |
| **persona** | persona / persona_match | 學生的留學目的畫像 (例:考試衝刺、銜接升大學、打工度假、移民/PR 規劃…),LP 用來標示「哪所學校較適合這個學生」。是行銷/排序屬性,非帳號屬性 |
| **vendor** | vendor (slug) | 廠商 = 學校,在系統中以**字串 slug literal** 存在 (不建表、不建 FK)。MVP 五校 slug:ILAC / ILSC / KAP / EC / CG |
| **LP** | landing page | 顧問生成、用於當面 demo 的 23 段互動比較頁;由 EF 套固定模板生成、Worker 服務的靜態 cache HTML |
| **23 段** | 23 sections | LP 的完整段落結構 (Hero / ABCD 卡片 / 比較表 / 氛圍 / 校區照片 / 在當地的一天 / 學費試算 / persona / 學員見證 / FAQ / CTA…)。設計源為 `fanyang-consult.html` 的 `renderAll()`,重建版以 23 段為基準 |
| **data island** | JSON island | LP 生成當下,EF 把互動所需資料 (courses / accomm / currency / rate…) emit 成內嵌 `<script>` JSON,讓靜態 LP 在 runtime 無 DB 的情況下也能即時試算 |
| **advisor-only 段** | advisor-only | 只在顧問 demo 時顯示、不對學生常駐展示的段落 (校區照片、回國銜接),由 demoToggle 控制 |

---

## 8. Happy-path 使用者故事 (一場諮詢)

> 顧問 Amy 為學生小宇做一場語校諮詢。小宇 25 歲、想去加拿大打工度假兼進修英文,預算有限,在多倫多的幾所學校之間猶豫。

1. **登入。** Amy 用放洋帳號登入 FY-school-cms,進入顧問工作區 (她是 authenticated 使用者)。
2. **選校區。** 諮詢前,Amy 依小宇的需求 (打工度假 + 多倫多 + 商英強) 挑了 3 個校區放進比較:ILAC 多倫多、ILSC 多倫多、Kaplan 多倫多,並勾選要呈現的 General English 與商業英文課程。
3. **生成 LP。** 她按「生成」。系統 (generate-page EF) 以 service_role 撈出這 3 校區的 campuses / programs / tuition_tiers / housing / city_info,套固定模板填出 23 段,並把學費試算需要的課程/住宿/匯率資料 emit 成 per-school JSON island,upsert 進 generated_pages,回傳一個 Cloudflare Worker 連結。
4. **打開 demo。** 諮詢開始,Amy 在自己的筆電上打開那個連結。頁面是 Worker 服務的靜態 HTML,秒開、不卡。
5. **講感性段。** 她先帶小宇看 Hero、氛圍段、「在多倫多的一天」(早上 homestay 早餐 → 走出教室就是 Bay Street)、學員見證 (同樣打工度假 24 週的學長),讓小宇對「在當地生活長怎樣」有畫面。
6. **講硬數據段。** 接著捲到比較表,橫向對照三校的課程強項、國籍分布、城市生活費。
7. **互動試算。** 到學費試算段,Amy 和小宇一起操作:選 ILAC 的 General English (GE15)、住宿選 Homestay 單人房、週數拉到 24 週。畫面即時 (用 island 資料,不連 DB) 重算出每週與小計;小宇的選擇同步寫進 URL (`?weeks=24&program-ilac=GE15&housing-ilac=HS-SINGLE`)。
8. **收斂方案。** 小宇決定走 ILAC 多倫多、General English、24 週、Homestay 單人房。Amy 確認這就是要開的方案。
9. **帶入報價面板。** Amy 在 CMS 切到報價面板;QuotePanel 讀 URL params,自動帶入剛剛的 program / housing / weeks / 開課日。
10. **計算。** mapper 把這些選擇轉成計價引擎輸入,呼叫 `calculate()`,6 層計價跑完,算出 final_twd (新台幣總額)。
11. **開報價單。** Amy 按「開報價」。系統把當下的價格、匯率、設定**複製成 snapshot** 寫進報價,並生成序號 `Q-20260626-00042`。一張帶序號、可成交的報價單在諮詢結束的當下就交到小宇手上。

> 邊界提醒 (非 happy path,但產品必須優雅處理):若某校沒有可售課程,該校的學費試算段隱藏並對顧問提示「無可售課程」,不出壞下拉;若計價因資料不足回空結果,顯示「資料不足無法試算」,不開出金額為 0 的空報價。

---

## 9. 本章與後續章節的交接

| 想知道… | 去哪章 |
|---|---|
| RLS / 認證角色的技術實作 (`TO authenticated`、service_role) | 認證與安全章 |
| SKU 格式、grain UNIQUE、upsert、code backfill | 資料層 / SKU 章 |
| 23 段的逐段地圖、Tier 分級、EF replace chain | LP 渲染章 |
| 6 層計價引擎、mapper、quote snapshot、quote_number trigger | 報價 carve-out 章 |
| LP → 報價的 URL state transport、JSON island、互動重寫 | 互動 LP 章 |

---

*本章只定義「產品是什麼」。任何 schema、policy、SKU 欄位、計價公式的具體形狀,皆不在本章——見對應技術章節。*
