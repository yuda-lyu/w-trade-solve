import fs from 'fs'
import path from 'path'
import ott from './src/ott.mjs'
import wts from './src/WTradeSolve.mjs'


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


//node g.mjs
