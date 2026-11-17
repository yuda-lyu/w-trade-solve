//子行程(測試用): 掛上noBaseUnitHook後載入本套件, 結果以一行JSON輸出
//  node test/tools/noBaseUnitRun.mjs <暫存夾> [missing|nodefault]
//  missing: 先確認鉤子擋下兩檔, 未給opt.unit求解一次、給opt.unit求解一次; nodefault: 只給opt.unit求解一次
//  module.register需Node >= 20.6(或18.19), 由呼叫端之測試先判定
import fs from 'fs'
import path from 'path'
import { register } from 'module'

let fdTmp = process.argv[2]
let mode = process.argv[3] || 'missing'
register('./noBaseUnitHook.mjs', { parentURL: import.meta.url, data: { mode } })

let out = { mode }

//鉤子生效之前提
if (mode === 'missing') {
    let blocked = 0
    for (let f of ['buildBaseUnitNotional', 'calcBaseUnitQuantity']) {
        try {
            await import(`w-trade-backtest/src/${f}.mjs`)
        }
        catch (err) {
            blocked++
        }
    }
    out.hook = blocked === 2 ? 'blocked' : `blocked ${blocked}`
}
else {
    let m = await import('w-trade-backtest/src/buildBaseUnitNotional.mjs')
    out.hook = typeof m.default === 'undefined' ? 'nodefault' : `default ${typeof m.default}`
}

let W = (await import('../../src/WTradeSolve.mjs')).default
out.aggregate = typeof W.estimKeys
let { default: estimKeys } = await import('../../src/estimKeys.mjs')
let { default: ott } = await import('../../src/ott.mjs')
let { buildFdData } = await import('../unit-setup.mjs')

let keys = ['btc_4hr_ma_1day']
let d = buildFdData(fdTmp, 'nobu', keys, { n: 30 })
let opt = { thsTp: [3], thsSl: [2], thNumTrade: 1, thRWin: 0, thREquivalentCumuProfitOrLossFinalNormYear: -1e9, Np: 6, NContiguous: 3, UseRepeat: false, UseImmigration: false }

if (mode === 'missing') {
    let m = await estimKeys(ott, 'btc', 'BTCUSDT', '4hr', d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, d.fdData, opt)
    out.noUnit = { stopExecutions: m.stopExecutions, nFiles: fs.readdirSync(d.fdData).length }
}

let fdData2 = path.resolve(fdTmp, 'nobu', 'withUnit')
try {
    await estimKeys(ott, 'btc', 'BTCUSDT', '4hr', d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData2, { ...opt, unit: { rule: { stepSize: 0.001, minQty: 0.001, minNotional: 20 } } })
    out.withUnit = 'resolved'
}
catch (err) {
    out.withUnit = err.message
}
out.withUnitFdData = fs.existsSync(fdData2)

//非物件之unit: 選項本身無效, 不因回測套件缺檔而報成缺檔(先於動態載入檢查)
if (mode === 'missing') {
    try {
        await estimKeys(ott, 'btc', 'BTCUSDT', '4hr', d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, path.resolve(fdTmp, 'nobu', 'badUnit'), { ...opt, unit: 'x' })
        out.badUnit = 'resolved'
    }
    catch (err) {
        out.badUnit = err.message
    }
}

console.log(JSON.stringify(out))
