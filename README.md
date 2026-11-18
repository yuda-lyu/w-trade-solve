# w-trade-solve
A tool for solve trade params.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-trade-solve.svg?style=flat)](https://npmjs.org/package/w-trade-solve) 
[![license](https://img.shields.io/npm/l/w-trade-solve.svg?style=flat)](https://npmjs.org/package/w-trade-solve) 
[![npm download](https://img.shields.io/npm/dt/w-trade-solve.svg)](https://npmjs.org/package/w-trade-solve) 
[![npm download](https://img.shields.io/npm/dm/w-trade-solve.svg)](https://npmjs.org/package/w-trade-solve) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-trade-solve.svg)](https://www.jsdelivr.com/package/npm/w-trade-solve)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-trade-solve/global.html).

## Installation

### Using npm(ES6 module):
```alias
npm i w-trade-solve
```

#### Example:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-trade-solve/blob/master/g.mjs)]
```alias
import fs from 'fs'
import path from 'path'
import ott from 'w-trade-solve/src/ott.mjs' //時區時間函數由外部傳入, 可用src/ott.mjs或自行以dayjs包裝
import wts from 'w-trade-solve'


async function test() {

    //示範用資料夾, fdOhlc 放 K 線序列, fdParam 放指標參數序列, 各以 `${key}.json` 儲存
    //  fdData 為求得策略之儲存資料夾, 不存在時由 estimKeys 自動建立
    let fdOhlc = './tmp/data-ohlc'
    let fdParam = './tmp/data-param'
    let fdData = './tmp/data-strategy'
    fs.rmSync(fdData, { recursive: true, force: true })
    fs.mkdirSync(fdOhlc, { recursive: true })
    fs.mkdirSync(fdParam, { recursive: true })

    //name, symbol, interval, 幣種設定
    //  name 與 interval 用於組出 K 線序列 key(`${name}_price_${interval}`)與縮寫 tid
    let name = 'btc'
    let symbol = 'BTCUSDT'
    let interval = '4hr'

    //arrOhlc 與 arrParam, 20 根 4hr K 線與對應之指標序列(以 sin/cos 合成之示範資料)
    let arrOhlc = []
    let arrParam = []
    let c = 100
    for (let i = 0; i < 20; i++) {
        let time = new Date(Date.UTC(2020, 0, 1) + i * 4 * 3600 * 1000).toISOString().slice(0, 19)
        let o = c
        c = c + Math.sin(i * 0.31) * 2 + Math.cos(i * 0.11) * 1.5
        arrOhlc.push({ time, Open: o, High: Math.max(o, c) + 1, Low: Math.min(o, c) - 1, Close: c })
        arrParam.push({ time, param: Math.sin(i * 0.17) })
    }
    fs.writeFileSync(path.resolve(fdOhlc, 'btc_price_4hr.json'), JSON.stringify(arrOhlc), 'utf8')
    fs.writeFileSync(path.resolve(fdParam, 'price_ohlc_Close_param_ma_1day.json'), JSON.stringify(arrParam), 'utf8')

    //keys, 待率定門檻之指標 key, 各 key 於 fdParam 內須有對應之 `${key}.json`
    let keys = ['price_ohlc_Close_param_ma_1day']

    //estimKeys, 以最佳化演算法率定[止損, 止盈, 各 key 門檻], 逐次以 runStrategy 回測並取 fitness 最小者
    //  滿足 thNumTrade / thRWin / thREquivalentCumuProfitOrLossFinalNormYear 三門檻之參數組會存入 fdData
    //  opt 除下列各欄位外皆傳遞至演算法, 故可一併給 Np / NContiguous 等求解設定
    let m = await wts.estimKeys(ott, name, symbol, interval, fdOhlc, fdParam, arrOhlc[0].time, arrOhlc[19].time, 'long', keys, fdData, {
        thsTp: [3], //止盈候選(%), 僅給 1 點使示範較快收斂
        thsSl: [2], //止損候選(%)
        thNumTrade: 5, //至少 5 筆交易才存檔
        thRWin: 0.5, //勝率至少 50% 才存檔
        thREquivalentCumuProfitOrLossFinalNormYear: 0, //等效年化盈虧至少 0 才存檔
        methodOml: 'PSO', //可選 'RGA' / 'DE' / 'HS' / 'PSO' / 'ACO', 預設 'PSO'
        Np: 8, //PSO 之粒子數, 預設 40
        NContiguous: 5, //最佳解連續未更新次數上限, 預設 100
    })

    //停止機制, 由所選演算法之設定決定, 此處為 NContiguous 達 5 而停止
    console.log(m.stopMode)
    // => 'stop by iContinue[5] >= NContiguous[5]'

    //設計變數為[止損, 止盈, 各 key 門檻], 故個數為 2 + keys 個數
    //  各 key 門檻之解值帶有平移量 10, 大於 0 代表'>'條件、小於 0 代表'<'條件, 還原時扣除平移量
    //  estimKeys 為隨機求解, 故以下各數值每次執行皆不同, 僅結構固定
    console.log(m.bestSolution.ps.length, m.bestSolution.ps)
    // => 3 [
    //   { ind: 0, value: 0.02 },
    //   { ind: 0, value: 0.03 },
    //   { ind: 63, value: -9.799999999999999 }
    // ]

    //readStrategies, 讀回 fdData 內之策略, tkid 為`${tid}:${交易次數級距}`, 同 tkid 僅保留等效年化盈虧最佳者
    let ss = wts.readStrategies(fdData, { readContent: true })
    ss.sort((a, b) => (a.tkid < b.tkid ? -1 : (a.tkid > b.tkid ? 1 : 0))) //列檔順序隨作業系統而異, 依 tkid 排序使輸出固定
    console.log(ss.map((s) => {
        return `${s.tkid} → ${s.rEquivalentCumuProfitOrLossFinalNormYear}`
    }))
    // => [
    //   'long ║ p_ohlc_c_param_ma_1day:1 → 194.67%',
    //   'long ║ p_ohlc_c_param_ma_1day:11 → 839.50%',
    //   'long ║ p_ohlc_c_param_ma_1day:2 → 644.83%'
    // ]

    //策略內容含還原後之 conds(門檻已扣除平移量)與回測所用之 settings
    console.log(ss[0].data.conds, ss[0].data.settings)
    // => [ { key: 'price_ohlc_Close_param_ma_1day', sym: '<', th: 0.3 } ] {
    //   uIni: 1000,
    //   uTrade: 1,
    //   rTakeProfit: 0.03,
    //   rStopLoss: 0.02,
    //   rFee: 0.0005
    // }

    //genTid, 策略種類識別碼, 僅由 mode 與 keys 決定, 並將 `${name}_`、`${interval}_` 等樣式縮寫
    console.log(wts.genTid('btc', '4hr', 'long', keys))
    // => 'long ║ p_ohlc_c_param_ma_1day'

    //calcLevelNumTrade, 交易次數之級距代碼, 使不同交易次數規模之策略各自保留最佳者
    console.log(wts.calcLevelNumTrade(3), wts.calcLevelNumTrade(30), wts.calcLevelNumTrade(300))
    // => 1 12 102

    //genStrategyFileName, 策略儲存檔名, 為`${mode}_${級距}_${雜湊16碼}.json`, 雜湊由coin、interval、tid與級距算出
    //  檔名為tkid之純函數且長度固定, 同tkid恆對應同一檔名, 故存檔端可直查覆寫而不需列舉全庫
    console.log(wts.genStrategyFileName('btc', '4hr', 'long', keys, {}, { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '31.25%' }))
    // => 'long_12_b13ab15faf71e367.json'

    //calcFitness, 求解所用之目標函數值, 越小越佳, 由勝率(權重 2)與等效年化盈虧(權重 1)組成
    console.log(wts.calcFitness({ uIni: 1000 }, { numTrade: 30, uEquityFinal: 1200, rWin: '60%', rEquivalentCumuProfitOrLossFinalNormYear: '25%' }))
    // => 1.3

}
test()
    .catch((err) => {
        console.log('catch', err)
    })


```

### 研究用本金與基礎單位(`opt.uIni`、`opt.unit`)
`estimKeys`(及經 `opt` 原樣傳遞之 `estimPicks`／`estimComps`／`estimFinder`)可另給:

| 選項 | 形狀 | 行為 |
|---|---|---|
| `uIni` | 有效正數(數字或數字字串),預設 1000 | 通過檢測即轉為數值,寫入策略之 `settings.uIni`(研究用本金;只是夠大之名目值,績效以等效年化計).給予而非有效正數即 throw `invalid opt.uIni: must be a positive number` |
| `unit` | 一般物件 `{ rule, buffer, units }`,預設 `null` | 下單之基礎單位 = 交易所之最小可下單數量(`w-trade-backtest` ≥ 1.1.40 之 `settings.unit`;`rule = { stepSize, minQty, minNotional }`,各為有效數字或數字字串且大於 0,可另帶查得時刻與來源等記錄欄,原樣落地).通過檢測後複製,並以 `buildBaseUnitNotional` 回傳之轉型後選項(`rule` 三欄、`buffer`、`units` 皆為數值,`units` 為整數;`buffer`、`units` 為 `null` 或未給時為預設 0.1 與 1,不寫入 `null`)覆蓋副本之對應欄位(本套件不另自行轉換;交易規則之記錄欄與 `unit` 之其他欄原樣保留),寫入策略之 `settings.unit`(每個策略各一份副本),回測依此定每單名義(不讀 `uTrade`).無效即 throw(訊息以 `invalid opt.unit` 起頭、不含輸入值),於載入數據前.給予時才動態載入 `w-trade-backtest/src/buildBaseUnitNotional.mjs` 並以之檢測(與回測各路徑檢測 `settings.unit` 者同一函數);該檔不存在或無預設匯出之函數時 throw `opt.unit requires w-trade-backtest >= 1.1.40 (src/buildBaseUnitNotional.mjs)…`;未給時不載入 |

- 未給 `uIni` 與 `unit`(或為 `null`)時,策略之 `settings` 與求解行為逐位不變(`{ uIni: 1000, uTrade: 1, rTakeProfit, rStopLoss, rFee: 0.0005 }`).
- 數值收數字或數字字串,通過檢測即轉為數值後使用與落地:策略檔內為數值,不是呼叫端給的原字串;`unit` 落地者即 `buildBaseUnitNotional` 回傳之轉型後選項(不偏離回測套件之解析).
- 給 `unit` 時 `settings` 為既有五鍵後接 `unit`;`uTrade` 仍記 1 但回測不讀.
- 給 `unit` 時,自訂評估核心(`funRunStrategyCustom`／`funRunStrategyCustomBeforeSave`)須依 `strategy.settings.unit` 計每單名義(例:`buildStrategyFastSession` 之 `evaluate` 原樣傳入 `settings`),否則策略檔所記之 `unit` 與摘要不一致.
- `unit` 之檢測以價格 1 試算一次(步長格數超過安全整數、或數量與名義超出雙精度範圍即拋錯);實際價位遠低於 1 且步長極小(格數過大)、或遠高於 1 而名義超出雙精度範圍者,於回測時才拋錯.
- **單一策略不設持倉門檻**:最大持倉名義(`summary.uTradeAllMax`;給 `unit` 時為實際名義,完整摘要另有同時持倉筆數 `numTradeAllMax`)是否超過 `uIni` 不檢、不剔除,只隨摘要落地;入庫三門檻與適應函數不變(皆與本金之大小無關).持倉組合是否超過本金由挑選端判定,不在本套件.
- 檔名只依幣種、週期、指標組成與交易次數級距;`unit` 只改每單名義、不改進場與交易次數,故同一策略之檔名不變.
- **新舊口徑混存**:同 tkid 已有策略時,若既有策略檔之 `settings.unit` 與本次不同(一方有一方無,或交易規則三欄、緩衝、單位數不同;查得時刻與來源不計,數字字串與數字之同值視為相同),不以等效年化比較,以本次口徑覆寫,並於 `useShowLog` 為 `true` 時於日誌記一行警告(不帶值);口徑相同者照舊以等效年化比較.
- `useShowLog` 之日誌:未給 `unit` 時「每次下單金額」為 `uTrade`;給 `unit` 時各單名義依基礎單位而異,改顯示「最大持倉名義(基礎單位)」(摘要之 `uTradeAllMax`,摘要缺此欄時為空字串).
- 測試(以模組解析鉤子模擬回測套件缺檔)需 Node ≥ 20.6(或 18.19)之 `module.register`;不支援之版本略過該案並印出原因.

```js
let m = await wts.estimKeys(ott, name, symbol, interval, fdOhlc, fdParam, timeStart, timeEnd, 'long', keys, fdData, {
    uIni: 10000, //研究用本金
    unit: { rule: { stepSize: 0.001, minQty: 0.001, minNotional: 20, asOf: '2026-01-01T00:00:00', source: 'exchangeInfo' }, buffer: 0.1, units: 1 }, //交易規則之數值為例
})
```

### 條件門檻之格點與交易次數之級距(`opt.thsCond`、`opt.levelNumTradeBounds`)
`estimKeys`(及經 `opt` 原樣傳遞之 `estimPicks`／`estimComps`／`estimFinder`)可另給:

| 選項 | 形狀 | 行為 |
|---|---|---|
| `thsCond` | 非空陣列且至多 1,001 點,元素為有效數字或數字字串,轉為數值後須嚴格遞增;預設 `null` | 各 key 之條件門檻改以此為格點(各 key 共用,`>` 與 `<` 兩方向相同)。每個 key 之設計變數可用值為格點數之 2 倍(兩方向各一組),入庫之 `conds[].th` 必為所給格點之一(原值,不取捨小數位;還原時查表,不經浮點運算)。**轉為數值之格點全量記於每個策略檔之 `solve.thsCond`**(點數越多,每檔越大)。無效即 throw `invalid opt.thsCond: must be a non-empty array of at most 1001 strictly increasing finite numbers`(不含輸入值) |
| `levelNumTradeBounds` | 非空陣列且至多 101 個,元素為正整數或整數字串,轉為數值後須嚴格遞增;預設 `null` | 交易次數之級距改以此為各級距之下界:級距代碼 = 不大於交易次數之最大下界(小於首個下界者為 0,末級距不設上限;例:`[1, 3, 6]` 時 0 → 0、1 ~ 2 → 1、3 ~ 5 → 3、≥ 6 → 6)。`tkid` 為 `${tid}:${級距}@${下界以逗號串接}`,檔名仍為 `${mode}_${級距}_${雜湊16碼}.json`(雜湊輸入含此 `tkid`)。**轉為數值之下界記於每個策略檔之 `tkid` 與 `solve.levelNumTradeBounds`**。無效即 throw `invalid opt.levelNumTradeBounds: must be a non-empty array of at most 101 strictly increasing positive integers`(不含輸入值) |

- 檢測之時點:直接呼叫 `estimKeys` 時,於建立 `fdData` 與載入數據之前;經 `estimPicks`／`estimComps`／`estimFinder` 呼叫時,`fdParam` 內指標 key 之列舉與 `funFilterKeys*` 回呼先於檢測執行(不寫檔),檢測仍先於建立 `fdData` 與寫檔(與 `uIni`、`unit` 相同)。
- 未給 `thsCond` 與 `levelNumTradeBounds`(或為 `null`)時,格點、級距、`tkid`、檔名、策略檔內容與求解行為逐位不變(格點為 -2 ~ 2、步長 0.1 共 41 點,還原之門檻取至小數 3 位;級距為 `calcLevelNumTrade` 之預設)。
- 格點宜以整數相除產生(例:`Array.from({ length: 31 }, (v, i) => (i - 15) / 5)` 得 -3、-2.8、…、3),各點即為其十進位寫法之值;以 `start + k * step` 累加者帶浮點誤差,會原樣落地(例 `0.30000000000000004`)。
- 格點超出 ±2 時,解值之平移量隨之放大(平移量 = max(格點絕對值之最大者, 2) × 5;格點落於 ±2 內者同為 10),解值大於 0 仍代表 `>`、小於 0 代表 `<`;相鄰格點相距過近而平移後無法以雙精度分辨者視為無效。
- **同一資料夾混用不同級距設定**:級距設定不同者之 `tkid` 與檔名必不相同,故各自去重、互不覆寫(既有之策略不會被另一種級距設定之策略覆寫);同一策略種類之兩種級距版本會並存,讀取端以 `tkid` 之 `@` 後段或 `solve.levelNumTradeBounds` 區分。建議一個資料夾只用一種級距設定;**若混放,列舉全夾之下游(例如挑選池)須依級距設定分組(`tkid` 之 `@` 段或 `solve.levelNumTradeBounds`),勿跨設定合併計數**,否則同一策略會被算兩次。
- `calcLevelNumTrade(numTrade, { levelNumTradeBounds })` 與 `genStrategyFileName(coin, interval, mode, keys, settings, summary, { levelNumTradeBounds })` 亦收同一設定(第 2 / 第 7 參數為設定物件;`calcLevelNumTrade` 之第 2 參數非物件者——例如作為 `[3, 30].map(calcLevelNumTrade)` 之回呼時所收之索引——視為未給,照舊可用)。以自訂級距求得之策略,事後重算檔名(例如策略庫重算工具)須傳入同一設定(可取自策略檔之 `solve.levelNumTradeBounds`),否則得預設級距之檔名。
- `thsCond` 不參與檔名與 `tkid`(與止盈止損候選相同,屬搜尋空間);同一資料夾內以不同格點求得之同 `tkid` 策略照舊以等效年化比較、較佳者覆寫。
- **覆寫前比對 `keys`**:`tid` 由指標 key 縮寫而得(剔除 `${name}_`、`${interval}_` 等樣式),縮寫後相同而 key 不同者(例:週期 `4hr` 下 `btc_4hr_ma_1day` 與 `ma_1day`)之 `tkid` 與檔名皆同.同 `tkid` 已有策略時,除 `tkid`、`name`、`interval` 外另比對舊檔之 `keys`(舊檔有 `keys` 者)與本次相同,不同即 throw `hash collision: …`(訊息不帶 key 之值),不以等效年化互相覆寫;`keys` 相同者行為不變,舊檔無 `keys`(舊版所存)者不比對.

```js
let m = await wts.estimKeys(ott, name, symbol, '1day', fdOhlc, fdParam, timeStart, timeEnd, 'long', keys, fdData, {
    thsCond: Array.from({ length: 31 }, (v, i) => (i - 15) / 5), //門檻格點 -3 ~ 3、步長 0.2
    levelNumTradeBounds: [1, 3, 6, 10, 20, 40], //交易次數之級距下界
})
```

### 每根 K 線之秒數與時間口徑(`opt.intervalSec`、`opt.timeBasis`)
`estimKeys`(及經 `opt` 原樣傳遞之 `estimPicks`／`estimComps`／`estimFinder`)可另給,名稱與語意同 `w-trade-backtest` 之 `settings.intervalSec`、`settings.timeBasis`(**需 `w-trade-backtest` ≥ 1.1.43**):

| 選項 | 形狀 | 行為 |
|---|---|---|
| `intervalSec` | 每根 K 線之秒數(正整數或整數字串;**判準由回測套件定**);預設 `null` | 附加於策略之 `settings.intervalSec`(以回測套件檢測後之轉型值寫入)。只給此鍵(或 `timeBasis` 為 `'open'`)不改任何績效數字。**須與 K 線之實際間距一致**(本套件與回測套件皆不檢查;不符時 `'span'` 之回測天數失真) |
| `timeBasis` | `'open'`(以 K 線開盤時刻計,同既有)或 `'span'`(計入每根 K 線之時距,須同時給 `intervalSec`);預設 `null`(等同 `'open'`) | 附加於策略之 `settings.timeBasis`。`'span'` 時持倉天數與回測天數依實際時點計,等效年化隨之改變,故**入庫門檻與適應值亦隨之**;交易次數與勝率不變,故級距與檔名不變 |

- 給予任一者時,以 `w-trade-backtest/src/barTime.mjs` 之預設匯出 `parseBarTime` 檢測(與回測各路徑同一函數;判準與訊息由回測套件定,訊息以 `invalid opt.intervalSec`、`invalid opt.timeBasis` 起頭,不含輸入值)。本套件之 `package.json` 對 `w-trade-backtest` 之下限須 ≥ 1.1.43(含該檔),不另處理舊版。檢測之時點同上節。
- 只附加有給之鍵(寫入 `parseBarTime` 回傳之轉型值),接於既有鍵(含 `unit`)之後,鍵序 `intervalSec`、`timeBasis`;未給時 `settings` 之鍵與鍵序逐位不變。
- **同 `tkid` 新舊並存時之口徑判斷**擴為「基礎單位 + 時間口徑」:缺 `timeBasis` 等同 `'open'`;`'open'` 時不計 `intervalSec`(既有策略與本次只差 `intervalSec` 者為同一口徑,照舊以等效年化比較);`'span'` 與 `'open'` 不同、`'span'` 之 `intervalSec` 不同亦不同,口徑不同時不比等效年化、以本次口徑覆寫,`useShowLog` 為 `true` 時日誌記一行 `警告: 既有策略與本次之時間口徑不同, 以本次口徑覆寫(不比較等效年化)`(只帶檔名)。
- **同一資料夾之所有寫入者須用同一時間口徑**(含長時間執行中之求解、重算與普測工具):因口徑不同即不比優劣而覆寫,在已改用 `'span'` 之資料夾以未給此二選項之呼叫端續跑,會把該呼叫端碰到之策略逐一改回 `'open'`(其中可能有變差者),之後再以 `'span'` 續跑又逐一改回,反之亦然;`'span'` 之秒數不同者亦同。轉傳此二選項之上游(例如策略庫套件之設定白名單)須先支援並確實轉傳,才可讓任何資料夾改用 `'span'`;同一資料夾之各輪設定須一致。
- 自訂評估核心(`funRunStrategyCustom`／`funRunStrategyCustomBeforeSave`)收到之 `strategy.settings` 含此二鍵,須依之計算(例:`buildStrategyFastSession` 之 `evaluate` 原樣傳入 `settings`),否則策略檔所記之口徑與摘要不一致。

```js
let m = await wts.estimKeys(ott, name, symbol, '1day', fdOhlc, fdParam, timeStart, timeEnd, 'long', keys, fdData, {
    intervalSec: 86400, //每根 K 線之秒數
    timeBasis: 'span', //依實際時點計持倉天數與回測天數
})
```

### 止盈止損候選(`opt.thsTp`、`opt.thsSl`)之檢測
止盈止損影響下單之金額與回測結果,故給了而無效即拒絕、不改用預設(跨套件規格〈輸入參數之檢測機制〉§11);`estimKeys`(及經 `opt` 原樣傳遞之 `estimPicks`／`estimComps`／`estimFinder`)之 `thsTp`、`thsSl`:

| 選項 | 形狀 | 行為 |
|---|---|---|
| `thsTp`(止盈)、`thsSl`(止損) | 非空陣列,元素為正數(數字或數字字串,通過即轉為數值使用並落地於 `solve.thsTp`、`solve.thsSl`),且**除以 100 取至小數 3 位後仍大於 0**(即不得為 0、負數,或小於 0.05);`null` 或未給為預設 1 ~ 10(%) | 無效即 throw `invalid opt.thsTp: must be a non-empty array of positive numbers that stay positive after rounding`(`thsSl` 同式;不含輸入值),先於建立 `fdData` 與載入數據。檢測之口徑同 `w-trade-backtest` 之 `settings.rTakeProfit`、`settings.rStopLoss`(須為正數)與本套件實際取用之值(`round(候選 / 100, 3)`),故通過者滿足回測套件對 `settings.rTakeProfit`、`settings.rStopLoss` 之檢測,不會在求解途中(建夾之後)才因此拋錯 |

- `thNumTrade`、`thRWin`、`thREquivalentCumuProfitOrLossFinalNormYear` 為入庫之篩選門檻(不影響下單金額),維持無效時改用預設(1、0.5、0.15),不拋錯.
- 數字字串之候選(例:`'3'`)轉為數值落地(`solve.thsTp` 為 `[3]` 而非 `['3']`);候選為數字者與既有逐位相同.

### 預設值與 K 線週期
`interval` 只作標籤(K 線序列之 key、`tid` 之縮寫、檔名雜湊),本套件之預設值皆**與 K 線週期無關**,係依 4hr 策略庫之規模所訂:

| 選項 | 預設 | 不同週期時宜檢視 |
|---|---|---|
| `thsTp`／`thsSl` | 1 ~ 10(%)(給了須為有效候選,見上節) | 較長週期(例:日線)之單根漲跌幅較大,小止盈止損常於同一根同時觸及(回測依其規則判先後),入庫者易貼上限;宜另給較寬之候選 |
| `thNumTrade` | 1 | 較長週期之訓練期根數少、交易次數少;門檻宜依根數調整 |
| `thRWin`／`thREquivalentCumuProfitOrLossFinalNormYear` | 0.5／0.15 | 與週期無直接關係(等效年化已年化) |
| `thsCond` | -2 ~ 2、步長 0.1 | 因子之尺度隨週期或正規化方式不同時,宜檢視其分布後給格點(範圍與步長) |
| `levelNumTradeBounds` | 預設級距(1 ~ 5、6 ~ 9、10 ~ 24、…、≥ 5000) | 較長週期之交易次數少,高級距到不了、低級距過粗;宜給較細之下界(例:`[1, 3, 6, 10, 20, 40]`) |
| `intervalSec`／`timeBasis` | 不附加(等同 `'open'`) | 以開盤時刻標籤計持倉天數與回測天數,較長週期之偏差較大(例:日線之持倉天數多算 1 日、回測天數少算末根);需依實際時點計者給 `timeBasis: 'span'` 與 `intervalSec` |

### Breaking changes
- `estimKeys` 之 `opt.thsTp`、`opt.thsSl`:給了而無效(非陣列、空陣列、元素非有效數字、0、負數、除以 100 取至小數 3 位後為 0)原靜默改用預設或於求解途中才拋錯,現於選項解析時即 throw(先於建立 `fdData` 與載入數據);數字字串之候選原樣落地於 `solve.thsTp`、`solve.thsSl`,現轉為數值.未給、`null`、`undefined` 與有效之數字候選不受影響.
- 同 `tkid` 已有策略檔時,覆寫前另比對舊檔之 `keys`(舊檔有 `keys` 者);縮寫後 `tid` 相同而 `keys` 不同者原會以等效年化互相覆寫,現 throw `hash collision`.
- 相依之 `w-trade-backtest` 須 ≥ 1.1.43(`src/barTime.mjs`),`package.json` 之下限已同步.

規則與測試表見 `sgud/rule/rulebook.md`.
