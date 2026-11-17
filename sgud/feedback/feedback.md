# 回饋

本檔記錄任務中發現之自有套件、全域技能、全域設定之調整與抽提提案,一條一列,只增不改(處置結果另記一列,寫明承接哪一列);回饋是紀錄與提案,實際修改走各自之通報管道.

| 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|
| 2026-11-18 | 自有套件 | w-trade-backtest | `buildBaseUnitNotional` 只回 `{ key, getNotional }`,不回轉型後之 `{ rule, buffer, units }`;呼叫端為把實際採用之數值落地(策略檔須可重現),只得自行以同樣之轉型函數(`cdbl`、`cint`)重做轉換,再以轉換前後之 `key` 相同確認未偏離——回測套件日後改動轉型即有偏離風險.建議:另回轉型後之選項(例如 `unit` 欄,一般物件),供呼叫端直接落地 | `src/estimKeys.mjs`(選項解析處之 `unit.rule.stepSize = cdbl(...)` 等);`test/unit-estimKeysBaseUnit.test.mjs`〈K4: 各種數字字串寫法轉換前後之…key相同〉 |
| 2026-11-18 | 自有套件 | wsemi | 數值選項之「判定 + 轉換」須兩步:`isenum(v, { gt: 0 })` 後再 `cdbl(v)`,而 `cdbl` 對非數字回 0(單獨使用會把無效輸入變成 0);`verifyValue` 用較寬之 `isnum` 系且不轉換值.建議:提供以 `isenum`／`iseint` 語意判定並一併回傳轉換值之單值檢測函數(跨套件規格〈輸入參數之檢測機制〉§7 已列此需求),使各套件不各自組合 | `src/estimKeys.mjs`(`opt.uIni` 之 `isenum` 與 `cdbl`) |
