# FY-school-cms MVP 計畫(詳細展開版 v2)

> [CLAUDE.md](../CLAUDE.md) 的展開版:研究發現 + 缺漏細節 + 風險 + backlog。
> **規則 / 查核點 / 紅線以 CLAUDE.md 為準**。
> 重定範圍 2026-06-26;v2 已過對抗性審查修正(RLS 誤診、quotations FK、SKU 前置等)。
> 佐證:2026-06-26 兩輪平行研究(5 路調查 + 3 路對抗審查,皆 code-grounded)。

---

## 一、這次 jojo 改了什麼

| 項目 | 舊 | 新(2026-06-26) |
|---|---|---|
| 報價系統 | NOT IN MVP | **MUST**,carve-out 做進 CMS |
| LP 互動 | 靜態展示 | **學生諮詢時自選課程 + 住宿** |
| LP 段數 | 「11 段」 | **實際 10/23,要補段** |
| 結尾動作 | 發連結 | **諮詢結束直接開報價單** |
| 資料灌入 | 手動 per-school | **SKU 化統一灌入** |
| Card ABCD | 待決策 | **commit 保留**(我推薦),預設 A |

---

## 二、研究發現(已驗證,含對抗審查修正)

### 2.1 LP 段落 — 只 port 10/23(jojo 對)
13 段缺,分 Tier(細節 CLAUDE.md §4)。`design/PAGE_STRUCTURE.md` 段落標籤錯誤 → Phase 0.3 修。

### 2.2 報價引擎 — 引擎好,完全沒接線
`calculate.ts` 6 層計價、**19 測試全過**,但從沒被呼叫。isPeak() stub、rates hardcode。
⚠️ **`_DRAFT_quotations.sql` 有硬 FK `case_id REFERENCES cases(id)`,cases 表不存在 → 照原樣 apply 直接失敗**。必須先改(拔 cases FK / vendor 字串,見 CLAUDE.md §3.2)。引擎數學紅線。

### 2.3 SKU — 可賣單位無穩定 key,且現狀建不出來
- 可賣單位 = tuition_tiers 一列,只有隨機 UUID。
- ⚠️ **47% 列現在建不出 SKU**:campuses **無 code 欄**;24 programs 只 6 個有 code(**18 個 NULL**)。
- ⚠️ SKU 格式漏 currency/validity 會**撞號**(同課跨幣 → 同 SKU → upsert 靜默覆蓋)。
- 修正(CLAUDE.md §6):DB 唯一性靠完整 grain `UNIQUE(program_id,campus_id,weeks_min,weeks_max,currency,valid_from)`,sku 是含 currency 的 derived label。
- **vendor slug = 字串 literal 不建表**(解 C/E 張力)。5 MVP 校 slug:ILAC/ILSC/KAP/EC/CG(非 draft 的 EP/SGIC)。
- 前置(Phase 4 卡):加 campuses.code、backfill 18 NULL program.code(**內容決策,需 jojo 核可慣例**)。

### 2.4 互動 LP — sec07 全靜態,且是「重寫」非「port」
- 現 sec07 server-render 固定 12 週,學生不能選;LPCalcState 是 dead stub。
- ⚠️ **runtime 無 DB**:公開 LP 是 Worker 靜態 cache HTML。source Sec07State 依賴一堆 client graph(都沒有)。
- 正解(CLAUDE.md §5.4):EF emit per-school JSON island + 寫新 vanilla JS。**Phase 2 當重寫估,非 copy-paste**。
- MVP transport = URL state(顧問單畫面驅動,jojo 流程是顧問在自己畫面 demo)。

### 2.5 認證 / RLS — 先前誤診,已修正
- ⚠️ **anon 根本沒被用**:Worker + EF 用 **service_role**(繞 RLS),顧問前台是 **authenticated**(既有 policy 放行)。
- 「anon select schools 回 []」是**正常無害**(anon 沒被用)。
- 真正的洞:4 新表 RLS **OFF**(anon 可讀寫)。修法 = `ENABLE RLS` + SELECT `TO authenticated`(**非 anon**,加 anon 反而擴大曝險)。
- 既有 6 表 RLS **已 on** + policy(不是「行為不明」)。
- 額外:ep_consult_notes/generated_pages/promoted_faqs/qa_items 有 always-true 寫 policy(advisor WARN);page_templates RLS-on-0-policy(現安全,未來前台讀會靜默回空)。

### 2.6 凍住區 — 報價可安全做
quotations + tuition_tiers_extension 可解凍(snapshot + nullable FK + vendor 字串);cases/vendors/lp_school_config 續凍。Nexus 到了 additive backfill。

---

## 三、缺漏總表(嚴重度已依審查校正)

### A. 安全(🔴 上線阻擋)
| # | 缺漏 | 嚴重 | 解 |
|---|---|---|---|
| A1 | 4 新表 RLS OFF(anon 可讀寫) | blocker | Phase 0.1 ENABLE RLS + **authenticated-only** SELECT |
| A2 | always-true 寫 policy 4 表 + page_templates 0-policy | mid | Phase 0.2 收緊;get_advisors gate |
| A3 | 無 rollback / down migration / pre-change backup | **major** | Phase 0.5 四件套 + snapshot |

### B. 報價(M3)
| # | 缺漏 | 嚴重 | 解 |
|---|---|---|---|
| B1 | quotations draft 有 cases 硬 FK,apply 會失敗 | blocker | 先改 draft 再 apply |
| B2 | 無 mapper / 無 QuotePanel | high | Phase 3 from-db.ts + 元件 |
| B3 | quote_number 規則未定(format/seq/unique) | major | CLAUDE.md §5.5 + trigger;jojo 決全域/每日 |
| B4 | 邊界/空狀態未處理(無課程/無 tier/週數外/emptyResult) | major | CLAUDE.md §5.6 |
| B5 | 無 auth/advisor 身分模型 | major | 已補 CLAUDE.md §1(advisor=authenticated) |
| B6 | tuition_tiers 缺 fixed/peak/unit/category | high | apply extension(MVP 預設值) |

### C. LP 段 + 互動(M2/M4)
| # | 缺漏 | 嚴重 | 解 |
|---|---|---|---|
| C1 | 13 段缺 | high | Phase 1(T1)+ Phase 2(T2) |
| C2 | sec07 靜態,且是重寫(runtime 無 DB + client graph 缺) | blocker | Phase 2 EF emit JSON island + 新 JS |
| C3 | LP→quote transport 未定(URL vs DB) | major | MVP = URL state(CLAUDE.md §5.3) |
| C4 | 4 段需新表 | mid | Post-MVP |
| C5 | sec_costfull 需 FX 來源 | mid | Phase 6 |

### D. 資料層 + SKU(M5/M6)
| # | 缺漏 | 嚴重 | 解 |
|---|---|---|---|
| D1 | 無 SKU + grain 無 UNIQUE | blocker | Phase 4 grain UNIQUE + sku label |
| D2 | SKU 前置:campuses.code 無 / 18 program.code NULL | **major** | Phase 4 前置(program.code 需 jojo) |
| D3 | SKU 格式撞號(漏 currency/validity) | major | UNIQUE 含 currency + load 撞號擋 |
| D4 | 灌入 delete+reinsert + name-match | high | Phase 4 改 upsert |
| D5 | 真實校 mood/day/voices/photos/校FAQ 多空 | high | Phase 5 jojo 交付 |
| D6 | photos 全 placehold.co | mid | Phase 5 真實 URL |

### E. 工程品質(不阻擋上線)
| # | 缺漏 | 嚴重 | 解 |
|---|---|---|---|
| E1 | EF deploy inline ~1170 行(~$0.25/次) | high | Phase 0.4 CLI |
| E2 | CreatePage ~1700 行單檔 | high | Post-MVP 拆 |
| E3 | Card.tsx B1-3 未 commit | high | 本批 commit |
| E4 | EF query 無 graceful fallback | mid | Phase 1 順手 |
| E5 | 無 LP 預覽介面 | mid | Phase 2 iframe(注意 page_templates RLS) |
| E6 | 無後台 CRUD | mid | Post-MVP(MVP 先 sheet) |
| E7 | renderC 沒讀 mood_* / EF deploy typo | low | Phase 0/1 順手 |

---

## 四、Phase 依賴(查核點見 CLAUDE.md §8)

```
Phase 0 安全+基線+rollback ─┬─► Phase 1 補段 T1(static,low risk)
  (RLS authenticated/CLI/   │
   spec/down SQL/backup)    └─► Phase 2 互動化(重寫 sec07 + JSON island + URL state)
                                       │
                                       ▼
                                Phase 3 報價 carve-out(改 draft → apply → mapper → QuotePanel)
                                       │
                                       ▼
                                Phase 4 SKU(前置:campus/program code → UNIQUE → upsert → backfill)
                                       │
                                       ▼
                                Phase 5 補真值(jojo 交付 → batch 灌)
                                       │
                                       ▼
                                Phase 6 sec_costfull + 上線 gate
```

**依賴說明**:
- Phase 1(static)與 Phase 2 可並行(quick win 先)。
- Phase 3 報價 **snapshot 複製值**(不存 tuition_tiers UUID)→ 不被 Phase 4 重灌影響。
- Phase 4 前置(program.code)是內容決策,卡 jojo → 若卡住可先做 Phase 5 的 LP 內容(mood/day/voices 掛 school_id 不依賴 SKU)。

---

## 五、風險登記(已校正)

| 風險 | 嚴重 | 緩解 |
|---|---|---|
| **RLS 改動打到既有讀取** | blocker | 已釐清:Worker/EF=service_role 繞 RLS,改 authenticated-only 安全;G0 寫測試證 anon 擋、authenticated 讀;Phase 0.5 backup + down SQL |
| **quotations draft cases FK 直接 apply 失敗** | blocker | §3.2 apply 前必改 checklist |
| **SKU 前置卡 program.code(內容決策)** | major | jojo 核可命名慣例;卡住先做 Phase 5 LP 內容 |
| **SKU 撞號靜默覆蓋** | major | grain UNIQUE + load 撞號 reject |
| **sec07 當 port 估,實為重寫爆時程** | major | Phase 2 當重寫;EF JSON island;單校 happy path |
| **報價碰到計價公式** | high | 19 測試 gate;只改 mapper |
| **真值補不齊 → placeholder** | high | 接受 + 標待補;§7 範本降摩擦 |
| **單一 prod Supabase 無 staging** | high | Phase 0.5 動表 backup + down SQL;test-LP namespace 不污染真資料 |
| **27 既有 legacy LP 受損** | high | legacy path 不動;G0/G6 抽驗 |

---

## 六、Post-MVP backlog(明確不阻擋上線)
- LP 完整 23 段:sec_area/climate/spend/flight(新表 + 內容)
- 跨裝置 lp_selection 即時同步(capture-EF;MVP 用 URL state)
- ABCD card variant UI / CreatePage 拆檔 / schools+4表後台 CRUD
- 多校跨幣別報價 TWD 總和 / audit log / staging 環境 / daily FX cron / backup restore drill / monitoring
- 報價 PDF export + wizard、cases/vendors/lp_school_config(等 Nexus master plan)

---

## 附錄 — 本 session 已完成(Phase 2 Batch 2,2026-06-25/26)
10 段中後 5 段:S1 schema `db10e80` / S3.1 sec04 `3135ad1` / S3.2 sec08 `da87471` / S3.3 sec_voices `75bf0b8` / S3.4 sec_photos `bb3fa7a` / S3.5 sec_faq `0ff8550`。
⚠️ 這批讓 4 新表上線但 **RLS 沒開** → Phase 0.1 第一優先補(authenticated-only)。
