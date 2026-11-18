//子行程(測試用): 掛上gridLevelHook後載入本套件, 執行指定情境, 結果以最後一行JSON輸出
//  node test/tools/gridLevelRun.mjs <暫存夾> <omlOk|omlBad|omlAll>
//  module.register需Node >= 20.6(或18.19), 由呼叫端之測試先判定
import fs from 'fs'
import path from 'path'
import { register } from 'module'

let fdTmp = process.argv[2]
let mode = process.argv[3] || ''
register('./gridLevelHook.mjs', { parentURL: import.meta.url, data: { mode } })

let out = { mode }
let { default: estimKeys } = await import('../../src/estimKeys.mjs')
let { default: ott } = await import('../../src/ott.mjs')
let { buildFdData } = await import('../unit-setup.mjs')
let keys = ['btc_4hr_ma_1day']
let d = buildFdData(fdTmp, 'run', keys, { n: 30 })
let opt = { thsTp: [3], thsSl: [2], thNumTrade: 1, thRWin: 0, thREquivalentCumuProfitOrLossFinalNormYear: -1e9, Np: 6, NContiguous: 3, UseRepeat: false, UseImmigration: false }
let nFiles = (fd) => fs.existsSync(fd) ? fs.readdirSync(fd).length : 0
let call = async (tag, extra) => {
    let fd = path.resolve(fdTmp, 'run', tag)
    let r = ''
    try {
        await estimKeys(ott, 'btc', 'BTCUSDT', '4hr', d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fd, { ...opt, ...extra })
        r = 'resolved'
    }
    catch (err) {
        r = err.message
    }
    return { r, n: nFiles(fd), exists: fs.existsSync(fd) }
}

if (mode === 'omlOk' || mode === 'omlBad') {

    //鉤子生效之前提: 替身最佳化函數
    let m = await import('w-optimization/src/omlPSO.mjs')
    out.hook = m.isStub === true ? 'stub' : 'real'

    //給thsCond
    let g = await call('grid', { thsCond: [-1, 0, 1] })
    out.grid = g.r
    out.gridFiles = g.n

    //未給thsCond(既有之扣除平移後取捨)
    if (mode === 'omlBad') {
        out.def = (await call('def', {})).r
    }

}

if (mode === 'omlAll') {

    //鉤子生效之前提: 替身最佳化函數(依序評估最後一個設計變數之全部可用值)
    let m = await import('w-optimization/src/omlPSO.mjs')
    out.hook = m.isStub === true ? 'stub' : 'real'

    //2個key, 格點[-1, 0.5, 3]: 最後一個key之可用值為6個, 依序各評估一次; 替身核心記錄該key之(符號, 門檻)
    let keys2 = ['btc_4hr_ma_1day', 'btc_4hr_rsi_6hr']
    let d2 = buildFdData(fdTmp, 'run2', keys2, { n: 30 })
    let seen = []
    let core = async ({ strategy }) => {
        let c = strategy.conds[1]
        seen.push([c.sym, c.th])
        return { summary: { numTrade: 5, rWin: '60.00%', uEquityFinal: 1200, rEquivalentCumuProfitOrLossFinalNormYear: '20.00%' } }
    }
    let fd = path.resolve(fdTmp, 'run2', 'all')
    try {
        await estimKeys(ott, 'btc', 'BTCUSDT', '4hr', d2.fdOhlc, d2.fdParam, d2.timeStart, d2.timeEnd, 'long', keys2, fd, { ...opt, funRunStrategyCustom: core, thsCond: [-1, 0.5, 3] })
        out.r = 'resolved'
    }
    catch (err) {
        out.r = err.message
    }
    out.seen = seen
    out.info = globalThis.__omlInfo || null

}

console.log(JSON.stringify(out))
