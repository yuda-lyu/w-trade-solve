# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

> 規則編號:本套件於 2.0.39 尚無編號慣例,自「研究用本金與基礎單位」起以 `WS-BU-<兩位數>` 編列(BU = base unit);後續新類型另立前綴:`WS-GL-<兩位數>`(GL = grid & level,條件門檻之格點與交易次數之級距)、`WS-KN-<兩位數>`(KN = key name,鍵名與期別)、`WS-TB-<兩位數>`(TB = time basis,每根 K 線之秒數與時間口徑)、`WS-TP-<兩位數>`(TP = take profit & stop loss,止盈止損候選).路徑為套件根相對路徑;測試以 `npm test`(mocha `--parallel`).

## 索引

| 類 | 規則 | 位置 |
|---|---|---|
| 研究用本金與基礎單位(`estimKeys` 之 `opt.uIni`、`opt.unit`) | WS-BU-01 ~ WS-BU-08 | 本檔 §1 |
| 測試表 | — | 本檔 §2 |
| 條件門檻之格點與交易次數之級距(`estimKeys` 之 `opt.thsCond`、`opt.levelNumTradeBounds`;`calcLevelNumTrade`、`genStrategyFileName` 之級距設定) | WS-GL-01 ~ WS-GL-09 | 本檔 §3 |
| 鍵名與期別(不依賴特定期別;期別標籤依實際時間跨度換算之鍵名;覆寫前比對舊檔之 `keys`) | WS-KN-01 ~ WS-KN-02 | 本檔 §4 |
| 每根 K 線之秒數與時間口徑(`estimKeys` 之 `opt.intervalSec`、`opt.timeBasis`) | WS-TB-01 ~ WS-TB-05 | 本檔 §5 |
| 止盈止損候選(`estimKeys` 之 `opt.thsTp`、`opt.thsSl` 之檢測;入庫篩選門檻維持無效用預設) | WS-TP-01 ~ WS-TP-02 | 本檔 §6 |

## 1. 研究用本金與基礎單位(`opt.uIni`、`opt.unit`)

需求出處:使用端(Gitea #175).上游規格:`dspec` 〈輸入參數之檢測機制〉K4(檢測之值即使用之值)、K7(數字類收數字字串)、V19(訊息格式)、V20(不回顯輸入值).

- **WS-BU-01 `opt.uIni`**:`estimKeys` 之 `opt.uIni` 寫入策略之 `settings.uIni`;未給(`null`／`undefined`)為 1000(既有行為);給予者須為有效正數(以 wsemi `isenum(v, { gt: 0 })` 判定:數字或數字字串,正有限),通過即以 `cdbl` 轉為數值後落地(K4、K7);無效(含 `0`、負數、`NaN`、`Infinity`、`'0x10'`、`''`、布林、陣列、物件、包裝物件、BigInt)即 throw `invalid opt.uIni: must be a positive number`(不帶值,V19／V20),於建立 `fdData` 與載入數據之前.
  - 盤點:`git grep -n "uIni" src/estimKeys.mjs`.站點全集:選項解析 1 處(已套)、`strategy.settings.uIni` 1 處(已套);`src/calcFitness.mjs` 讀 `settings.uIni` 但與本金之絕對值無關(WS-BU-04).
  - 測試:`unit-estimKeysBaseUnit`〈S1〉〈S4〉〈S5〉〈K4〉〈S7〉.
- **WS-BU-02 `opt.unit` 之檢測、轉型與落地**:`opt.unit = { rule, buffer, units }`(介面同 `w-trade-backtest` ≥ 1.1.40 之 `settings.unit`).`null`／`undefined` 視為未給;非一般物件 throw `invalid opt.unit: must be an object`.給予時先 `cloneDeep` 取一次各欄之值(其後檢測與轉換皆用此副本,檢測之值即使用之值),再以 `buildBaseUnitNotional(unit, 'opt.unit')` 檢測(與回測各路徑檢測 `settings.unit` 者同一函數;其訊息以 `invalid opt.unit` 起頭、不帶值;**不另加型別限制**);通過後以其回傳之轉型後選項 `bu.unit`(`rule.stepSize`／`minQty`／`minNotional`、`buffer`、`units` 皆為數值,`buffer`、`units` 為 `null` 或未給者已補 0.1 與 1,不寫入 `null`)覆蓋副本之對應欄位(`Object.assign(unit.rule, bu.unit.rule)`、`unit.buffer`、`unit.units`;**本套件不另自行轉換**);交易規則之其他欄(查得時刻、來源等)與 `unit` 之其他欄原樣保留(只覆蓋該五值,不以回傳物件整個取代);寫入策略之 `settings.unit`(鍵序:既有五鍵 `uIni, uTrade, rTakeProfit, rStopLoss, rFee` 後接 `unit`;**每個策略各一份副本**,為一般物件;不改呼叫端物件).`settings.uTrade` 維持 1(鍵與鍵序不變,給 `unit` 時回測不讀).評估(`runStrategy`、`funRunStrategyCustom`、存檔前重跑)皆以此 `settings`,不另傳參數;自訂評估核心須依 `strategy.settings.unit` 計每單名義.未給時 `settings` 與既有逐位相同.
  - **落地之 `unit` 取自回測套件之回傳**(2026-11-19 起;回測套件 ≥ 1.1.43 之 `buildBaseUnitNotional` 回傳 `unit`):不偏離回測套件之解析、檢測之值即使用之值(K4);結果與先前(本套件以 `cdbl`、`cint` 自行轉換)逐位相同.測試〈U1〉以子行程把 `buildBaseUnitNotional` 換成「檢測同真實、回傳之 `unit` 為另一組值」之替身,斷言落地者為替身之回傳(記錄欄與鍵序不變);〈K4〉以多種寫法斷言轉換前後 `key` 相同、重放相同(續留).未給 `unit` 不載入該檔之作法(WS-BU-06)不變.
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
| `test/tools/noBaseUnitHook.mjs`、`test/tools/noBaseUnitRun.mjs`(新增,非測試檔) | S9 用:子行程以 `module.register` 解析鉤子模擬回測套件「缺檔」或「無預設匯出」;U1 用(`stub`):把以裸名取用之 `buildBaseUnitNotional` 換成「檢測同真實、回傳之 `unit` 為另一組固定值」之替身 |
| 既有 `unit-*`(196 案) | 回歸:未給新選項之行為不變 |
| `unit-estimKeysBaseUnit`〈U1〉(新增 1 案) | 落地之 `settings.unit` 取自 `buildBaseUnitNotional` 之回傳(替身回傳 `stepSize` 0.01、`minQty` 0.02、`minNotional` 30、`buffer` 0.25、`units` 3,與輸入之轉型結果皆不同),交易規則之記錄欄(`asOf`、`source`)與 `unit` 之其他欄(`note`)原樣保留、鍵序不變 |
| `unit-estimKeysGridLevel`(新增,26 案) | WS-GL-09 未給新選項:可用值為 `rang(-2,2,40)` 各平移 ±10(82 點、依序;以 `funEndLoop` 所見之各粒子 `(ind, value)` 逐位比對)、還原取至小數 3 位、`solve` 之鍵與鍵序、`tkid` 不帶級距設定、檔名之雜湊輸入同既有;兩選項為 `null`／`undefined` 視同未給;`calcLevelNumTrade` 之回呼寫法(`[3, 30, 300].map(calcLevelNumTrade)`、聚合入口之同式、`Array.from(…, calcLevelNumTrade)`、帶索引與陣列之回呼)與第 2 參數為 `{}`／`null`／`undefined`／省略／`{ levelNumTradeBounds: null }` 皆同既有級距表;`genStrategyFileName` 之第 7 參數為 `null`／`{}` 同既有。WS-GL-01 ~ 03 入庫與評估之門檻皆為格點原值(含 -0.0005、1/3 與超出 ±2 者;數字字串轉為數值;凍結之輸入)、`solve.thsCond` 與鍵序、最佳解之解值為格點 ± vdir(vdir = 17.5);可用值為 `[...格點+vdir, ...格點−vdir]`(索引 < 2 倍格點數、依序;格點落於 ±2 內者 vdir 為 10、超出者放大)、多個 key 共用;無效(30 種,含未排序、平移後溢位〔平移量溢位、只有末點溢位、單點〕、平移後兩組皆合併與只有一組合併、稀疏陣列、超過 1,001 點)即 reject、訊息固定、不建 `fdData`、不載入數據;單點、含負零與恰 1,001 點之格點可用;解值非可用值時拋 `invalid x`(子行程以解析鉤子把 `w-optimization/src/omlPSO.mjs` 換成替身最佳化函數:送入可用值者照常寫檔〔鑑別前提〕、送入非可用值者拋錯且不寫檔、未給 `thsCond` 者同既有不拋);每個可用值之還原(替身依序評估 6 個可用值:前 3 個為 `'>'`、後 3 個為 `'<'`,門檻為對應格點原值;各 key 之可用值陣列非同一物件)。WS-GL-04 ~ 08 級距代碼之邊界(含首個下界 > 1、`cint` 與數字字串、整數字串下界、恰 101 個下界);`calcLevelNumTrade` 與 `genStrategyFileName` 之下界無效(19 種,含超過 101 個)即 throw;檔名 = `${mode}_${級距}_${md5(coin:interval:tid:級距@下界)}`、與預設之檔名不同(級距代碼同為 1 時亦然)、樣式同既有;`estimKeys` 之 `levelNumTrade`／`tkid`／檔名／`solve.levelNumTradeBounds`／`readStrategies` 讀回;同一設定照舊以等效年化比較;混用(既有預設級距 99% 之策略不被自訂級距 20% 者覆寫、兩組不同下界互不覆寫;鑑別前提:若同檔名則較差者不寫入、只剩 1 檔);存檔前重跑跨級距;無效即 reject;經 `estimFinder` 傳遞。WS-KN-01 標籤表(每根 1day 為 4hr 之 6 倍時間,含 `1day`);週期 1day 與 4hr 各 2,642 個依規則產生之鍵名:單鍵 tid 單射、剔除 `${interval}_` 不觸及任何鍵、5,000 組多鍵組合不重複、檔名對相異之(鍵, 級距設定, 級距)各相異;同一鍵名於兩週期之檔名不同;以每根 1day 之新名稱(含 `_1day`、`_6day`、`_180day`)求解(官方回測):tid、`ps`、`conds` 之鍵、`keyOhlc`、檔名、`levelNumTrade`、`tkid` 不重複(預設與自訂級距) |
| `unit-estimKeysTimeBasis`(新增,13 案) | WS-TB-01 契約(4 案):`package.json` 對 `w-trade-backtest` 之下限 ≥ 1.1.43;實際 `parseBarTime` 之回傳為 `{ intervalSec, timeBasis }`(鍵序、值與型別:未給為 `{ null, 'open' }`、數字字串轉為數值,11 種輸入)、無效者 throw 且訊息以 `invalid opt.intervalSec`／`invalid opt.timeBasis` 起頭;`estimKeys` 寫入 `settings` 之值即 `parseBarTime` 對同一輸入之回傳(值與型別,7 種輸入,只有給之鍵);無效之值(11 種,只用不受回測套件判準微調影響者:`0`、`-60`、`'1.5'`、`'abc'`、`true`、`[60]`、無效之 `timeBasis` 與 `'span'` 缺秒數)即 reject(只比對訊息之前綴、非數字之字串不回顯)、不建 `fdData`、不載入數據.不含舊版回測套件之拒絕與回傳形狀之替身案(裁定不留舊版分支).WS-TB-02、03 未給／`null`／`undefined` 時 `settings` 之鍵同既有;只給 `intervalSec`(數字字串轉為數值)或只給 `timeBasis: 'open'`:`settings` 多一鍵、以檔內與去掉該鍵之 `settings` 重放之摘要皆與檔內相同;`'span'`:`settings` 帶兩鍵、官方重放相符、與 `'open'` 之回測天數皆不同(鑑別前提:合成之 4hr 末根為 20:00);與 `unit` 併用之鍵序。WS-TB-04 只差 `intervalSec`(`'open'`)者 4 組皆不覆寫既有 99%、無時間口徑之警告;`'span'` 與 `'open'`(雙向)、`'span'` 與 `'open'`+`intervalSec`、`'span'` 之秒數不同 4 組皆以 20% 覆寫並記警告(只帶檔名);既有檔之 `timeBasis` 無法解讀者覆寫;同一 `'span'` 口徑照舊比較(數字字串之秒數同口徑)。WS-TB-05 加速核心收到含兩鍵之 `settings`,其交易次數、勝率、回測天數、等效年化與存檔前官方重跑之摘要相同 |
| `unit-estimKeysGuard`(新增,14 案) | WS-TP-01 `thsTp`、`thsSl`:未給／`null`／`undefined` 採 1 ~ 10(`solve` 記預設、各候選之止盈止損為 0.01 ~ 0.1);有效候選(數字字串與帶空白者轉為數值後使用與落地〔`solve.thsTp`、`settings`〕、凍結之輸入不變);取捨邊界(0.05 取至小數 3 位為 0.001 可用、0.04999 取捨後為 0 無效;前提斷言兩者取捨後一正一零);無效(各 33 種 × `thsTp`、`thsSl`:非陣列、空陣列、稀疏陣列、元素為 `0`／負數／`-0`／`NaN`／`Infinity`／非數字字串／`'0x10'`／`'1e999'`／布林／`null`／`undefined`／巢狀／包裝物件／BigInt／取捨後為 0〔`0.04`、`0.049`、`1e-9`、`'1e-400'`〕)即 reject、訊息固定不含輸入值、不建 `fdData`、數據資料夾不存在亦先得此錯誤,兩者皆無效先報 `thsTp`;經 `estimFinder` 傳遞。WS-TP-02 `thNumTrade`／`thRWin`／`thREquivalentCumuProfitOrLossFinalNormYear` 無效(字串、物件、陣列、布林、`null`、`undefined`)不拋、採預設並記於 `solve`。WS-KN-02:鑑別前提(`btc_4hr_ma_1day` 與 `ma_1day` 之 `tid`、檔名同而 `keys` 不同)下,舊檔 `keys` 不同即 throw `hash collision`、既有檔逐位不變(即使本次較佳;訊息不含 `keys` 原值);`keys` 相同時較佳者覆寫、較差者不寫;多個 key 時只有第二個不同亦 throw;順序不同者兩檔並存;舊檔無 `keys`(缺欄、字串、`null`)不比對;比對先於基礎單位口徑之判斷(口徑不同而 `keys` 亦不同仍 throw;同 `keys` 口徑不同照舊覆寫為鑑別前提);存檔前重跑使檔名改變後之重檢(第二處 `checkSavable`)亦 throw、舊檔不變 |
| `test/tools/gridLevelHook.mjs`、`test/tools/gridLevelRun.mjs`(新增,非測試檔) | 子行程以 `module.register` 解析鉤子:`omlOk`／`omlBad` 把 `w-optimization/src/omlPSO.mjs` 換成只評估一次之替身(後者送入非可用值);`omlAll` 換成依序評估最後一個設計變數全部可用值之替身(驗各可用值之還原符號與門檻、各 key 之可用值陣列各一份副本) |

單檔指令:`npx mocha test/unit-estimKeysBaseUnit.test.mjs --no-parallel --timeout 180000`(`unit-estimKeysGridLevel`、`unit-estimKeysTimeBasis`、`unit-estimKeysGuard` 同式);全套:`npm test`.

## 3. 條件門檻之格點與交易次數之級距(`opt.thsCond`、`opt.levelNumTradeBounds`)

需求出處:使用端(較長之 K 線週期——例如日線——之訓練期根數少、交易次數少,預設級距之高級距到不了、低級距過粗;不同週期或尺度之因子需要不同之門檻範圍與步長).上游規格:`dspec` 〈輸入參數之檢測機制〉K4(檢測之值即使用之值)、K7(數字類收數字字串)、V19(訊息格式)、V20(不回顯輸入值).

- **WS-GL-01 `opt.thsCond` 之檢測與轉換**:`null`／`undefined` 為未給;給予者須為非空陣列且至多 1,001 點(格點全量記於每個策略檔之 `solve.thsCond`,故設上限),各元素以 `isenum` 判定(數字或數字字串)、`cdbl` 轉為數值,轉換後嚴格遞增(於平移後之兩組檢查:平移為單調之運算,平移後嚴格遞增即原值嚴格遞增);各元素只讀一次;回傳新陣列(不改呼叫端).無效(非陣列、空陣列、元素無效、非嚴格遞增〔含重複、`0` 與 `-0`〕、超過 1,001 點、平移後溢位或相鄰點無法以雙精度分辨〔WS-GL-02〕)即 throw `invalid opt.thsCond: must be a non-empty array of at most 1001 strictly increasing finite numbers`(不帶值),於建立 `fdData` 與載入數據之前(經 `estimPicks` 系列呼叫時,指標 key 之列舉與篩選回呼先於檢測,仍先於建夾與寫檔).
  - 盤點:`git grep -n "thsCond" src/`.站點全集:`parseThsCond`(定義 1 處、呼叫 1 處)、設計變數之建立 1 處、還原 1 處、`solve` 1 處.
  - 測試:`unit-estimKeysGridLevel`〈WS-GL-01 ~ 03〉.
- **WS-GL-02 編碼與還原**:給 `thsCond` 時每個 key 之設計變數為 `{ values: [...格點+vdir, ...格點−vdir], n: 2 × 格點數 }`(各 key 各一份副本),`vdir = max(max|格點|, 2) × 5`(格點落於 ±2 內者同為 10;解值 > 0 為 `>`、< 0 為 `<`);兩組平移後各須嚴格遞增且為有限數.還原以 `Map(可用值 → { sym, th })` 查表,`th` 為格點原值(不經浮點運算、不取捨小數位);查不到(解值非可用值)同既有之 `invalid x`(正常路徑不會發生:各演算法以索引取可用值、局部搜尋取最近之可用值;測試以替身最佳化函數走此路徑).
  - 為何:w-optimization 以索引取值、`n` 須等於可用值數(`_validateDps`);局部搜尋依數值距離取最近之可用值,平移編碼保留距離之意義;查表使入庫之門檻逐位為所給格點.
- **WS-GL-03 記錄**:給 `thsCond` 時策略檔之 `solve` 於 `thsSl` 之後記轉為數值之 `thsCond`;未給不記.`thsCond` 不入 `tkid` 與檔名(屬搜尋空間,同 `thsTp`、`thsSl`).
- **WS-GL-04 級距設定之檢測與轉換**:`estimKeys` 之 `opt.levelNumTradeBounds`、`calcLevelNumTrade` 之第 2 參數(設定物件)之 `opt.levelNumTradeBounds`、`genStrategyFileName` 之第 7 參數(設定物件)之 `opt.levelNumTradeBounds` 共用 `src/_levelNumTradeBounds.mjs` 之 `parseLevelNumTradeBounds`:`null`／`undefined` 為未給;給予者須為非空陣列且至多 101 個(下界記於每個策略檔之 `tkid` 與 `solve`,故設上限),各元素以 `iseint(v, { min: 1 })` 判定、`cint` 轉為數值,轉換後嚴格遞增;無效即 throw `invalid opt.levelNumTradeBounds: must be a non-empty array of at most 101 strictly increasing positive integers`(不帶值),`estimKeys` 於建立 `fdData` 與載入數據之前.
  - **呼叫形狀不變**:`calcLevelNumTrade` 之第 2 參數為設定物件(以 `get(opt, 'levelNumTradeBounds', null)` 取值),非物件者(例如作為 `arr.map(calcLevelNumTrade)`、`Array.from(arr, calcLevelNumTrade)` 之回呼時所收之索引)視為未給 ⇒ 既有之回呼寫法照舊可用、結果同既有.不得改為位置參數(位置參數會使回呼之索引被當成級距設定而拋錯).
  - 盤點:`git grep -n "levelNumTradeBounds" src/`.站點全集:`calcLevelNumTrade` 1 處、`genStrategyFileName` 1 處、`estimKeys` 之解析 1 處、`genRes`(級距、`tkid`)2 處、`genStrategyFileName` 之呼叫 2 處(經 `optFn`)、`solve` 1 處.
- **WS-GL-05 級距代碼**:給級距設定時,代碼 = 不大於交易次數(`cint` 後)之最大下界;小於首個下界(含 ≤ 0)者為 0;末級距不設上限.未給時為既有之級距表(不變).
  - 測試:`unit-estimKeysGridLevel`〈WS-GL-04 ~ 08〉.
- **WS-GL-06 `tkid` 與檔名**:`tkid = ${tid}:${tagLevelNumTrade(級距, 下界)}`,`tagLevelNumTrade` 於未給時為級距代碼本身、給予時為 `${級距}@${下界以逗號串接}`;檔名 = `${mode}_${級距}_${md5(`${coin}:${interval}:${tid}:${tagLevelNumTrade(…)}`)前16碼}.json`(未給時與既有逐位相同).`tkid` 與雜湊輸入之組成只有 `tagLevelNumTrade` 一處.
- **WS-GL-07 混用之防呆**:級距設定不同者之 `tkid` 與檔名必不相同 ⇒ 同一資料夾混用時各自去重、互不覆寫(既有庫之策略不被另一種級距設定之策略覆寫);覆寫前之身分驗證比對含設定之 `tkid`.同一設定之同 `tkid` 照舊以等效年化比較.不設硬性阻擋(拒絕混用須資料夾標記或列舉全庫,見 state 之待辦).
- **WS-GL-08 記錄**:給級距設定時策略檔之 `solve` 記轉為數值之 `levelNumTradeBounds`(於 `thsSl`、`thsCond` 之後);未給不記.事後重算檔名者(例如策略庫重算工具)須以 `genStrategyFileName(…, { levelNumTradeBounds: solve.levelNumTradeBounds })` 傳入同一設定.
- **WS-GL-09 預設逐位不變**:未給兩選項(或為 `null`)時,可用值(含 `rang` 累加之浮點)、還原(`wround(…, 3)`)、級距、`tkid`、檔名、策略檔內容(含 `solve` 之鍵與鍵序)、存檔判斷、日誌、回傳之 `bestSolution` 皆與 2.0.42 逐位相同.
  - 測試:`unit-estimKeysGridLevel`〈WS-GL-09〉(套件內可固化之部分);與 2.0.42 之逐位對拍(固定亂數與時鐘,確定性函數表 + 8 段求解流程,含真實 4hr 與日線資料)為發布前之檢查,作法見 `sgud/exp/experience.md`.

## 4. 鍵名與期別

- **WS-KN-01 不依賴特定期別**:`src/` 內不得寫死因子之期別標籤或因子名稱、不得以期別標籤之樣式做判斷;週期字串(`interval`)只用於 K 線序列之 key、`tid`／`sid` 之縮寫(剔除 `${interval}_`)與檔名雜湊.鍵名之期別標籤依實際時間跨度換算時(例:每根 1day 之標籤為 4hr 標籤之 6 倍時間,含與週期字串同形之 `1day`;期別為鍵之末段),識別、檔名、去重與讀回正確且無碰撞.
  - 盤點:`git grep -n -E "[0-9]+(hr|day)|index_|_vbs_|interval" src/`;現況:只有 ①文件／範例與 ②週期字串,無第 ③ 類(2.0.42 盤點).`estimPicks` 依 `index_` 開頭與 `_vbs_` 分類,與期別無關.
  - 已知限制:剔除 `${interval}_` 依賴「期別為鍵之末段」之命名慣例;鍵之中段含 `${interval}_` 者會與去掉該段之鍵得同一 `tid` 與同一檔名(現行命名不產生此形);此碰撞由 WS-KN-02 攔下.
  - 測試:`unit-estimKeysGridLevel`〈WS-KN-01〉.
- **WS-KN-02 覆寫前比對舊檔之 `keys`**(Gitea #182;原為提案之防呆建議):同 `tkid` 已有策略檔時,`checkSavable` 除比對 `tkid`、`name`、`interval` 外,另比對舊檔之 `keys`(為陣列者,以 lodash `isEqual`,順序敏感)與本次相同;不同即同既有之碰撞 throw `hash collision: fnStrategy[…], keysOld differs from keys, tkid[…]`(不帶 `keys` 之值,V20),既有檔不變.未碰撞(`keys` 相同)時行為不變(等效年化比較、口徑判斷);舊檔無 `keys`(缺欄或非陣列,如舊版所存)者不比對(同 `tkid`／`name`／`interval` 各欄之寬鬆處理).此比對先於基礎單位與時間口徑之判斷(口徑不同亦不得覆寫他組 `keys` 之策略).`checkSavable` 為單一函數,存檔前與存檔前重跑換檔名後之重檢(2 處呼叫)同套.
  - 為何:`tid` 為 `keys` 縮寫而得,縮寫後相同而 `keys` 不同者之 `tkid`、檔名、`name`、`interval` 皆同,只比該三者看不出,兩組不同之 `keys` 會以等效年化互相覆寫而不報錯.
  - 盤點:`git grep -n "keysOld\|checkSavable(" src/estimKeys.mjs`.站點全集:定義 1 處、呼叫 2 處(皆已套).
  - 測試:`unit-estimKeysGuard`〈WS-KN-02〉(鑑別前提:K1 `btc_4hr_ma_1day` 與 K2 `ma_1day` 之 `tid`、`tkid`、檔名、`name`、`interval` 皆同而 `keys` 不同;無此規則時較佳者覆寫).

## 5. 每根 K 線之秒數與時間口徑(`opt.intervalSec`、`opt.timeBasis`)

需求出處:使用端(較長之 K 線週期以開盤時刻標籤計持倉天數與回測天數之偏差較大);回測套件新增策略 `settings` 之 `intervalSec`(每根秒數;單給不改任何績效數字)與 `timeBasis`(`'span'` 依實際時點計;須同時給 `intervalSec`).前提:相依之 `w-trade-backtest` ≥ 1.1.43(含 `src/barTime.mjs`,預設匯出 `parseBarTime`;`runStrategy`／快速評估支援此二鍵);`package.json` 之下限已 ≥ 1.1.43(現為 `^1.1.44`),**不留舊版回測套件之分支**(自有套件閉環,專案原則 14).上游規格:`dspec` 〈輸入參數之檢測機制〉K4、K7、V19、V20.

- **WS-TB-01 載入與檢測**:`opt.intervalSec`、`opt.timeBasis` 各只讀一次;皆為 `null`／`undefined` 時不檢測、不附加(同既有).給予任一者時,以 `import parseBarTime from 'w-trade-backtest/src/barTime.mjs'`(靜態匯入;預設匯出 `parseBarTime`)檢測 `{ intervalSec, timeBasis }`(名稱前綴 `'opt'`;判準與訊息由回測套件定,與其各路徑檢測 `settings` 者同一函數),無效即 throw(訊息以 `invalid opt.intervalSec` 或 `invalid opt.timeBasis` 起頭、不帶值),於建立 `fdData` 與載入數據之前.寫入 `settings` 之值為其回傳之 `{ intervalSec, timeBasis }`(`intervalSec` 為數值或 `null`、`timeBasis` 為 `'open'`／`'span'`).本套件之文件與測試不重述回測套件之判準(測試只比對訊息之前綴).
  - **不留舊版分支**(Gitea #182 裁定):不處理「回測套件不含 `src/barTime.mjs`」「無預設匯出」「回傳形狀不合」三種情形(提案原有之明確拒絕與回傳形狀驗證皆不採);改以**契約測試**直接核對實際 `parseBarTime` 之回傳(鍵序、值與型別)與 `estimKeys` 寫入之值相同,並核對 `package.json` 對 `w-trade-backtest` 之下限 ≥ 1.1.43.日後回測套件改動其回傳或訊息前綴時此測試轉紅.
  - 盤點:`git grep -n -E "intervalSec|timeBasis|barTime|parseBarTime" src/`;現況:頂層靜態匯入 1 處、呼叫 1 處.
  - 測試:`unit-estimKeysTimeBasis`〈WS-TB-01 契約〉(4 案).
- **WS-TB-02 附加於 `settings`**:只附加有給之鍵(值以 `parseBarTime` 回傳之轉型值為準:`intervalSec` 為數值、`timeBasis` 為 `'open'`／`'span'`),接於既有鍵(含 `unit`)之後,鍵序 `intervalSec`、`timeBasis`;每個策略同一值;未給時 `settings` 之鍵與鍵序逐位不變.檔名與 `tkid` 不帶此二鍵(交易次數不變 ⇒ 級距與檔名不變).
- **WS-TB-03 績效數字**:只給 `intervalSec`(或 `timeBasis` 為 `'open'`)時與未給相同;`'span'` 時依回測套件之 `'span'` 口徑(持倉天數、回測天數、等效年化改變),入庫門檻與適應值隨之.官方重放以檔內 `settings` 即得同一摘要.
  - 測試:〈WS-TB-02、03〉.
- **WS-TB-04 口徑判斷**:同 `tkid` 覆寫前(`checkSavable`)之口徑 = 基礎單位(WS-BU-08)+ 時間口徑.時間口徑之識別(`timeKeyOf`):缺 `timeBasis`(或 `null`)等同 `'open'`;`'open'` 時不計 `intervalSec`;`'span'` 為 `span:<秒數>`;無法解讀者(其他值、`'span'` 而秒數非正整數)視為不同.時間口徑不同 ⇒ 不比等效年化、以本次覆寫,`useShowLog` 為 `true` 時記一行 `警告: 既有策略與本次之時間口徑不同, 以本次口徑覆寫(不比較等效年化)`(第二引數只帶檔名);基礎單位不同者仍先記既有之基礎單位警告(訊息不變).
  - 為何 `'open'` 時不計 `intervalSec`:只給 `intervalSec` 不改任何績效數字;若計入,日後對既有庫傳入 `intervalSec` 時,既有策略會被不比等效年化地整批覆寫.
  - 使用之前提(文件):口徑不同即不比優劣而覆寫 ⇒ 同一資料夾之所有寫入者(含進行中之求解、重算、普測)須用同一時間口徑;口徑不一之寫入者會每輪把對方碰到之策略逐一改回己方口徑(可能變差).轉傳此二選項之上游須先支援,才可讓資料夾改用 `'span'`.`intervalSec` 須與 K 線之實際間距一致(本套件與回測套件皆不檢查).
  - 已知限制:口徑不同時不重放舊策略再比(無損遷移未做,宜與基礎單位之同形規則一併處理);覆寫只在 `useShowLog` 時留痕.
  - 測試:〈WS-TB-04〉.
- **WS-TB-05 自訂評估核心**:`funRunStrategyCustom`／`funRunStrategyCustomBeforeSave` 收到之 `strategy.settings` 含此二鍵,須依之計算(加速核心之 `evaluate` 原樣傳入 `settings` 即可).
  - 測試:〈WS-TB-05〉.

## 6. 止盈止損候選(`opt.thsTp`、`opt.thsSl`)

需求出處:使用端(Gitea #182);`w-trade-backtest` 1.1.43 起 `settings.rTakeProfit`、`settings.rStopLoss` 給了而非正數即拋.上游規格:`dspec` 〈輸入參數之檢測機制〉§11「影響下單數量或金額之 opt 視同安全相關 opt」(給了而無效即拒絕,不改用預設)、K3(篩選門檻維持無效用預設)、K4、K7、V17、V19、V20.

- **WS-TP-01 `opt.thsTp`、`opt.thsSl` 之檢測與轉換**:`null`／`undefined` 為未給,採預設 `[1, 2, …, 10]`(逐位同既有);給予者須為非空陣列(`Array.isArray`),各元素以 `isenum` 判定(數字或數字字串,K7)、`cdbl` 轉為數值(K4),且 `round(候選 / 100, 3) > 0`(即本套件實際取用之 `rTakeProfit`／`rStopLoss` 為正:不得為 `0`、負數,或小於 0.05——除以 100 取至小數 3 位後為 0);各元素只讀一次,回傳新陣列(不改呼叫端);轉換後之陣列落地於 `solve.thsTp`、`solve.thsSl`(數字字串不再原樣落地).無效即 throw `invalid opt.thsTp: must be a non-empty array of positive numbers that stay positive after rounding`(`thsSl` 同式;V19、不帶值 V20),先於建立 `fdData` 與載入數據(V17);兩者皆無效時先報 `thsTp`.
  - 為何拒絕而非改用預設:止盈止損影響下單之金額與回測結果,改用預設會使策略檔所記與呼叫端之意圖不符而無人察覺(dspec §11);且 `w-trade-backtest` ≥ 1.1.43 對 `settings.rTakeProfit`／`rStopLoss` 為 0 或負即拋,舊行為(靜默採預設、元素不檢)會使此類輸入在求解途中(建夾之後)才拋錯,或(舊回測套件)靜默寫出止盈止損為 0 或負之策略.
  - 盤點:`git grep -n "thsTp\|thsSl" src/estimKeys.mjs`.站點全集:選項解析 2 處(`parseThsPct`)、設計變數 2 處(`values = map(thsSl|thsTp, v => v / 100)`)、`solve` 記錄 2 處;皆用解析後之陣列.
  - 測試:`unit-estimKeysGuard`〈WS-TP-01〉(未給／null／undefined 同既有、有效候選與數字字串轉為數值、取捨邊界 0.05 與 0.04999、無效 33 種 × 2 選項、經 `estimFinder` 傳遞).
- **WS-TP-02 入庫篩選門檻維持無效用預設**:`thNumTrade`、`thRWin`、`thREquivalentCumuProfitOrLossFinalNormYear` 為入庫之篩選門檻(不影響下單金額),給了而無效時改用預設 1、0.5、0.15(`isnum` 判定,K3),不拋錯;`solve` 記實際採用之值(程式未改,測試固化).
  - 測試:`unit-estimKeysGuard`〈WS-TP-02〉.

## 7. 已知限制(Gitea #182 未涵蓋者;列於此供後續)

- **無損之口徑遷移**(提案 §11 第 4 點):基礎單位(WS-BU-08)與時間口徑(WS-TB-04)口徑不同時,現行不比優劣而以本次口徑覆寫,較差之新口徑解可能覆寫較佳之舊口徑解,口徑不一之寫入者會互相整批改寫.可改為「口徑不同時先以本次口徑重放既有檔之策略,同口徑比等效年化,較佳者以本次口徑寫回」(每次口徑不符多一次回測,遷移完成後即不再發生);宜兩種口徑一併處理,本案未做.
- **口徑覆寫之留痕**(提案 §11 第 5 點):警告只在 `useShowLog` 為 `true` 時輸出,回傳值不帶被覆寫之計數,事後無從得知發生過幾次;是否帶出計數或不論 `useShowLog` 皆輸出,待裁定,本案未做.
- 預設格點之解值(`bestSolution.ps[].value`)帶 `rang` 之累加誤差(例 `-9.799999999999999`),入庫之門檻因取 3 位小數而整潔;為保逐位不變未改(提案 §12 第 3 點).
- `intervalSec` 與 K 線之實際間距不符時,本套件與回測套件皆不檢查(提案 §12 第 4 點);檢查之落點宜在回測套件.
- 其餘入庫篩選門檻(`thNumTrade`、`thRWin`、`thREquivalentCumuProfitOrLossFinalNormYear`)無效時採預設、元素不報(WS-TP-02;提案 §12 第 2 點除 `thsTp`／`thsSl` 外).
- 格點之形式(顯式陣列,各 key 共用)、混用級距設定是否硬性阻擋(不阻擋、識別內帶設定):提出方已裁定,照提案.
- `opt.unit` 之動態載入(WS-BU-06,載入失敗拋 `opt.unit requires w-trade-backtest >= 1.1.40 …`)為既有之舊版容忍分支;回測套件下限已 ≥ 1.1.43 後該分支實際不可達,依主控「未給 `unit` 不載入該檔」之裁定保留,是否改靜態匯入待裁定.
