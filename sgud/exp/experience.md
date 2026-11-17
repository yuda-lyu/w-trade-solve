# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## 研究用本金與基礎單位(`opt.uIni`、`opt.unit`)之實作經驗

- **數值類之判定與轉換用 `isenum` + `cdbl`,不用 `isnum`**:`isnum` 定義較寬,收 `'0x10'`、`'Infinity'`、`0`(正數判定需另加);正有限數之判定用 `isenum(v, { gt: 0 })`,通過後以 `cdbl` 轉為數值使用.`cdbl` 對非數字回 0,故須先判定、不可單獨使用.
- **檢測之值即使用之值**:輸入物件若含取值器(getter),每次讀取可能不同.先 `cloneDeep` 取一次各欄之值,其後檢測(`buildBaseUnitNotional`)與轉換皆用該副本;先檢測原物件、後複製會使落地值不是通過檢測者(測試 K4 取值器案可鑑別).
- **轉換不偏離回測套件之解析**:本套件之轉型(`cdbl`、`cint`)與回測套件 `buildBaseUnitNotional` 內之轉型為同一函數;以「轉換前後 `buildBaseUnitNotional(...).key` 相同」作為測試判準,日後回測套件改動轉型時此測試會轉紅.`buildBaseUnitNotional` 只回 `{ key, getNotional }`,不回轉換後之物件,故本套件須自行轉換.
- **V20 與動態載入之錯誤訊息**:`import()` 失敗之原生錯誤訊息含檔案路徑,不可直接帶入;只帶 `err.code`(限大寫英數底線).
- **新舊口徑之比對用 `buildBaseUnitNotional(...).key`**:同 key 即同口徑,自然涵蓋數字字串與數字之同值、緩衝與單位數取預設;查得時刻與來源等記錄欄不在 key 內,故不計.既有檔之 `unit` 無法解析(內容無效)者視為不同口徑.
- **日誌之 `console.log` 攔截測試**:各案內暫換 `console.log`,`finally` 還原;mocha 之輸出只在案與案之間,不會被攔到.
- **替身核心使同一策略資料夾恆為單一檔**:摘要之 `numTrade` 固定 ⇒ tkid 固定 ⇒ 檔名固定,可精準控制「既有較佳／較差」之等效年化,用於覆寫判定之測試(口徑混存)與鑑別前提(既有高於本次,無新規則時不覆寫).

## 未給新選項之前後對拍之作法

- 固定亂數須兩處:`Math.random`(換成 mulberry32)與 wsemi 之 `random`(載入時以 `new Date().getTime()` 為種子 ⇒ 載入期間暫時固定 `Date.prototype.getTime`,載入後還原);先以同一版本連跑兩次證明逐位相同(輸出夾路徑若出現在日誌中須先遮蔽,否則兩次必不同),再比對修改版與原版.
- 2.0.39 原版以 `git archive HEAD src` 解到 `./tmp/` 取得(不 checkout、不 stash);其 `node_modules` 由上層(套件根)解析.
- 對拍腳本本身須能鑑別:對副本植入任一細微改動(例如 `rFee`、日誌欄名),輸出須不同.

## 變異作法

- 變異一律在 `src/` 與測試之副本上做(`./tmp/` 下),不就地改 repo;每項自乾淨副本起算(等於還原),`find` 字串須在檔內恰出現一次,否則該項標錯誤而不執行.
- 測試之暫存資料夾用 `test/_tmp/<案名>/`(已被 `.gitignore`),與既有 `unit-setup.mjs` 之 `buildFdTmp`(`./test/tmp-unit-*`)並存;新測試依測試規範用前者.
