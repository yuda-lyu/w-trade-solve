# 狀態(現況)

本檔記載當前已開發功能之最新狀態:各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本.規則帳本(`sgud/rule/rulebook.md`)為藍圖、本檔為現況,兩者比對即知尚未做到者.只記現況、不寫過程(過程寫入`sgud/exp/experience.md`).過長時依功能類型拆為`state_<類型>.md`,本檔只留索引.

> 本套件於 2.0.39 前無 `sgud/`;本檔自「研究用本金與基礎單位」起編列,既有功能(求解、挑選、讀檔等)之現況尚未逐項編列,待後續補.

## 最近一次驗證

- 2026-11-26(wsemi 1.9.80 列舉函數第 2 參數遷移,`package.json` 之 `wsemi` 為 `^1.9.80`;規則帳本 WS-FL-01):`src/readStrategies.mjs:85` 改為 `{ levelLimit: 1 }`(第 1 層,行為不變);既有〈僅列第1層, 子資料夾與其內檔案皆不列入〉即層數測試,變異 4 項皆擊殺(見經驗檔);全套 `npm test` 全綠 286 案、0 pending(案數與前一次相同,本輪未新增測試);ESLint 於 `src/readStrategies.mjs` 為 0 error,`test/unit-readStrategies.test.mjs` 有 4 個既有 `quotes` 錯誤(第 228、239、256、264 行,與 `HEAD` 相同,本輪未動);未發布、未提交,`package.json` 之 `version` 未動.
- 版本基準:2.0.43(`package.json` 版號未動,發布由使用者之流程處理;`w-trade-backtest` 下限現為 `^1.1.44`,已 ≥ 1.1.43).
- 2026-11-20(跟跑 wsemi 1.9.70 之訊息改字,`package.json` 之 `wsemi` 為 `^1.9.70`):`randomIntsNdpRange` 範圍錯誤訊息改為 `invalid vstart: must be <= vend`(不帶輸入值),`unit-estimComps` 之「向已清空之類別挑選」案之期望依此改字;產品行為不變(空類別仍拋錯);`src/` 與 `test/` 無其他比對 wsemi 訊息之處;全套 `npm test` 全綠 286 案、0 pending.
- 2026-11-19(條件門檻之格點、交易次數之級距、每根 K 線之秒數與時間口徑、止盈止損候選之檢測、覆寫前比對 `keys`、`unit` 取自回測套件之回傳):全套 `npm test` 全綠 286 案、0 pending(既有 232 案 + `unit-estimKeysGridLevel` 26 案 + `unit-estimKeysTimeBasis` 13 案 + `unit-estimKeysGuard` 14 案 + `unit-estimKeysBaseUnit`〈U1〉1 案);未給新選項之前後對拍(固定亂數與時鐘;確定性函數表 + 求解流程 11 段、策略檔 43 個)與 2.0.43 逐位相同,止盈止損候選給數字字串者只有 `solve.thsTp`／`solve.thsSl` 之記錄由字串變數值(見經驗檔);`node g.mjs` 輸出與 README 相符.
- 2026-11-18(研究用本金與基礎單位,基準 2.0.39):全套全綠 232 案;與 2.0.39 之對拍 0 處不同.

## 研究用本金與基礎單位(`estimKeys` 之 `opt.uIni`、`opt.unit`)

| 項 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| `opt.uIni`(數字或數字字串,轉為數值後落地;預設 1000) | 已做 | WS-BU-01 | `unit-estimKeysBaseUnit` S1／S4／S5／K4／S7 |
| `opt.unit` 之檢測、轉型與落地(`settings.unit`;每策略一份副本;落地者取自 `buildBaseUnitNotional` 回傳之 `unit`) | 已做 | WS-BU-02 | 同上 + S2／S8／U1 |
| 單一策略不設持倉門檻;適應函數與入庫門檻不含本金絕對值 | 已做(程式未改,測試固化) | WS-BU-03、04 | S3 |
| 檔名不變 | 已做(程式未改,測試固化) | WS-BU-05 | S6 |
| 動態載入 `buildBaseUnitNotional`(給 `unit` 時才載入) | 已做 | WS-BU-06 | S9(Node ≥ 20.6 或 18.19) |
| 日誌(給 `unit` 時顯示最大持倉名義) | 已做 | WS-BU-07 | L1 |
| 新舊口徑混存(同 tkid 覆寫前比對 `settings.unit`) | 已做 | WS-BU-08 | M1 |

已知缺口與待辦:

- `dist/`(UMD)路徑下動態載入 `buildBaseUnitNotional` 之行為未測(`dist/` 由發布流程編譯;編譯後須確認 `opt.unit` 路徑可用).
- S9 以解析鉤子在子行程模擬回測套件缺檔,驗的是「本套件自身不依賴該檔」,不是「與真正之舊版回測套件併用」;`package.json` 未宣告 `engines`,Node 較舊者略過該兩案.回測套件下限已 ≥ 1.1.43 後,該舊版容忍分支(拋 `opt.unit requires w-trade-backtest >= 1.1.40 …`)實際不可達,依主控「未給 `unit` 不載入該檔」之裁定保留,是否改靜態匯入待裁定.
- 日誌之「最大持倉名義」只取摘要可得之 `uTradeAllMax`;每單名義之範圍不在摘要內,未顯示.
- 混存警告只在 `useShowLog` 為 `true` 時輸出.

## 條件門檻之格點與交易次數之級距(`opt.thsCond`、`opt.levelNumTradeBounds`)

| 項 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| `opt.thsCond` 之檢測與轉換(數字或數字字串;嚴格遞增;至多 1,001 點) | 已做 | WS-GL-01 | `unit-estimKeysGridLevel`〈WS-GL-01 ~ 03〉 |
| 格點之編碼(`[...格點+vdir, ...格點−vdir]`;vdir = max(max\|格點\|, 2) × 5)與查表還原(格點原值;解值非可用值拋 `invalid x`) | 已做 | WS-GL-02 | 同上(含替身最佳化函數之子行程案) |
| `solve.thsCond`(給予時才記;不入 `tkid` 與檔名) | 已做 | WS-GL-03 | 同上 |
| 級距設定之檢測與轉換(`estimKeys`、`calcLevelNumTrade`、`genStrategyFileName` 共用;後兩者為設定物件 `opt.levelNumTradeBounds`;至多 101 個;`calcLevelNumTrade` 之回呼寫法照舊可用) | 已做 | WS-GL-04 | `unit-estimKeysGridLevel`〈WS-GL-04 ~ 08〉〈WS-GL-09〉 |
| 級距代碼 = 不大於交易次數之最大下界 | 已做 | WS-GL-05 | 同上 |
| `tkid`／檔名帶級距設定(`@下界`) | 已做 | WS-GL-06 | 同上 |
| 混用不同級距設定時互不覆寫 | 已做 | WS-GL-07 | 同上(混用案) |
| `solve.levelNumTradeBounds`(給予時才記) | 已做 | WS-GL-08 | 同上 |
| 未給時逐位不變 | 已做 | WS-GL-09 | 〈WS-GL-09〉+ 與 2.0.43 之對拍 |
| 不依賴特定期別;期別標籤依實際時間跨度換算之鍵名無碰撞 | 已做(程式未改,測試固化) | WS-KN-01 | 〈WS-KN-01〉 |
| 覆寫前比對舊檔之 `keys`(不同即 `hash collision`;舊檔無 `keys` 不比對) | 已做 | WS-KN-02 | `unit-estimKeysGuard`〈WS-KN-02〉 |

已知缺口與待辦:

- 混用不同級距設定只做到「互不覆寫、可分辨」,不拒絕混用(拒絕須資料夾標記或列舉全庫).
- 下游重算檔名者(例如策略庫重算工具)須傳入策略檔之 `solve.levelNumTradeBounds`,否則得預設級距之檔名.
- 格點只有「各 key 共用之顯式陣列」一種形式;「範圍 + 步長」與依 key／因子類別分別給未做.
- 預設格點之解值帶 `rang` 之累加誤差(入庫之門檻因取 3 位小數而整潔),為保逐位不變未改.

## 每根 K 線之秒數與時間口徑(`opt.intervalSec`、`opt.timeBasis`)

| 項 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| 給予時以回測套件之 `parseBarTime`(靜態匯入;下限 ≥ 1.1.43,不留舊版分支)檢測;以契約測試核對其實際回傳 | 已做 | WS-TB-01 | `unit-estimKeysTimeBasis`〈WS-TB-01 契約〉 |
| 只附加有給之鍵(接於既有鍵與 `unit` 之後;值為 `parseBarTime` 之回傳) | 已做 | WS-TB-02 | 〈WS-TB-02、03〉 |
| 只給 `intervalSec`／`'open'` 時績效數字同未給;`'span'` 依回測套件計算 | 已做(計算在回測套件) | WS-TB-03 | 同上 |
| 同 `tkid` 覆寫前之口徑 = 基礎單位 + 時間口徑(缺 `timeBasis` ≡ `'open'`;`'open'` 不計 `intervalSec`) | 已做 | WS-TB-04 | 〈WS-TB-04〉 |
| 自訂評估核心收到兩鍵 | 已做 | WS-TB-05 | 〈WS-TB-05〉 |

已知缺口與待辦:

- 時間口徑之警告只在 `useShowLog` 為 `true` 時輸出;回傳值不帶被覆寫之計數(待裁定).
- 口徑不同時不比優劣即覆寫(無損遷移〔以本次口徑重放舊策略再比〕未做,宜與基礎單位之同形規則一併處理);同一資料夾須單一口徑之前提只寫在文件.
- `intervalSec` 與 K 線實際間距不符時不檢查(回測套件亦不檢查).

## 止盈止損候選(`opt.thsTp`、`opt.thsSl`)

| 項 | 狀態 | 規則帳本 | 測試 |
|---|---|---|---|
| 給了而無效即 throw(非陣列、空陣列、元素非有效數字、0、負數、除以 100 取至小數 3 位後為 0),先於建夾與載入數據;數字字串轉為數值落地 | 已做 | WS-TP-01 | `unit-estimKeysGuard`〈WS-TP-01〉 |
| 入庫篩選門檻(`thNumTrade`、`thRWin`、`thREquivalentCumuProfitOrLossFinalNormYear`)維持無效用預設 | 已做(程式未改,測試固化) | WS-TP-02 | 〈WS-TP-02〉 |

已知缺口與待辦:

- 只檢「取捨後為正」,無上界(回測套件對 `settings.rTakeProfit`／`rStopLoss` 亦只要求正數).
- 下游(如策略庫套件)傳入之候選若含無效元素,改版後會於選項解析時即拋,而不再於求解途中或靜默求解.
