# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

> 規則編號:本套件於 2.0.39 尚無編號慣例,自「研究用本金與基礎單位」起以 `WS-BU-<兩位數>` 編列(BU = base unit);後續新類型另立前綴.路徑為套件根相對路徑;測試以 `npm test`(mocha `--parallel`).

## 索引

| 類 | 規則 | 位置 |
|---|---|---|
| 研究用本金與基礎單位(`estimKeys` 之 `opt.uIni`、`opt.unit`) | WS-BU-01 ~ WS-BU-08 | 本檔 §1 |
| 測試表 | — | 本檔 §2 |

## 1. 研究用本金與基礎單位(`opt.uIni`、`opt.unit`)

需求出處:使用端(Gitea #175).上游規格:`dspec` 〈輸入參數之檢測機制〉K4(檢測之值即使用之值)、K7(數字類收數字字串)、V19(訊息格式)、V20(不回顯輸入值).

- **WS-BU-01 `opt.uIni`**:`estimKeys` 之 `opt.uIni` 寫入策略之 `settings.uIni`;未給(`null`／`undefined`)為 1000(既有行為);給予者須為有效正數(以 wsemi `isenum(v, { gt: 0 })` 判定:數字或數字字串,正有限),通過即以 `cdbl` 轉為數值後落地(K4、K7);無效(含 `0`、負數、`NaN`、`Infinity`、`'0x10'`、`''`、布林、陣列、物件、包裝物件、BigInt)即 throw `invalid opt.uIni: must be a positive number`(不帶值,V19／V20),於建立 `fdData` 與載入數據之前.
  - 盤點:`git grep -n "uIni" src/estimKeys.mjs`.站點全集:選項解析 1 處(已套)、`strategy.settings.uIni` 1 處(已套);`src/calcFitness.mjs` 讀 `settings.uIni` 但與本金之絕對值無關(WS-BU-04).
  - 測試:`unit-estimKeysBaseUnit`〈S1〉〈S4〉〈S5〉〈K4〉〈S7〉.
- **WS-BU-02 `opt.unit` 之檢測、轉型與落地**:`opt.unit = { rule, buffer, units }`(介面同 `w-trade-backtest` ≥ 1.1.40 之 `settings.unit`).`null`／`undefined` 視為未給;非一般物件 throw `invalid opt.unit: must be an object`.給予時先 `cloneDeep` 取一次各欄之值(其後檢測與轉換皆用此副本,檢測之值即使用之值),再以 `buildBaseUnitNotional(unit, 'opt.unit')` 檢測(與回測各路徑檢測 `settings.unit` 者同一函數;其訊息以 `invalid opt.unit` 起頭、不帶值;**不另加型別限制**);通過後 `rule.stepSize`／`minQty`／`minNotional`、`buffer` 以 `cdbl`、`units` 以 `cint` 轉為數值(與回測套件之轉型同函數),`buffer`、`units` 為 `null` 或未給補 0.1 與 1(不寫入 `null`);交易規則之其他欄(查得時刻、來源等)與 `unit` 之其他欄原樣保留;寫入策略之 `settings.unit`(鍵序:既有五鍵 `uIni, uTrade, rTakeProfit, rStopLoss, rFee` 後接 `unit`;**每個策略各一份副本**,為一般物件;不改呼叫端物件).`settings.uTrade` 維持 1(鍵與鍵序不變,給 `unit` 時回測不讀).評估(`runStrategy`、`funRunStrategyCustom`、存檔前重跑)皆以此 `settings`,不另傳參數;自訂評估核心須依 `strategy.settings.unit` 計每單名義.未給時 `settings` 與既有逐位相同.
  - **不偏離回測套件之解析**:轉換前後之 `buildBaseUnitNotional(...).key` 必相同(測試以多種寫法逐一斷言);日後回測套件改動其轉型時此測試轉紅.
  - 盤點:`git grep -n -E "runStrategy\(|funRunStrategyCustom\(|funRunStrategyCustomBeforeSave\(" src/estimKeys.mjs`.站點全集:評估 4 處(官方 2、自訂 2),皆傳入同一 `strategy` 物件(已套);`genStrategyFileName(..., strategy.settings, ...)` 2 處(檔名不讀 `settings`,WS-BU-05).
  - 測試:`unit-estimKeysBaseUnit`〈S1〉〈K4〉〈S2〉〈S4〉〈S5〉〈S7〉〈S8〉.
- **WS-BU-03 單一策略不設持倉門檻**:最大持倉名義(`summary.uTradeAllMax`;給 `unit` 時為實際名義)是否超過 `uIni` 不檢、不剔除、不中止,只隨摘要落地;入庫條件與適應函數不因 `uIni` 或 `unit` 而變;自訂評估核心之摘要契約(四欄)不變;回傳之鍵不變.持倉組合是否超過本金由挑選端判定.
  - 為何:入庫資格不得隨幣價與標的而異;求解本不以持倉與本金比較.
  - 測試:`unit-estimKeysBaseUnit`〈S3〉.
- **WS-BU-04 適應函數與入庫門檻不含本金之絕對值**:`calcFitness` 之勝率、等效年化與「損益正負」(`uEquityFinal − uIni ≤ 0`)皆與本金大小無關;入庫三門檻(交易次數、勝率、等效年化)亦同(程式未改).
  - 測試:`unit-estimKeysBaseUnit`〈S3〉(同一策略以 `uIni` 1 與 10000 重放之適應值相同);`unit-calcFitness`(既有).
- **WS-BU-05 檔名不變**:`genStrategyFileName` 只依幣種、週期、`tid`(方向與指標組成)與交易次數級距;`settings`(含 `uIni` 與 `unit`)不參與;`unit` 只改每單名義、不改進場與交易次數 ⇒ 同一策略之檔名不變.
  - 測試:`unit-estimKeysBaseUnit`〈S6〉;`unit-genStrategyFileName`(既有).
- **WS-BU-06 動態載入**:`buildBaseUnitNotional` 只在給 `opt.unit` 時才由 `loadBuildBaseUnitNotional` 動態載入(頂層不匯入),使未給新選項者不依賴回測套件之新檔(下游裝到不含該檔之舊版回測套件時,本套件與未用新選項者仍可載入);載入失敗或預設匯出非函數 ⇒ throw `opt.unit requires w-trade-backtest >= 1.1.40 (src/buildBaseUnitNotional.mjs)`(載入失敗時尾接 `: <錯誤碼>`,不帶原生錯誤之訊息與路徑,V20),不報成選項無效、不建立 `fdData`.
  - 盤點:`git grep -n "buildBaseUnitNotional" src/`,頂層 `import ... buildBaseUnitNotional` 須為 0.
  - 測試:`unit-estimKeysBaseUnit`〈S9〉(子行程以 `test/tools/noBaseUnitHook.mjs` 模擬缺檔或無預設匯出,需 Node ≥ 20.6 或 18.19).
- **WS-BU-07 日誌**:`useShowLog` 之日誌中,未給 `unit` 時「每次下單金額」為 `uTrade`(逐位不變);給 `unit` 時各單名義依基礎單位而異、不讀 `uTrade`,該欄改為「最大持倉名義(基礎單位)」,值為摘要之 `uTradeAllMax`(摘要缺此欄時為空字串);不再印寫死之 1.
  - 測試:`unit-estimKeysBaseUnit`〈L1〉.
- **WS-BU-08 新舊口徑混存**:同 tkid 之覆寫前(`checkSavable`,存檔前重跑使檔名改變後之重檢亦同),既有策略檔之 `settings.unit` 與本次不同——一方有一方無,或 `buildBaseUnitNotional(...).key`(轉型後之交易規則三欄、緩衝、單位數)不同,既有者無法解析亦算不同——⇒ **不以等效年化比較**,以本次口徑覆寫,並於 `useShowLog` 為 `true` 時記一行警告 `警告: 既有策略與本次之基礎單位口徑不同, 以本次口徑覆寫(不比較等效年化)`(第二引數僅帶檔名,不帶 `unit` 之值);查得時刻與來源等記錄欄不計,數字字串與數字之同值視為相同;口徑相同者照舊以等效年化比較;`uIni` 不屬口徑.
  - 盤點:`git grep -n "checkSavable(" src/estimKeys.mjs`.站點全集:定義 1 處、呼叫 2 處(存檔前、存檔前重跑後換檔名),同一函數故皆已套.
  - 測試:`unit-estimKeysBaseUnit`〈M1〉(含鑑別前提:既有之等效年化高於本次,無本規則時不覆寫).

## 2. 測試表

| 測試檔 | 內容 |
|---|---|
| `unit-estimKeysBaseUnit`(新增) | S1 `settings` 之鍵序、`uIni`、`unit` 之補齊與記錄欄保留、不改呼叫端物件(含深凍結輸入)、`buffer`／`units` 為 `null` 時補預設;K4 數字字串轉為數值(`uIni`、`rule` 三欄、`buffer`、`units`;其重放與原字串重放皆與檔內摘要相同;各種寫法轉換前後 `buildBaseUnitNotional(...).key` 相同;取值器每次讀取不同時落地值為通過檢測者);S2 以檔內 `settings` 重放與檔內摘要相同、去掉 `unit` 重放之交易筆數、已平倉筆數、勝率相同而最大持倉不同(鑑別前提:各單名義相異);S6 檔名與去掉 `unit` 之重放所組者相同、`genStrategyFileName` 不受 `settings` 影響;S3 不設持倉門檻:`uIni` 1(小於任一單之名義)時照常入庫、適應值與 `uIni` 10000 之重放相同,替身核心給超過 `uIni` 之摘要照常入庫、摘要缺 `uTradeAllMax` 亦可、回傳不帶新鍵,`calcFitness` 不受 `unit` 與最大持倉影響;S4 未給 `unit` 時 `uIni` 照記、`unit: null` 與 `uIni: undefined`／`null` 視同未給;S5 `uIni`／`unit` 無效即 reject(訊息固定、不含輸入值)且不建立 `fdData`;S7 經 `estimFinder` 傳遞(含數字字串);S8 加速核心(依 `settings.unit` 評估)+ 存檔前官方重跑:落地之 `settings.unit` 與重跑摘要一致,加速核心之摘要與官方之對應欄相同;每個策略之 `settings.unit` 各一份(核心就地改動不影響其他候選);S9 回測套件不含 `buildBaseUnitNotional`／`calcBaseUnitQuantity` 時(子行程以模組解析鉤子模擬;需 Node ≥ 20.6 或 18.19,不支援即略過):未給 `unit` 者照常求解、聚合入口可載入,給了者得明確之錯誤(只帶錯誤碼);該檔無預設匯出之函數時同類之錯誤;L1 日誌(給 `unit`、摘要缺欄、未給 `unit` 逐位不變);M1 新舊口徑混存(一方有一方無、規則三欄／緩衝／單位數各自不同、既有者無法解析、同口徑〔數字字串、記錄欄不同、取預設〕照舊比較、既有之 unit 為字串寫法者視為同口徑、`uIni` 不同不屬口徑、皆無、日誌未開、存檔前重跑換檔名) |
| `test/tools/noBaseUnitHook.mjs`、`test/tools/noBaseUnitRun.mjs`(新增,非測試檔) | S9 用:子行程以 `module.register` 解析鉤子模擬回測套件「缺檔」或「無預設匯出」 |
| 既有 `unit-*`(196 案) | 回歸:未給新選項之行為不變 |

單檔指令:`npx mocha test/unit-estimKeysBaseUnit.test.mjs --no-parallel --timeout 180000`;全套:`npm test`.
