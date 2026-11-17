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
    fs.writeFileSync(path.resolve(fdParam, 'btc_4hr_ma_1day.json'), JSON.stringify(arrParam), 'utf8')

    //keys, 待率定門檻之指標 key, 各 key 於 fdParam 內須有對應之 `${key}.json`
    let keys = ['btc_4hr_ma_1day']

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
    console.log(ss.map((s) => {
        return `${s.tkid} → ${s.rEquivalentCumuProfitOrLossFinalNormYear}`
    }))
    // => [
    //   'long ║ ma_1day:1 → 194.67%',
    //   'long ║ ma_1day:11 → 839.50%',
    //   'long ║ ma_1day:2 → 644.83%'
    // ]

    //策略內容含還原後之 conds(門檻已扣除平移量)與回測所用之 settings
    console.log(ss[0].data.conds, ss[0].data.settings)
    // => [ { key: 'btc_4hr_ma_1day', sym: '<', th: 0.3 } ] {
    //   uIni: 1000,
    //   uTrade: 1,
    //   rTakeProfit: 0.03,
    //   rStopLoss: 0.02,
    //   rFee: 0.0005
    // }

    //genTid, 策略種類識別碼, 僅由 mode 與 keys 決定, 並將 `${name}_`、`${interval}_` 等樣式縮寫
    console.log(wts.genTid('btc', '4hr', 'long', keys))
    // => 'long ║ ma_1day'

    //calcLevelNumTrade, 交易次數之級距代碼, 使不同交易次數規模之策略各自保留最佳者
    console.log(wts.calcLevelNumTrade(3), wts.calcLevelNumTrade(30), wts.calcLevelNumTrade(300))
    // => 1 12 102

    //genStrategyFileName, 策略儲存檔名, 為`${mode}_${級距}_${雜湊16碼}.json`, 雜湊由coin、interval、tid與級距算出
    //  檔名為tkid之純函數且長度固定, 同tkid恆對應同一檔名, 故存檔端可直查覆寫而不需列舉全庫
    console.log(wts.genStrategyFileName('btc', '4hr', 'long', keys, {}, { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '31.25%' }))
    // => 'long_12_a7578526a1fc57d8.json'

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
| `unit` | 一般物件 `{ rule, buffer, units }`,預設 `null` | 下單之基礎單位 = 交易所之最小可下單數量(`w-trade-backtest` ≥ 1.1.40 之 `settings.unit`;`rule = { stepSize, minQty, minNotional }`,各為有效數字或數字字串且大於 0,可另帶查得時刻與來源等記錄欄,原樣落地).通過檢測後複製,`rule` 三欄、`buffer`、`units` 之數字字串轉為數值(`units` 為整數),`buffer`、`units` 為 `null` 或未給時補 0.1 與 1(不寫入 `null`),寫入策略之 `settings.unit`(每個策略各一份副本),回測依此定每單名義(不讀 `uTrade`).無效即 throw(訊息以 `invalid opt.unit` 起頭、不含輸入值),於載入數據前.給予時才動態載入 `w-trade-backtest/src/buildBaseUnitNotional.mjs` 並以之檢測(與回測各路徑檢測 `settings.unit` 者同一函數);該檔不存在或無預設匯出之函數時 throw `opt.unit requires w-trade-backtest >= 1.1.40 (src/buildBaseUnitNotional.mjs)…`;未給時不載入 |

- 未給 `uIni` 與 `unit`(或為 `null`)時,策略之 `settings` 與求解行為逐位不變(`{ uIni: 1000, uTrade: 1, rTakeProfit, rStopLoss, rFee: 0.0005 }`).
- 數值收數字或數字字串,通過檢測即轉為數值後使用與落地:策略檔內為數值,不是呼叫端給的原字串;轉換前後以 `buildBaseUnitNotional(...).key` 比對一致(不偏離回測套件之解析).
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

規則與測試表見 `sgud/rule/rulebook.md`.
