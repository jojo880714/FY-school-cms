# 06 — MATCHING / 選校配對 SPEC

> 本章規格化「學生 → 學校」的配對引擎(選校 matching)。這是 **carry-over 邏輯**:現有 `src/lib/student-filter/` 已是一組純函式(pure functions),帶 6 支測試檔約 36 個 case,全綠。Rebuild 要做的不是重寫演算法,而是把它從「已抽出但沒接線」變成「day-1 就是選校 UI 唯一真相來源」,並把 profile 正確流進 LP(profile-summary 句)與 quote snapshot。
>
> **核心事實(已驗證)**:`src/lib/student-filter/` 的純函式目前 **沒有任何 production code import**(grep 全綠只命中 test 與自身)。真正在跑的是 `src/pages/CreatePage.tsx` line 75–655 的一份 **平行 inline 複本**。兩份邏輯 1:1 對齊,但 rebuild 必須消滅 inline 複本、只留 module —— 這是本章最重要的整併紅線。

---

## 0. 名詞與資料流總覽

```
                 選校 wizard(advisor 操作,authenticated)
  ┌──────────────────────────────────────────────────────────────┐
  │  學生 profile 輸入(session-only,不存 DB)                      │
  │   age / weeklyBudget+currency / exam(type+score) / maxWeeks   │
  │   / selectedPurposes[]                                        │
  └───────────────┬──────────────────────────────────────────────┘
                  │
         ┌────────▼─────────┐   metadata: programs / tuition_tiers /
         │ student-filter   │◄── housing / city_info
         │ 6 個 fit 維度     │   (useStudentFilterMetadata hook)
         └────────┬─────────┘
                  │ 對每個 campus 算:age-block / persona-score /
                  │ over-budget / level-too-low / weeks-mismatch
                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 選校卡片清單:依 persona score 由高到低排序                       │
   │ + 各種 badge(命中/超預算/程度未達/週數太短) + 年齡卡關 disable    │
   └───────────────┬──────────────────────────────────────────────┘
                   │ advisor 選 1..5 校 → 生成 LP
                   ▼
   studentProfile(opt-in)→ generate-page EF → buildProfileSummary()
                   │                                  │
                   │                                  ▼
                   │            靜態 HTML 內 hero 下方「為 … 整理」摘要句
                   ▼
   (未來)profile snapshot 寫進 quote(copy values,非 UUID;Nexus-safe)
```

**兩種「過濾」語意(全章貫穿,務必分清)**:

| 語意 | 行為 | 維度 |
|---|---|---|
| **Blocking(硬擋)** | 不符合 → 卡片 disable,無法被選入 LP | 只有 **age** |
| **Soft hint(軟提示)** | 不符合 → 仍可選,只亮 badge 提醒顧問 | budget / english-level / weeks |
| **Sort + badge** | 不擋、不提示,只影響排序與「命中」綠標 | persona |

---

## 1. 學生 profile 輸入(matching 的左手邊)

選校引擎吃一份 **session-only** 的學生 profile,**現況不落 DB**(`CreatePage` line 444–455 的 React state)。Rebuild 維持「session-only 為主」,但**新增可選的持久化**(見 §8 與 quote 章)。

| 欄位 | 型別 | 來源 UI | 用途維度 | 預設 |
|---|---|---|---|---|
| `age` | `number \| null` | 年齡輸入框 | age-fit(**blocking**) | `null` |
| `weeklyBudget` | `number \| null` | 預算輸入框 | budget-fit(soft) | `null` |
| `budgetCurrency` | `string`(e.g. `AUD`/`CAD`/`GBP`/`USD`) | 幣別下拉 | budget-fit(配對 tier currency) | `''` |
| `examType` | `ExamType`(見下)| 檢定下拉 | cefr → english-level-fit | `''`/`null` |
| `examScore` | `number \| null` | 分數輸入框 | cefr | `null` |
| `maxWeeks` | `number \| null` | 預計週數輸入框 | weeks-fit(soft) | `null` |
| `selectedPurposes` | `string[]` | 11 個 purpose tag toggle | persona-match(sort) | `[]` |
| `studentName` / `studentContact` | `string` | 學生姓名/聯絡 | 寫進 `generated_pages`(非 matching) | `''` |

**`ExamType`** (`constants.ts:75`):
```ts
type ExamType = 'toeic' | 'ielts' | 'toefl' | 'none_basic' | 'none_beginner';
```
- `none_basic` = 學生自評「略懂」→ 直接視為 **A2**
- `none_beginner` = 學生自評「零基礎」→ 直接視為 **A1**

> **紅線**:profile 任何欄位為 `null`/未填,對應維度一律「不過濾、不提示」—— 缺資料不得製造假陽性。每支 fit 函式第一行都是 null-guard,這是被測試鎖死的行為。

---

## 2. 學校這一側的 matching 欄位(右手邊)

matching 需要的學校資料分布在三張表 + 一個 metadata loader:

| 欄位 | 表/型別 | 維度 | Phase tag(現碼註解) |
|---|---|---|---|
| `schools.min_age` | `number \| null` | age-fit | 17a |
| `schools.persona_match` | `string[] \| null`(TEXT[]) | persona-match | 17b |
| `programs.entry_level` | `string \| null`(e.g. `"Upper-Intermediate (B2)"`)| english-level-fit | 17d |
| `programs.min_weeks` | `number \| null` | weeks-fit | 17f |
| `tuition_tiers.price_per_week` + `currency` + `campus_id` | budget-fit | 17c |

**metadata 載入**(`useStudentFilterMetadata.ts` → `loadStudentFilterMetadata()`):一次抓 `programs / tuitionTiers / housing / cityInfo`,回傳 `StudentFilterMetadata`。Hook 提供 `{ metadata, loading, error, refetch }`,失敗時 fallback `EMPTY`(全空陣列,等於「不過濾」)而非 throw —— matching 在資料缺失時要 degrade gracefully,不能讓選校頁白屏。

> **Rebuild 注意(SKU 對齊)**:budget-fit 目前用 `campus_id` + `currency` 配對 `tuition_tiers`。SKU rebuild 後 tier 的 grain 變成 `VENDOR-CAMPUS-PROGRAM-WEEKS-CUR`,budget-fit 仍只需 `campus_id / currency / price_per_week` 三欄,**不需要改演算法**;但 `getCampusMinPrice` 取 min 時會跨越多個 week-band tier,語意仍成立(取該校區該幣別所有 tier 的最低週費)。

---

## 3. CEFR 對映(`cefr.ts`)——所有語言維度的共同地基

### 3.1 CEFR 數字化(`constants.ts:CEFR_SCORE`)
```
A1=1  A2=2  B1=3  B2=4  C1=5  C2=6
```
所有 CEFR 比較都先映成這 1–6 的整數再比大小。

### 3.2 檢定分數 → CEFR 閾值表(`constants.ts`,降冪 first-match)

| TOEIC ≥ | IELTS ≥ | TOEFL iBT ≥ | → CEFR |
|---|---|---|---|
| 945 | 8.5 | 110 | C2 |
| 785 | 7.0 | 95 | C1 |
| 550 | 5.5 | 72 | B2 |
| 225 | 4.0 | 42 | B1 |
| 120 | 3.0 | 30 | A2 |
| 0 | 0 | 0 | A1 |

演算法:由上往下第一個 `score >= min` 命中即回傳(`toeicToCefr`/`ieltsToCefr`/`toeflToCefr`)。低於最低門檻 fallback `A1`。

### 3.3 通用入口 `examToCefr(examType, score)`
```ts
examToCefr('none_basic',  null) → 'A2'
examToCefr('none_beginner', null) → 'A1'
examToCefr('toeic', 700)  → 'B2'
examToCefr('ielts', 6.0)  → 'B2'
examToCefr('toefl', 80)   → 'B2'
examToCefr('toeic', null) → null      // 有 type 沒分數 → null
examToCefr('xxx', 500)    → null      // 未知 type → null
```
判斷順序固定:先處理兩個 `none_*`(不需 score)→ `score == null` 直接 `null` → 再依 type 走公式 → 其餘 `null`。

### 3.4 `isLevelTooHigh(studentCefr, entryLevel)`(blocking 用的反向比較)
- 從 `entryLevel` 字串以 regex `/\b(A1|A2|B1|B2|C1|C2)\b/` 抽 CEFR token,所以 `"Upper-Intermediate (B2)"` 也能解析。
- `studentScore < programScore` → `true`(學生程度不足以進該 program)。
- 任何 null / 無法解析 → `false`(不擋)。

> **inline 漂移警告(rebuild 必修)**:`CreatePage` line 75 的 inline `getStudentCefr` 與 §3.3 的 `examToCefr` **語意相同但實作分岔**。更危險的是 `CreatePage` line 600 / 608 直接用 `CEFR_SCORE[p.entry_level]`,**假設 `entry_level` 整串就是裸 CEFR**(如 `"B2"`),一旦資料寫成 `"Upper-Intermediate (B2)"` 就回 `undefined`,inline 版會誤判;而 module 版 `english-level-fit.ts` 的 `extractCefr` 用 regex 正確抽取。**Module 版才是對的**,rebuild 一律以 `src/lib/student-filter/` 為準,inline 整段刪除。

---

## 4. 六個 fit 維度逐一規格

### 4.1 Age fit(`age-fit.ts`)— 唯一 BLOCKING 維度
```ts
isAgeBlocked(studentAge, schoolMinAge): boolean   // true = 卡關,不可選
isAgeFit(studentAge, schoolMinAge): boolean       // = !isAgeBlocked
```
規則:
- `studentAge === null` → `false`(不擋)
- `schoolMinAge === null` → `false`(不限)
- `studentAge < schoolMinAge` → `true`(**擋**)

UI 後果(`CreatePage` line 658–664 `toggleCampus`):年齡卡關的校,**已選的可取消、新選的被拒**;卡片 `disabled` 並顯示 `minAge`。

**測試紅線**:`17 < 18 → true`、`18 = 18 → false`(邊界 inclusive)、`25 > 16 → false`、兩個 null 都 → `false`。

### 4.2 Persona match(`persona-match.ts`)— 排序 + 綠標,不擋不提示
```ts
getPersonaMatchScore(selectedPurposes, schoolPersonaMatch): number  // 交集數 0..N
isPersonaMatched(...): boolean                                       // score > 0
```
演算法:
1. `selectedPurposes` 空 → `0`。
2. 從 `selectedPurposes` 濾掉 `PASSTHROUGH_PURPOSES`(見 §5)→ 得 `scoringPurposes`。
3. `scoringPurposes` 濾完為空 → `0`。
4. 學校 `persona_match` 空/null → `0`。
5. 回傳 `scoringPurposes ∩ schoolPersonaMatch` 的**元素個數**。

UI 後果:
- **排序**:`CreatePage` line 1308–1314,卡片清單 `sort` 依 score 由高到低(穩定排序,score 相等回 0 保持原序)。
- **Badge**:`personaMatch` prop 在 `selectedPurposes.length > 0 && isCampusPersonaMatch(campus)` 時亮綠標。

**測試紅線**:
- 學生只選 passthrough → `0`(濾完空集)。
- `['lang_school','exam_prep']` vs `['exam_prep']` → **`1`**(`lang_school` 被濾,`exam_prep` 不被連坐 ——「混選不互相污染」)。
- 多交集 → 等於交集數(e.g. `2`)。
- `pr_immigration` **不在** passthrough → 正常計分。

### 4.3 Budget fit(`budget-fit.ts`)— 軟提示
```ts
getCampusMinPrice(campusId, currency, tiers): number | null
isOverBudget(studentWeeklyBudget, campusId, currency, tiers): boolean
```
規則:
- 取該 `campusId` **且** `currency` 相符的所有 tier,回 `price_per_week` 最小值;無對應 → `null`。
- `isOverBudget`:學生預算 null → `false`;該校區該幣別無 tier → `false`(不擋,軟提示性質);`budget < minPrice` → `true`。

> **已知限制(carry-over,勿擅自「修」)**:**跨幣別不換算**。學生填 USD 預算、學校只有 AUD tier → `getCampusMinPrice` 回 `null` → 不提示。註解明說「後端整合 phase 再加 FX」。rebuild 若要加 FX 換算屬**擴充**,需另立決策,不可改動現有測試期望(`isOverBudget(300,'X','USD',tiers) → false`)。

### 4.4 English-level fit(`english-level-fit.ts`)— 軟提示
```ts
getSchoolMinEntryCefr(schoolId, programs): string | null
isLevelTooLow(studentCefr, schoolId, programs): boolean
```
規則:
- `getSchoolMinEntryCefr`:對該校所有 program 的 `entry_level` 用 `extractCefr`(regex 抽 CEFR token),取 `CEFR_SCORE` **最小**者(= 該校門檻最低、最好進的 program);全無 CEFR token → `null`。
- `isLevelTooLow`:學生 CEFR null → `false`;校無 CEFR 門檻 → `false`;`studentScore < schoolMinScore` → `true`。

> 語意是「**只要該校有一個 program 學生進得去,就不提示**」—— 拿全校最低門檻比。

**測試紅線**:B 校有 `B2`/`C1` → min 取 **B2**(非 C1);學生 A1 vs B 校 B2 → `true`;C1 vs B2 → `false`;A1 vs A 校 A1 → `false`(邊界 inclusive);`"IELTS 6.0"`(無 CEFR token)→ `null`。

### 4.5 Weeks fit(`weeks-fit.ts`)— 軟提示
```ts
getSchoolMinWeeks(schoolId, programs): number | null
isWeeksMismatch(studentMaxWeeks, schoolId, programs): boolean
```
規則:取該校所有 program `min_weeks` 非 null 的最小值;`studentMaxWeeks < min` → `true`(學生可用週數連最短課程都報不了)。同樣「只要有一個 program 進得去就不提示」。

**測試紅線**:A 校 `4`/`8` → min `4`;學生 6 週 vs B 校 min 12 → `true`;C 校全 null → `false`。

### 4.6 維度行為總表

| 維度 | 函式 | 失敗時 UI | 是否擋選 | metadata 依賴 |
|---|---|---|---|---|
| age | `isAgeBlocked` | 卡片 disable + 顯示 minAge | **是** | schools.min_age |
| persona | `getPersonaMatchScore` | 排序下沉 / 不亮綠標 | 否 | schools.persona_match |
| budget | `isOverBudget` | 「超出預算」badge | 否 | tuition_tiers |
| english-level | `isLevelTooLow` | 「程度未達」badge | 否 | programs.entry_level |
| weeks | `isWeeksMismatch` | 「週數太短」badge | 否 | programs.min_weeks |

---

## 5. Persona 詞彙表(scoring vocabulary)——matching 的硬約束

`PURPOSE_TAGS`(`constants.ts:8`)共 **11 個**,給學生選;但只有 **7 個**參與 persona 計分。

### 5.1 11 個 purpose tag(id → label)

| id | label | 計分? |
|---|---|---|
| `lang_school` | 語言進修(語校) | ✗ passthrough(零區辨力) |
| `exam_prep` | 考試衝刺(多益/雅思/托福) | ✓ |
| `working_holiday` | 打工度假 | ✓ |
| `pathway_uni` | 銜接升大學 | ✓ |
| `pathway_grad` | 銜接升研究所 | ✓ |
| `career_change` | 職涯轉換/充電 | ✓ |
| `gap_year` | 學測後 Gap year | ✓ |
| `short_tour` | 遊學團(套裝行程) | ✗ passthrough(暫時) |
| `custom_tour` | 客製化遊學 | ✗ passthrough(暫時) |
| `pr_immigration` | 移民/PR 規劃 | ✓ |
| `undecided` | 尚未確定方向 | ✗ passthrough(學生狀態) |

### 5.2 `PASSTHROUGH_PURPOSES`(`constants.ts:30`)— 不計分的 4 個
```ts
['lang_school', 'short_tour', 'custom_tour', 'undecided']
```
- `lang_school` / `undecided`:**永久** passthrough(零區辨力 / 純學生狀態)。
- `short_tour` / `custom_tour`:**暫時** passthrough。計畫升級為 `schools.has_short_tour` / `has_custom_tour` BOOL 後改走 boolean 過濾,而非 persona 計分。

### 5.3 學校端 `persona_match[]` 的合法值 = 上表 7 個 ✓ tag

學校 `persona_match` TEXT[] **只能**填這 7 個 id:
```
exam_prep · pathway_uni · pathway_grad · working_holiday · career_change · gap_year · pr_immigration
```
EF 端的 `personaLabels` master(`generate-page/index.ts:59`)正是這 7 個的中文映射,雙端必須一致。

> **紅線(詞彙不可漂移)**:任何新增 purpose tag 必須**同步**改三處 —— `constants.ts` 的 `PURPOSE_TAGS`、EF 的 `personaLabels` / `buildProfileSummary` 標籤表、以及學校匯入時 `persona_match` 的可填值(`IMPORT_TEMPLATES.md` 對齊)。漏改一處就會出現「選了卻不計分」或「LP 顯示原始 id」的 bug。`short_tour`/`custom_tour` 升 BOOL 屬計畫內擴充,要同步從 `PASSTHROUGH_PURPOSES` 移除並改寫 budget/persona 以外的新維度。

---

## 6. 整體 match / recommendation 怎麼算

**現況沒有單一「總分」**。整體推薦是「**一個硬排序 + 多個獨立 badge**」的組合,刻意不做加權合分:

1. **排序鍵 = persona score**(唯一影響卡片順序)。score 高 → 排前。score 相等 → 保持原序(穩定)。
2. **可選性 = age block**(布林,擋選)。
3. **三個獨立軟提示 badge**(budget / level / weeks)各自亮,**不進排序、不互相加權**。

這是刻意的產品決策:顧問要看到**為什麼**某校適合/不適合(逐維度可解釋),而不是一個不透明的綜合分數。

> **Rebuild 建議(擴充,非紅線)**:可在 module 新增一個**純函式** `computeMatch(student, school, metadata)`,回傳一個結構化結果,把六維度一次算齊,UI 只消費它:
> ```ts
> interface MatchResult {
>   ageBlocked: boolean;          // 唯一 blocking
>   personaScore: number;         // 排序鍵
>   personaMatched: boolean;
>   overBudget: boolean;          // soft
>   levelTooLow: boolean;         // soft
>   weeksMismatch: boolean;       // soft
>   // 衍生(UI 用,不改既有語意):
>   selectable: boolean;          // = !ageBlocked
>   softHintCount: number;        // 0..3,可作次要排序鍵
>   minPrice / minEntryCefr / minWeeks / minAge  // badge 顯示值
> }
> ```
> 排序可升級為:`ageBlocked` 沉底 → `personaScore` 降冪 → (可選)`softHintCount` 升冪。**前提**:新增 `computeMatch` 的測試,且**不得改動現有 6 支單元測試的期望值**(那是紅線)。整體合分/加權若真要做,必須是新函式 + 新測試,且預設關閉。

---

## 7. 接入 rebuilt 選校 UI(filter/sort schools by fit)

### 7.1 唯一真相來源:只 import module,刪掉 inline 複本

Rebuild 第一步(整併紅線):
- 選校頁 **import** `@/lib/student-filter` 的全部命名匯出(index.ts 已 re-export 齊全)。
- **刪除** `CreatePage.tsx` line 75–655 的 inline 平行邏輯(`getStudentCefr`、`PURPOSE_TAGS`、`PASSTHROUGH_PURPOSES`、`isCampusOverBudget`、`isCampusLevelTooHigh`、`getCampusMinEntryLevel`、`isCampusWeeksMismatch`、`getPersonaMatchScore`、`isCampusPersonaMatch` 等)。
- metadata 一律走 `useStudentFilterMetadata()`,不要在頁面內各自 `supabase.from(...)`(現碼 line 491 還有散落的直查)。

### 7.2 卡片 props 對映(現有 `CampusCard` 已具備,沿用)

| prop | 來源函式 |
|---|---|
| `ageBlocked` / `minAge` | `isAgeBlocked` / `school.min_age` |
| `overBudget` / `minPrice` / `priceCurrency` | `isOverBudget` / `getCampusMinPrice` |
| `levelTooHigh`(命名沿用,語意=程度未達)/ `minEntryLevel` | `isLevelTooLow` / `getSchoolMinEntryCefr` |
| `weeksMismatch` / `minWeeks` | `isWeeksMismatch` / `getSchoolMinWeeks` |
| `personaMatch` | `selectedPurposes.length > 0 && isPersonaMatched(...)` |

### 7.3 排序

清單 render 前 `sort` 依 `getPersonaMatchScore` 降冪(沿用 `CreatePage` line 1308–1314)。建議改吃 §6 的 `MatchResult`,把 ageBlocked 沉底,讓不可選的校不要混在前段。

### 7.4 上限與選取

- 最多選 **5** 校(`MAX = 5`)。
- `toggleCampus`:年齡卡關時拒絕**新增**(已選可移除)。其餘維度(budget/level/weeks)**只提示不擋**,顧問可主動覆寫(專業判斷優先於軟提示)。

---

## 8. profile 流進生成的 LP(profile-summary 句)

### 8.1 傳輸:opt-in payload

`CreatePage` line 775–784:勾選 `includeProfileInPage`(UI id `include-profile`,**預設由顧問決定**)才把 `studentProfile` 帶進 `generate-page` EF body:
```ts
studentProfile: includeProfileInPage ? {
  age, budgetWeekly, budgetCurrency,
  examType, examScore,
  examCefr: examType ? getStudentCefr(examType, examScore ?? 0) : null,
  selectedPurposes, maxWeeks,
} : null
```
> rebuild:`examCefr` 改用 module 的 `examToCefr(examType, examScore)`,別再用 inline `getStudentCefr`。

### 8.2 生成:EF `buildProfileSummary(profile)`(`generate-page/index.ts:30`)

EF 在**生成時**(非 runtime)把 profile 組成一行 hero 下方摘要句,塞進 `{{PROFILE_SUMMARY}}` placeholder(line 929 / 1115),產出**靜態 HTML**。組句規則(依序 push,以 `・` 連接):

| 條件 | 輸出片段 |
|---|---|
| `age` | `{age} 歲` |
| `budgetWeekly && budgetCurrency` | `預算 ${budgetWeekly} {currency}/週`(千分位) |
| `examCefr` 且 type 非 none 且有 score | `{多益/雅思/托福 iBT} {score}（{cefr}）` |
| `examCefr` 但 none/無 score | `無檢定（{cefr}）` |
| `maxWeeks` | `{maxWeeks} 週以內` |
| `selectedPurposes[]` 非空 | 各 id 經 label 表中譯,以 `・` 連 |

最終包成:
```html
<p class="hero-sub" style="font-size:12px;opacity:0.72;...">為 {parts.join('・')} 整理</p>
```
全空 → 回 `''`(LP 不顯示該行)。`profile` 為 `null`(沒勾 opt-in)→ 同樣空字串。

> **架構紅線(public LP runtime 無 DB)**:profile-summary 必須在 EF **生成時**烤進 HTML —— Worker 服務的是 cached static HTML,runtime 沒有 DB / profile。任何「LP 上即時依 profile 變化」的互動,只能靠 EF 同時 emit 的 JSON data island,**不能**指望 runtime 重算。
>
> **EF label 表去重(rebuild)**:`buildProfileSummary` 內的 purpose 中譯表(line 47–52)與 `personaLabels`(line 59)是兩份各自維護的 map,且與前端 `PURPOSE_TAGS` 第三份。rebuild 應收斂成**單一共享來源**(例如 `student-filter/constants.ts` 匯出 `PURPOSE_LABELS`,前端與 EF 共用),避免三處漂移。

---

## 9. profile 流進 quote(Nexus-safe snapshot)

目前 profile **沒有**進 quote(quotation engine 尚未接線)。rebuild 規格:

- quote 是 **immutable snapshot**:profile 以 **copy values** 寫入,**不存 UUID、不存 FK 到 session state**。
- 建議快照欄位:`age`、`budget_weekly` + `budget_currency`、`exam_type` + `exam_score` + `exam_cefr`(算好的值)、`max_weeks`、`purposes`(id 陣列)+ `purpose_labels`(中譯,凍結當下文案)。
- `exam_cefr` 在**出 quote 當下**用 `examToCefr` 算定後存死,日後閾值表調整不回溯影響已開 quote。
- 與 Nexus 對齊:profile snapshot 全部 nullable、vendor 用 string slug(`ILAC/ILSC/KAP/EC/CG`)、purpose 存 copy 而非指向任何 master 表。

> profile snapshot 屬 quote 章主場,本章只定義「matching 的左手邊資料如何被凍結進 quote」的契約:**算好的衍生值(CEFR)與中譯標籤都要 freeze,不可日後重算**。

---

## 10. 測試現況:紅線 vs 可擴充

### 10.1 已測(red line — 不可破壞)

`src/lib/student-filter/` 6 支測試檔(與 quotation engine 的 19 tests **無關、各自獨立**):

| 檔 | 覆蓋 | 關鍵不變式 |
|---|---|---|
| `cefr.test.ts` | 三檢定 6 級閾值 + `examToCefr` 入口 + `isLevelTooHigh` | 閾值表、`none_*`→A2/A1、含字尾字串抽 CEFR、null 不擋 |
| `persona-match.test.ts` | 計分 + passthrough 濾除 | 全 passthrough→0、混選不連坐、交集數、`pr_immigration` 計分 |
| `age-fit.test.ts` | blocking | 邊界 inclusive(`18=18→false`)、null 不擋 |
| `budget-fit.test.ts` | 最低週費 + 超預算 | 幣別配對、跨幣別不換算→不擋 |
| `english-level-fit.test.ts` | 最低門檻 + 程度太低 | 取最低 program、無 CEFR token→null、邊界 inclusive |
| `weeks-fit.test.ts` | 最短週數 + 不符 | 取最低 program、null 不擋 |

這些斷言鎖死了演算法語意。Rebuild **carry-over 原檔 + 原測試**,綠燈是驗收門檻。

### 10.2 可擴充(不破壞既有測試的前提下)

- 新增 `computeMatch()` 統一入口(§6)+ 其測試。
- budget-fit 跨幣別 **FX 換算**(需新增換算函式 + 測試,且保留現有「無對應幣別→不擋」case)。
- `short_tour`/`custom_tour` 升 `has_short_tour`/`has_custom_tour` BOOL(從 passthrough 移除 + 新維度 + 測試 + 同步 EF/匯入詞彙)。
- profile snapshot freeze 進 quote(§9)的契約測試。
- 軟提示次要排序(`softHintCount`)。

### 10.3 明確不可做(會破壞既有契約)

- 不可把任一軟提示維度改成 blocking(只有 age 擋)。
- 不可把 passthrough 4 個改成計分(尤其 `lang_school`/`undecided`,會讓所有有填語校的學生對所有學校都「命中」,排序失效)。
- 不可把 persona 從「交集數」改成加權合分而不另立函式 + 測試。
- 不可回到 inline `CEFR_SCORE[entry_level]` 的裸字串假設(§3.4 漂移),必須走 `extractCefr` regex。
- 不可讓 LP runtime 依賴 profile(無 DB);profile-summary 一律生成時烤入。

---

## 11. Rebuild 驗收清單(本章交付)

- [ ] 選校頁只 import `@/lib/student-filter`,`CreatePage` inline 平行邏輯(line 75–655)整段刪除。
- [ ] metadata 統一走 `useStudentFilterMetadata`,頁面內無散落 `supabase.from`。
- [ ] CEFR 一律 `examToCefr` / `extractCefr`,消滅 inline `getStudentCefr` 與裸字串 `CEFR_SCORE[entry_level]`。
- [ ] 6 支既有單元測試 carry-over 全綠(red line)。
- [ ] purpose 詞彙單一來源,前端 + EF + 匯入三處同步(含 `PURPOSE_LABELS` 共享)。
- [ ] profile-summary 在 EF 生成時烤入 `{{PROFILE_SUMMARY}}`,opt-in 由 `includeProfileInPage` 控制。
- [ ] (擴充)`computeMatch` 統一入口 + 測試,排序升級為 ageBlocked 沉底 → personaScore 降冪。
- [ ] (擴充)profile snapshot freeze 契約定義並與 quote 章對齊(copy values、CEFR 算定存死)。