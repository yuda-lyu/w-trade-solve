import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import * as nodeModule from 'module'
import { fileURLToPath } from 'url'
import runStrategy from 'w-trade-backtest/src/runStrategy.mjs'
import buildStrategyFastSession from 'w-trade-backtest/src/buildStrategyFastSession.mjs'
import buildBaseUnitNotional from 'w-trade-backtest/src/buildBaseUnitNotional.mjs'
import omlPSO from 'w-optimization/src/omlPSO.mjs'
import dataProvide from 'w-data-tdprovide'
import estimKeys from '../src/estimKeys.mjs'
import estimFinder from '../src/estimFinder.mjs'
import readStrategies from '../src/readStrategies.mjs'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import calcFitness from '../src/calcFitness.mjs'
import ott from '../src/ott.mjs'
import { buildFdData, name, symbol, interval } from './unit-setup.mjs'


//規格來源: sgud/rule/rulebook.md 之 WS-BU-01 ~ WS-BU-08 與 src/estimKeys.mjs、src/genStrategyFileName.mjs 之 JSDoc(研究用本金 uIni、基礎單位 unit)
//  S1 策略之settings為{uIni,uTrade,rTakeProfit,rStopLoss,rFee}, uIni取opt.uIni(未給為1000); 給opt.unit時另含unit(補齊buffer與units: null或未給時補預設、不寫入null; 交易規則之其他欄位原樣保留), 隨策略檔落地(交易規則與緩衝之記錄)
//  K4 數值類收數字或數字字串, 判定通過即轉為數值, 其後一律用轉換值(dspec 輸入參數之檢測機制 K4、K7): uIni、unit之rule三欄、buffer、units落地前轉為數值(units為整數), 轉換前後之buildBaseUnitNotional(...).key相同; 檢測之值即使用之值
//  S2 給opt.unit時回測依基礎單位定每單名義(settings.unit原樣交給w-trade-backtest), 進場與交易次數不變
//  S3 單一策略不設持倉門檻: 最大持倉名義是否超過uIni不檢、不剔除、不中止, 只隨summary落地; 入庫條件與適應值不因uIni或unit而變(適應函數與本金大小無關); 自訂評估核心之摘要契約不變; 回傳物件不帶新鍵
//  S4 未給opt.uIni與opt.unit時settings與既有逐位相同
//  S5 opt.uIni給予而非正有限數(數字或數字字串)、opt.unit非物件或其內容無效時throw(不載入數據、不建立fdData), 訊息為`invalid opt.<名稱>: must be <種類>`且不含輸入值(V19、V20)
//  S6 檔名只依幣種、週期、指標組成與交易次數級距, settings(含uIni與unit)不參與(給unit時同一策略之檔名不變)
//  S7 estimFinder → estimComps → estimPicks → estimKeys 原樣傳遞opt
//  S8 自訂評估核心須依strategy.settings.unit計每單名義; 存檔前重跑時檔內之settings.unit與重跑摘要一致; 每個策略之settings.unit各一份副本
//  S9 給opt.unit時才動態載入w-trade-backtest之buildBaseUnitNotional: 該檔不存在(或無預設匯出之函數)時, 未給unit者照常, 給了者得明確之錯誤(不報成選項無效, 訊息不含原生錯誤之路徑)
//  L1 useShowLog: 給unit時日誌之「每次下單金額」改顯示基礎單位之名義(最大持倉名義), 不再印寫死之1; 未給unit時日誌逐位不變
//  M1 同tkid之覆寫前: 既有策略檔與本次之settings.unit不同(一方有一方無, 或交易規則/緩衝/單位數不同)時, 不以等效年化比較, 以本次口徑覆寫並於日誌記一行警告(不帶值); 口徑相同者(含數字字串與數字之同值、查得時刻與來源不同)照舊以等效年化比較


let fdTmp = path.resolve('./test/_tmp/estimKeysBaseUnit')

//ruleA, 交易規則之例(步長0.001、最小數量0.001、最小名義價值20; 另帶查得時刻與來源之記錄欄, 回測不讀)
let ruleA = { stepSize: 0.001, minQty: 0.001, minNotional: 20, asOf: '2026-01-01T00:00:00', source: 'exchangeInfo' }

//optQuick, 三門檻放寬且縮小求解量, 使可用參數組必寫出策略檔
let optQuick = {
    thsTp: [3],
    thsSl: [2],
    thNumTrade: 1,
    thRWin: 0,
    thREquivalentCumuProfitOrLossFinalNormYear: -1e9,
    Np: 8,
    NContiguous: 5,
    UseRepeat: false,
    UseImmigration: false,
}

//keys, d: 合成K線(收盤價逐根相異, 故各單之基礎單位名義相異)與單一指標序列
let keys = ['btc_4hr_ma_1day']
let d = null

//noTimeTest, 摘要去掉timeTest(回測執行時刻)
let noTimeTest = (sm) => {
    let { timeTest, ...rest } = sm
    return rest
}

//replay, 以策略檔之條件與指定settings於其求解時間窗重跑官方runStrategy
let replay = async (data, settings) => {
    let fgs = await dataProvide(d.fdOhlc, d.fdParam).buildGetTimeSeriesByTimeRange(data.solve.timeStart, data.solve.timeEnd)
    return runStrategy(ott, { ...data, settings }, fgs)
}

//runIn, 於指定策略資料夾求解並讀回策略檔
let runIn = async (fdData, extra = {}) => {
    let m = await estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, ...extra })
    let ss = fs.existsSync(fdData) ? readStrategies(fdData, { readContent: true }) : []
    return { m, ss, fdData }
}

//run, 以獨立策略資料夾求解並讀回策略檔
let run = async (tag, extra = {}) => {
    return runIn(path.resolve(fdTmp, 'run', tag), extra)
}

//smBase, 替身核心之摘要(交易次數固定故tkid固定, 同一策略資料夾內恆為同一檔); 以rEq指定最終等效年化盈虧
let smBase = { numTrade: 30, rWin: '60.00%', uEquityFinal: 1200, rEquivalentCumuProfitOrLossFinalNormYear: '20.00%', uTradeAllMax: 5000 }
let stub = (rEq, extra = {}) => {
    let summary = { ...smBase, rEquivalentCumuProfitOrLossFinalNormYear: rEq, ...extra }
    return async () => ({ summary })
}

//captureLog, 執行期間攔截console.log, 回傳各次呼叫之引數陣列
let captureLog = async (fn) => {
    let logs = []
    let orig = console.log
    console.log = (...args) => {
        logs.push(args)
    }
    try {
        await fn()
    }
    finally {
        console.log = orig
    }
    return logs
}

//briefsOf, 日誌中之摘要物件(含'方向'鍵者)
let briefsOf = (logs) => {
    let bs = []
    logs.forEach((args) => {
        args.forEach((a) => {
            if (a !== null && typeof a === 'object' && '方向' in a) {
                bs.push(a)
            }
        })
    })
    return bs
}

//makeFast, 加速評估核心(以w-trade-backtest之buildStrategyFastSession評估, settings原樣交給evaluate, 故依settings.unit計每單名義)
let makeFast = () => {
    let byFgs = new WeakMap()
    return async ({ ott, strategy, funGetSeries }) => {
        let m = byFgs.get(funGetSeries)
        if (!m) {
            m = new Map()
            byFgs.set(funGetSeries, m)
        }
        let ks = strategy.conds.map((c) => c.key)
        let sk = strategy.mode + '|' + [...ks].sort().join(',')
        let session = m.get(sk)
        if (!session) {
            let arrOhlc = await funGetSeries(strategy.keyOhlc)
            let serieses = {}
            for (let k of new Set(ks)) {
                serieses[k] = await funGetSeries(k)
            }
            session = buildStrategyFastSession(ott, { arrOhlc, mode: strategy.mode, serieses })
            m.set(sk, session)
        }
        let summary = session.evaluate({ conds: strategy.conds, tp: strategy.settings.rTakeProfit, sl: strategy.settings.rStopLoss, settings: strategy.settings })
        return { summary }
    }
}

//keysOfM, 求解結果之鍵(排序後以逗號相接)
let keysOfM = (m) => Object.keys(m).sort().join(',')

//msgOf, 取reject之錯誤訊息
let msgOf = async (p) => {
    try {
        await p
    }
    catch (err) {
        return err.message
    }
    return null
}

//deepFreeze, 深凍結(測試呼叫端物件不被就地改動; ESM為嚴格模式, 就地改動即拋錯)
let deepFreeze = (o) => {
    Object.values(o).forEach((v) => {
        if (v !== null && typeof v === 'object') {
            deepFreeze(v)
        }
    })
    return Object.freeze(o)
}

let WARN_MIX = '警告: 既有策略與本次之基礎單位口徑不同, 以本次口徑覆寫(不比較等效年化)'


describe('estimKeys之研究用本金與基礎單位', function() {

    this.timeout(120000)

    let keysMBase = null

    before(async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        d = buildFdData(fdTmp, 'base', keys, { n: 40 })
        //keysMBase, 最佳化函數(PSO, estimKeys之預設)本身回傳之鍵: estimKeys原樣回傳其結果, 不另加鍵
        keysMBase = keysOfM(await omlPSO([{ values: [1, 2, 3], n: 3 }], async (xs) => xs[0], { Np: 4, Nl: 2, UseRepeat: false, UseImmigration: false }))
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('策略檔之記錄與摘要(官方runStrategy)', function() {

        let unitIn = null
        let rr = null

        before(async function() {
            unitIn = { rule: { ...ruleA } } //未給buffer與units
            rr = await run('record', { uIni: 10000, unit: unitIn })
        })

        it('S1: settings依序為uIni、uTrade、rTakeProfit、rStopLoss、rFee、unit, uIni為opt.uIni, unit補齊buffer 0.1與units 1且原樣保留查得時刻與來源', function() {
            assert.ok(rr.ss.length > 0, '前提: 門檻放寬時須有策略檔寫出')
            rr.ss.forEach((s) => {
                assert.deepStrictEqual(Object.keys(s.data.settings), ['uIni', 'uTrade', 'rTakeProfit', 'rStopLoss', 'rFee', 'unit']) //S1 鍵序
                assert.deepStrictEqual(s.data.settings, {
                    uIni: 10000, //S1 uIni取opt.uIni
                    uTrade: 1, //WS-BU-02 給unit時uTrade仍記1(鍵與鍵序不變)
                    rTakeProfit: 0.03,
                    rStopLoss: 0.02,
                    rFee: 0.0005,
                    unit: { rule: ruleA, buffer: 0.1, units: 1 }, //S1 補齊buffer與units, 交易規則之記錄欄原樣保留
                })
            })
        })

        it('S1: 呼叫端之unit物件不被改動(複製後補齊), 深凍結之輸入亦可', async function() {
            assert.deepStrictEqual(unitIn, { rule: ruleA }) //S1 複製後補齊, 不寫回呼叫端
            let frozen = deepFreeze({ rule: { ...ruleA, stepSize: '0.001' }, buffer: null })
            let a = await runIn(path.resolve(fdTmp, 'run', 'frozen'), { unit: frozen, funRunStrategyCustom: stub('20.00%') })
            assert.strictEqual(a.ss.length, 1)
            assert.deepStrictEqual(a.ss[0].data.settings.unit, { rule: ruleA, buffer: 0.1, units: 1 }) //K4 轉換不寫回呼叫端(深凍結下就地改動即拋錯)
            assert.strictEqual(frozen.rule.stepSize, '0.001')
        })

        it('S1: buffer與units為null時補預設(不寫入null)', async function() {
            let a = await run('null-bu', { uIni: 10000, unit: { rule: ruleA, buffer: null, units: null } })
            assert.ok(a.ss.length > 0)
            a.ss.forEach((s) => {
                assert.deepStrictEqual(s.data.settings.unit, { rule: ruleA, buffer: 0.1, units: 1 }) //S1 null補預設
            })
        })

        it('K4: unit與uIni之數字字串轉為數值落地(rule三欄、buffer、units為Number, units為整數), 其他欄位原樣; 以檔內settings與以原字串重放之摘要皆與檔內summary相同', async function() {
            let ruleS = { ...ruleA, stepSize: '0.001', minQty: ' 0.001 ', minNotional: '+20' }
            let unitS = { rule: ruleS, buffer: '0.1', units: '1' }
            let b = await run('str-bu', { uIni: '10000', unit: unitS })
            assert.ok(b.ss.length > 0)
            for (let s of b.ss) {
                let st = s.data.settings
                assert.strictEqual(st.uIni, 10000) //K4 uIni之數字字串轉為數值
                assert.deepStrictEqual(st.unit, { rule: ruleA, buffer: 0.1, units: 1 }) //K4 與數字版逐位相同(含其他欄位原樣)
                for (let k of ['stepSize', 'minQty', 'minNotional']) {
                    assert.strictEqual(typeof st.unit.rule[k], 'number', k)
                }
                assert.strictEqual(typeof st.unit.buffer, 'number')
                assert.strictEqual(typeof st.unit.units, 'number')
                let r = await replay(s.data, st)
                assert.deepStrictEqual(noTimeTest(r.summary), noTimeTest(s.data.summary))
                let rn = await replay(s.data, { ...st, unit: unitS }) //以原字串交給回測套件(其自行轉型)
                assert.deepStrictEqual(noTimeTest(rn.summary), noTimeTest(s.data.summary)) //K4 轉型不偏離回測套件之解析
            }
            assert.deepStrictEqual(unitS, { rule: ruleS, buffer: '0.1', units: '1' }) //K4 不改呼叫端
        })

        it('K4: 各種數字字串寫法轉換前後之buildBaseUnitNotional(...).key相同(不偏離回測套件之解析), 且落地值為數值', async function() {
            let cases = [
                { unit: { rule: { stepSize: '0.001', minQty: '0.001', minNotional: '20' } }, key: '0.001|0.001|20|0.1|1' },
                { unit: { rule: { stepSize: ' 0.001 ', minQty: '1e-3', minNotional: '+20.0' }, buffer: ' .1 ', units: ' 2 ' }, key: '0.001|0.001|20|0.1|2' },
                { unit: { rule: { stepSize: '.001', minQty: '0.0010', minNotional: '2e1' }, buffer: '0', units: '+3' }, key: '0.001|0.001|20|0|3' },
                { unit: { rule: { stepSize: 0.001, minQty: '1E-3', minNotional: 20 }, buffer: 0.25, units: '1' }, key: '0.001|0.001|20|0.25|1' },
                { unit: { rule: { stepSize: '5e-1', minQty: '00.5', minNotional: ' 100 ' }, buffer: '1e-2', units: '10' }, key: '0.5|0.5|100|0.01|10' },
            ]
            for (let [i, c] of cases.entries()) {
                let a = await runIn(path.resolve(fdTmp, 'run', `k4-key-${i}`), { unit: c.unit, funRunStrategyCustom: stub('20.00%') })
                assert.strictEqual(a.ss.length, 1)
                let st = a.ss[0].data.settings.unit
                let keyBefore = buildBaseUnitNotional(c.unit, 'opt.unit').key
                let keyAfter = buildBaseUnitNotional(st, 'opt.unit').key
                assert.strictEqual(keyBefore, c.key) //前提: 回測套件之解析
                assert.strictEqual(keyAfter, keyBefore, `case ${i}`) //K4 轉換前後之key相同
                for (let v of [st.rule.stepSize, st.rule.minQty, st.rule.minNotional, st.buffer, st.units]) {
                    assert.strictEqual(typeof v, 'number', `case ${i}`) //K4 落地為數值
                }
                assert.ok(Number.isInteger(st.units))
            }
        })

        it('K4: 檢測之值即使用之值(輸入物件之欄位為每次讀取皆不同之取值器時, 落地值為通過檢測之那一次)', async function() {
            let calls = 0
            let rule = { minQty: 0.001, minNotional: 20 }
            Object.defineProperty(rule, 'stepSize', {
                enumerable: true,
                get() {
                    calls++
                    return calls === 1 ? '0.001' : '-1' //第一次讀為有效值, 其後皆為無效值
                },
            })
            let a = await runIn(path.resolve(fdTmp, 'run', 'k4-getter'), { unit: { rule }, funRunStrategyCustom: stub('20.00%') })
            assert.strictEqual(a.ss.length, 1)
            assert.strictEqual(a.ss[0].data.settings.unit.rule.stepSize, 0.001) //K4 使用者之值即檢測之值
        })

        it('S2: 以檔內settings重放與檔內summary相同; 去掉unit重放之交易筆數、已平倉筆數、勝率相同而最大持倉不同', async function() {
            let nDiffNotional = 0
            for (let s of rr.ss) {
                let c = s.data
                let r1 = await replay(c, c.settings)
                assert.deepStrictEqual(noTimeTest(r1.summary), noTimeTest(c.summary)) //S2 摘要係依settings.unit所算
                let uTrades = new Set(r1.orders.map((o) => o.uTrade))
                if (uTrades.size >= 2) {
                    nDiffNotional++
                }
                let { unit, ...settingsNoUnit } = c.settings
                let r0 = await replay(c, settingsNoUnit)
                assert.strictEqual(r0.summary.numTrade, c.summary.numTrade) //S2 進場與交易次數不變
                assert.strictEqual(r0.summary.numTradeFin, c.summary.numTradeFin)
                assert.strictEqual(r0.summary.rWin, c.summary.rWin)
                assert.notStrictEqual(r0.summary.uTradeAllMax, c.summary.uTradeAllMax) //S2 鑑別: 每單名義非uTrade
            }
            assert.ok(nDiffNotional >= 1, `鑑別前提: 至少一隻策略之各單名義相異, 實得 ${nDiffNotional}`)
        })

        it('S6: 檔名與去掉unit、uIni 1000之重放所組檔名相同', async function() {
            for (let s of rr.ss) {
                let c = s.data
                let r0 = await replay(c, { uIni: 1000, uTrade: 1, rTakeProfit: c.settings.rTakeProfit, rStopLoss: c.settings.rStopLoss, rFee: c.settings.rFee })
                assert.strictEqual(genStrategyFileName(name, interval, 'long', keys, {}, r0.summary), s.name) //S6 給unit時同一策略之檔名不變
            }
        })

        it('S3: fitness與calcFitness(settings,summary)同源, 回傳物件不帶新鍵', function() {
            rr.ss.forEach((s) => {
                assert.strictEqual(s.data.fitness, calcFitness(s.data.settings, s.data.summary))
            })
            assert.strictEqual(keysOfM(rr.m), keysMBase) //S3 回傳物件不帶新鍵
        })

    })

    describe('單一策略不設持倉門檻', function() {

        let unit = { rule: ruleA, buffer: 0.1, units: 1 }

        it('S3 官方runStrategy: uIni 1(小於任一單之名義)時照常入庫; 同一策略以uIni 10000重放之等效年化、勝率、交易筆數與適應值相同(與本金大小無關)', async function() {
            let { m, ss } = await run('tiny-uIni', { uIni: 1, unit })
            assert.ok(ss.length > 0) //S3 不剔除
            assert.ok(ss.every((s) => s.data.summary.uTradeAllMax > 1), '前提: 最大持倉名義皆大於uIni')
            assert.ok(m.stopExecutions > 0)
            for (let s of ss) {
                let c = s.data
                assert.strictEqual(c.settings.uIni, 1) //前提: uIni 1與unit確實落地
                assert.deepStrictEqual(c.settings.unit, unit)
                let r = await replay(c, { ...c.settings, uIni: 10000 })
                for (let k of ['numTrade', 'numTradeFin', 'rWin', 'uTradeAllMax', 'rEquivalentCumuProfitOrLossFinalNormYear']) {
                    assert.strictEqual(r.summary[k], c.summary[k], k) //S3 與本金大小無關之量不變
                }
                assert.strictEqual(calcFitness({ ...c.settings, uIni: 10000 }, r.summary), c.fitness) //S3 適應值與本金大小無關
            }
        })

        it('S3 替身核心: 最大持倉名義超過uIni之候選照常入庫; 摘要缺uTradeAllMax亦可(契約不變)', async function() {
            let smBig = { numTrade: 30, rWin: '60.00%', uEquityFinal: 505, rEquivalentCumuProfitOrLossFinalNormYear: '20.00%', uTradeAllMax: 5000 }
            let a = await run('stub-big', { uIni: 500, unit, funRunStrategyCustom: async () => ({ summary: smBig }) })
            assert.strictEqual(a.ss.length, 1)
            assert.deepStrictEqual(a.ss[0].data.summary, smBig) //S3 不剔除
            assert.strictEqual(a.ss[0].data.fitness, calcFitness({ uIni: 500 }, smBig)) //S3 適應值不受最大持倉影響
            let { uTradeAllMax, ...smNo } = smBig
            let b = await run('stub-no-utm', { uIni: 500, unit, funRunStrategyCustom: async () => ({ summary: smNo }) })
            assert.strictEqual(b.ss.length, 1) //S3 契約不變(四欄)
            assert.strictEqual(keysOfM(b.m), keysMBase)
        })

        it('S3 calcFitness: 不受settings.unit與summary.uTradeAllMax影響', function() {
            let sm = { numTrade: 30, uEquityFinal: 1200, rWin: '60%', rEquivalentCumuProfitOrLossFinalNormYear: '25%' }
            let base = calcFitness({ uIni: 1000 }, sm)
            assert.strictEqual(base, 1.3)
            assert.strictEqual(calcFitness({ uIni: 1000, unit }, { ...sm, uTradeAllMax: 5000 }), base) //S3
        })

        it('S4: 未給unit時uIni照記(0.5亦照常入庫), settings無unit鍵', async function() {
            let { ss } = await run('no-unit', { uIni: 0.5 })
            assert.ok(ss.length > 0)
            ss.forEach((s) => {
                assert.deepStrictEqual(Object.keys(s.data.settings), ['uIni', 'uTrade', 'rTakeProfit', 'rStopLoss', 'rFee'])
                assert.strictEqual(s.data.settings.uIni, 0.5) //S1 uIni取opt.uIni
            })
        })

    })

    describe('自訂評估核心與存檔前重跑', function() {

        let unit = { rule: ruleA, buffer: 0.1, units: 1 }
        let fieldsEq = ['numTrade', 'numTradeFin', 'rWin', 'uTradeAllMax', 'uEquityFinal', 'rEquivalentCumuProfitOrLossFinalNormYear']

        it('S8: 加速核心(依settings.unit)+ 存檔前官方重跑: 檔內settings.unit與重跑摘要一致, 加速核心之摘要與官方之對應欄相同', async function() {
            let fast = makeFast()
            let seen = []
            let { ss } = await run('fast-save', {
                uIni: 10000,
                unit,
                useRunStrategyBeforeSave: true,
                funRunStrategyCustom: async (args) => {
                    let r = await fast(args)
                    if (seen.length < 12 && r.summary.numTrade > 0) {
                        seen.push({ strategy: JSON.parse(JSON.stringify(args.strategy)), summary: r.summary, fgs: args.funGetSeries })
                    }
                    return r
                },
            })
            assert.ok(ss.length > 0)
            for (let s of ss) {
                let c = s.data
                assert.deepStrictEqual(c.settings.unit, unit) //S8 落地之unit
                let r = await replay(c, c.settings)
                assert.deepStrictEqual(noTimeTest(r.summary), noTimeTest(c.summary)) //S8 摘要為官方重跑(依settings.unit)
            }
            assert.ok(seen.length > 0, '前提: 加速核心評估過有交易之候選')
            assert.ok(seen.some((x) => !Number.isInteger(x.summary.uTradeAllMax)), '鑑別前提: 加速核心之最大持倉為名義(非單數)')
            for (let x of seen) {
                let r = await runStrategy(ott, x.strategy, x.fgs)
                for (let k of fieldsEq) {
                    assert.strictEqual(x.summary[k], r.summary[k], k) //S8 加速核心依settings.unit, 與官方相同
                }
            }
        })

        it('S8: 每個策略之settings.unit各一份副本, 評估核心就地改動不影響其後之候選', async function() {
            let got = []
            await run('mutate-unit', {
                uIni: 10000,
                unit,
                funRunStrategyCustom: async ({ strategy }) => {
                    got.push([strategy.settings.unit.rule.minNotional, strategy.settings.unit.buffer, Object.getPrototypeOf(strategy.settings.unit) === Object.prototype])
                    strategy.settings.unit.rule.minNotional = 999 //模擬核心就地改動
                    strategy.settings.unit.buffer = 5
                    return { summary: { numTrade: 0, rWin: '', uEquityFinal: 10000, rEquivalentCumuProfitOrLossFinalNormYear: '' } }
                },
            })
            assert.ok(got.length > 1)
            assert.ok(got.every(([mn, bf, plain]) => mn === 20 && bf === 0.1 && plain === true)) //S8 各候選皆見原值; 副本為一般物件(回測套件要求)
        })

        //runNoBu, 子行程以模組解析鉤子模擬回測套件之狀態(module.register需Node >= 20.6或18.19, 不支援時略過並印出原因)
        let runNoBu = function(ctx, mode) {
            if (typeof nodeModule.register !== 'function') {
                console.log(`      (略過: 本Node ${process.version} 無module.register, S9須Node >= 20.6或18.19)`)
                ctx.skip()
            }
            let fdPack = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
            let fdChild = path.resolve(fdTmp, `nobu-child-${mode}`)
            let r = spawnSync(process.execPath, [path.join(fdPack, 'test', 'tools', 'noBaseUnitRun.mjs'), fdChild, mode], { cwd: fdPack, encoding: 'utf8', windowsHide: true, timeout: 110000 })
            assert.strictEqual(r.status, 0, r.stderr)
            return JSON.parse(r.stdout.trim().split('\n').pop())
        }

        it('S9: 回測套件不含buildBaseUnitNotional與calcBaseUnitQuantity時(子行程以模組解析鉤子模擬), 未給unit者照常、聚合入口可載入, 給了者得明確之錯誤(不含原生錯誤之路徑)且不建立fdData', function() {
            let out = runNoBu(this, 'missing')
            assert.strictEqual(out.hook, 'blocked', '前提: 鉤子生效')
            assert.strictEqual(out.aggregate, 'function') //S9 聚合入口可載入
            assert.ok(out.noUnit.stopExecutions > 0 && out.noUnit.nFiles > 0) //S9 未給unit者照常
            assert.strictEqual(out.withUnit, 'opt.unit requires w-trade-backtest >= 1.1.40 (src/buildBaseUnitNotional.mjs): ERR_MODULE_NOT_FOUND') //S9 明確之錯誤, 只帶錯誤碼(V20: 不帶原生錯誤之訊息與路徑)
            assert.strictEqual(out.withUnitFdData, false)
            assert.strictEqual(out.badUnit, 'invalid opt.unit: must be an object') //S9 非物件之unit為選項無效, 不因缺檔而報成缺檔(先於動態載入)
        })

        it('S9: buildBaseUnitNotional無預設匯出之函數時, 給unit者得與缺檔同類之明確錯誤(不報成選項無效)且不建立fdData', function() {
            let out = runNoBu(this, 'nodefault')
            assert.strictEqual(out.hook, 'nodefault', '前提: 鉤子生效')
            assert.strictEqual(out.withUnit, 'opt.unit requires w-trade-backtest >= 1.1.40 (src/buildBaseUnitNotional.mjs has no default export function)') //S9
            assert.strictEqual(out.withUnitFdData, false)
        })

        it('U1: 落地之settings.unit取自buildBaseUnitNotional之回傳(替身回傳與輸入之轉型結果不同之值), 交易規則之記錄欄與unit之其他欄原樣保留、鍵序不變', function() {
            //WS-BU-02: 本套件不自行轉換(不再以cdbl、cint重做), 落地者即回測套件轉型後之unit
            let out = runNoBu(this, 'stub')
            assert.strictEqual(out.hook, 'stub', '前提: 鉤子生效, 替身之回傳(stepSize 0.01)與輸入之轉型結果(0.001)不同')
            assert.ok(out.nFiles > 0)
            out.settingsUnits.forEach((u) => {
                assert.deepStrictEqual(u, { rule: { stepSize: 0.01, minQty: 0.02, minNotional: 30, asOf: '2026-01-01T00:00:00', source: 'exchangeInfo' }, buffer: 0.25, units: 3, note: 'keep' })
                assert.deepStrictEqual(Object.keys(u), ['rule', 'buffer', 'units', 'note'])
                assert.deepStrictEqual(Object.keys(u.rule), ['stepSize', 'minQty', 'minNotional', 'asOf', 'source'])
            })
        })

    })

    describe('未給與無效之選項', function() {

        it('S4: unit為null且uIni為undefined時視同未給, settings與既有逐位相同', async function() {
            let { m, ss } = await run('nullish', { unit: null, uIni: undefined })
            assert.ok(ss.length > 0)
            ss.forEach((s) => {
                assert.deepStrictEqual(s.data.settings, { uIni: 1000, uTrade: 1, rTakeProfit: 0.03, rStopLoss: 0.02, rFee: 0.0005 }) //S4
                assert.deepStrictEqual(Object.keys(s.data.settings), ['uIni', 'uTrade', 'rTakeProfit', 'rStopLoss', 'rFee'])
            })
            assert.strictEqual(keysOfM(m), keysMBase)
        })

        it('S4: uIni為null時視同未給(1000)', async function() {
            let { ss } = await run('uini-null', { uIni: null, funRunStrategyCustom: stub('20.00%') })
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].data.settings.uIni, 1000)
        })

        it('S5: uIni非有效正數(0、負數、NaN、Infinity、非數字字串、十六進位、空字串、布林、陣列、物件、包裝物件、BigInt)時reject, 訊息為固定文字不含輸入值, 不建立fdData', async function() {
            let bads = [0, -1, NaN, Infinity, -Infinity, '0', '-5', '1e400', 'Infinity', '0x10', 'secret-abc', '', ' ', true, false, [], [5], {}, Object(5), 10n]
            for (let [i, v] of bads.entries()) {
                let fdData = path.resolve(fdTmp, 'bad-uIni', String(i))
                let msg = await msgOf(estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, uIni: v }))
                assert.strictEqual(msg, 'invalid opt.uIni: must be a positive number', `uIni #${i}`) //S5 V19格式, V20不帶值
                assert.strictEqual(fs.existsSync(fdData), false) //S5 不建立fdData
            }
        })

        it('K4: uIni收數字字串(含前後空白、科學記號)並轉為數值, 落地為Number', async function() {
            for (let [v, expected] of [['10000', 10000], [' 5 ', 5], ['1e4', 10000], ['+2.5', 2.5], [7, 7]]) {
                let a = await runIn(path.resolve(fdTmp, 'run', `uini-${String(v).trim()}`), { uIni: v, funRunStrategyCustom: stub('20.00%') })
                assert.strictEqual(a.ss.length, 1)
                assert.strictEqual(a.ss[0].data.settings.uIni, expected, String(v)) //K4 檢測之值即使用之值
                assert.strictEqual(typeof a.ss[0].data.settings.uIni, 'number')
            }
        })

        it('S5: unit非物件或內容無效(非一般物件、缺欄、無效之數字或字串、緩衝為負、單位數非正整數)時reject, 訊息以invalid opt.unit起頭且不含輸入值, 不建立fdData', async function() {
            class UnitBox {
                constructor() {
                    this.rule = ruleA
                }
            }
            let bads = [
                'x',
                [],
                {},
                new UnitBox(), //類別實例非一般物件
                { rule: { stepSize: 0.001, minQty: 0.001 } },
                { rule: { stepSize: 0.001, minQty: 0.001, minNotional: -20 } },
                { rule: { ...ruleA, stepSize: '0x10' } },
                { rule: { ...ruleA, stepSize: 'secret-abc' } },
                { rule: { ...ruleA, minNotional: Infinity } },
                { rule: ruleA, buffer: -0.1 },
                { rule: ruleA, buffer: true },
                { rule: ruleA, buffer: '' },
                { rule: ruleA, buffer: 'secret-abc' },
                { rule: ruleA, units: 1.5 },
                { rule: ruleA, units: '1.5' },
                { rule: ruleA, units: 0 },
            ]
            for (let [i, v] of bads.entries()) {
                let fdData = path.resolve(fdTmp, 'bad-unit', String(i))
                let msg = await msgOf(estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, unit: v }))
                assert.ok(typeof msg === 'string' && msg.startsWith('invalid opt.unit'), `unit #${i} 訊息[${msg}]`) //S5 只比對本套件之前綴
                assert.ok(!msg.includes('secret-abc'), `unit #${i}`) //S5 V20不回顯輸入值
                assert.strictEqual(fs.existsSync(fdData), false) //S5 不建立fdData
            }
            //非物件者為本套件自身之訊息, 與回測套件之同類訊息一致
            for (let v of ['x', [], 5, true]) {
                let msg = await msgOf(estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, path.resolve(fdTmp, 'bad-unit', 'obj'), { ...optQuick, unit: v }))
                assert.strictEqual(msg, 'invalid opt.unit: must be an object')
            }
        })

    })

    describe('genStrategyFileName', function() {

        it('S6: 檔名不受settings之uIni與unit影響', function() {
            let sm = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '25%' }
            let a = genStrategyFileName(name, interval, 'long', keys, { uIni: 1000, uTrade: 1 }, sm)
            let b = genStrategyFileName(name, interval, 'long', keys, { uIni: 10000, uTrade: 1, unit: { rule: ruleA, buffer: 0.1, units: 1 } }, sm)
            assert.strictEqual(a, b)
        })

    })

    describe('經estimFinder傳遞', function() {

        let keysF = ['btc_4hr_ma_1day', 'btc_4hr_rsi_1day']
        let dF = null

        before(function() {
            dF = buildFdData(fdTmp, 'finder', keysF, { n: 40 })
        })

        it('S7: estimFinder之opt.uIni與opt.unit傳至estimKeys(數字字串轉為數值)', async function() {
            let unit = { rule: ruleA, buffer: 0.25, units: 2 }
            let fdData = path.resolve(fdTmp, 'finder', 's-ok')
            await estimFinder(ott, name, symbol, interval, dF.fdOhlc, dF.fdParam, fdData, { ...optQuick, mode: 'long', comps: '1,0,0', timeStart: dF.timeStart, timeEnd: dF.timeEnd, uIni: 10000, unit })
            let ss = readStrategies(fdData, { readContent: true })
            assert.ok(ss.length > 0)
            ss.forEach((s) => {
                assert.strictEqual(s.data.settings.uIni, 10000) //S7
                assert.deepStrictEqual(s.data.settings.unit, unit)
            })
            let fdData2 = path.resolve(fdTmp, 'finder', 's-str')
            let unitS = { rule: { ...ruleA, stepSize: '0.001' }, buffer: '0.25', units: '2' }
            await estimFinder(ott, name, symbol, interval, dF.fdOhlc, dF.fdParam, fdData2, { ...optQuick, mode: 'long', comps: '1,0,0', timeStart: dF.timeStart, timeEnd: dF.timeEnd, uIni: '10000', unit: unitS })
            let ss2 = readStrategies(fdData2, { readContent: true })
            assert.ok(ss2.length > 0)
            ss2.forEach((s) => {
                assert.strictEqual(s.data.settings.uIni, 10000) //S7 + K4 經estimFinder傳遞之數字字串亦轉為數值
                assert.deepStrictEqual(s.data.settings.unit, unit)
            })
        })

    })

    describe('日誌(useShowLog)', function() {

        let unit = { rule: ruleA, buffer: 0.1, units: 1 }
        let kUnit = '最大持倉名義(基礎單位)'
        let keysBrief = ['方向', '每次下單金額', '止盈', '止損', '最大持倉比例', '交易次數', '最大回撤率', '勝率', '夏普值', '最終盈虧', '最終等效盈虧', '最終等效年化盈虧', 'fitness']

        it('L1: 給unit時日誌改顯示基礎單位之最大持倉名義(摘要之uTradeAllMax), 不再印每次下單金額之1', async function() {
            let logs = await captureLog(async () => {
                await run('log-unit', { unit, useShowLog: true, funRunStrategyCustom: stub('20.00%', { uTradeAllMax: 5000 }) })
            })
            let bs = briefsOf(logs)
            assert.ok(bs.length > 0, '前提: 日誌有摘要物件')
            bs.forEach((b) => {
                assert.strictEqual(b[kUnit], 5000) //L1 顯示基礎單位之名義(依摘要可得之值)
                assert.ok(!('每次下單金額' in b)) //L1 不再印寫死之1
            })
        })

        it('L1: 給unit而摘要缺uTradeAllMax時顯示空字串(不印undefined)', async function() {
            let { uTradeAllMax, ...smNo } = smBase
            let logs = await captureLog(async () => {
                await run('log-unit-no-utm', { unit, useShowLog: true, funRunStrategyCustom: async () => ({ summary: smNo }) })
            })
            let bs = briefsOf(logs)
            assert.ok(bs.length > 0)
            bs.forEach((b) => {
                assert.strictEqual(b[kUnit], '')
            })
        })

        it('L1: 未給unit時日誌逐位不變(鍵與鍵序同既有, 每次下單金額為1)', async function() {
            let logs = await captureLog(async () => {
                await run('log-no-unit', { useShowLog: true, funRunStrategyCustom: stub('20.00%') })
            })
            let bs = briefsOf(logs)
            assert.ok(bs.length > 0)
            bs.forEach((b) => {
                assert.deepStrictEqual(Object.keys(b), keysBrief)
                assert.strictEqual(b['每次下單金額'], 1)
            })
        })

    })

    describe('新舊口徑混存(同tkid之覆寫)', function() {

        let unitA = { rule: ruleA, buffer: 0.1, units: 1 }

        //seed, 於指定策略資料夾以替身核心(固定摘要, 同一檔)先寫出一檔
        let seed = async (tag, rEq, extra = {}) => {
            let fdData = path.resolve(fdTmp, 'mix', tag)
            let a = await runIn(fdData, { ...extra, funRunStrategyCustom: stub(rEq) })
            assert.strictEqual(a.ss.length, 1, '前提: 寫出一檔')
            return fdData
        }

        //readOne, 讀回該資料夾之唯一策略檔
        let readOne = (fdData) => {
            let ss = readStrategies(fdData, { readContent: true })
            assert.strictEqual(ss.length, 1, '同tkid恆僅一檔')
            return ss[0]
        }

        //runLog, 於既有資料夾再求解一次(開日誌), 回傳警告行
        let runLog = async (fdData, rEq, extra = {}) => {
            let logs = await captureLog(async () => {
                await runIn(fdData, { ...extra, useShowLog: true, funRunStrategyCustom: stub(rEq) })
            })
            return logs.filter((args) => typeof args[0] === 'string' && args[0].startsWith('警告'))
        }

        it('M1: 既有無unit、本次有unit: 即使等效年化較低亦以本次口徑覆寫, 日誌記一行警告(不帶值)', async function() {
            let fdData = await seed('old-none', '50.00%')
            let before = readOne(fdData)
            assert.strictEqual(before.data.settings.unit, undefined)
            let warns = await runLog(fdData, '20.00%', { unit: unitA })
            let after = readOne(fdData)
            assert.strictEqual(after.name, before.name) //同一tkid
            assert.deepStrictEqual(after.data.settings.unit, unitA) //M1 以本次口徑覆寫
            assert.strictEqual(after.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '20.00%') //M1 較低者亦覆寫(不比較等效年化)
            assert.strictEqual(warns.length, 1) //M1 一行警告
            assert.strictEqual(warns[0][0], WARN_MIX)
            assert.deepStrictEqual(warns[0].slice(1), [before.name]) //M1 僅帶檔名, 不帶unit之值
        })

        it('M1: 既有有unit、本次無unit: 以本次口徑(無unit)覆寫並警告', async function() {
            let fdData = await seed('old-unit', '50.00%', { unit: unitA })
            assert.deepStrictEqual(readOne(fdData).data.settings.unit, unitA)
            let warns = await runLog(fdData, '10.00%')
            let after = readOne(fdData)
            assert.strictEqual(after.data.settings.unit, undefined) //M1 無unit之口徑覆寫
            assert.strictEqual(after.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '10.00%')
            assert.strictEqual(warns.length, 1)
            assert.strictEqual(warns[0][0], WARN_MIX)
        })

        it('M1: 既有與本次之交易規則(三欄之任一)、緩衝或單位數不同: 皆以本次口徑覆寫並警告', async function() {
            let variants = [
                { rule: { ...ruleA, stepSize: 0.01 }, buffer: 0.1, units: 1 },
                { rule: { ...ruleA, minQty: 0.01 }, buffer: 0.1, units: 1 },
                { rule: { ...ruleA, minNotional: 50 }, buffer: 0.1, units: 1 },
                { rule: ruleA, buffer: 0.2, units: 1 },
                { rule: ruleA, buffer: 0.1, units: 2 },
            ]
            for (let [i, v] of variants.entries()) {
                let fdData = await seed(`diff-${i}`, '50.00%', { unit: unitA })
                let warns = await runLog(fdData, '5.00%', { unit: v })
                let after = readOne(fdData)
                assert.deepStrictEqual(after.data.settings.unit, v, `variant ${i}`) //M1 以本次口徑覆寫
                assert.strictEqual(after.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '5.00%', `variant ${i}`)
                assert.strictEqual(warns.length, 1, `variant ${i}`)
            }
        })

        it('M1: 既有之unit無法解析(內容無效)時視為口徑不同, 以本次口徑覆寫並警告', async function() {
            let fdData = await seed('old-bad', '50.00%', { unit: unitA })
            let one = readOne(fdData)
            let fp = path.resolve(fdData, one.name)
            let data = JSON.parse(fs.readFileSync(fp, 'utf8'))
            data.settings.unit = { rule: { stepSize: -1 } } //手工改成無效之unit
            fs.writeFileSync(fp, JSON.stringify(data), 'utf8')
            let warns = await runLog(fdData, '5.00%', { unit: unitA })
            let after = readOne(fdData)
            assert.deepStrictEqual(after.data.settings.unit, unitA)
            assert.strictEqual(after.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '5.00%')
            assert.strictEqual(warns.length, 1)
        })

        it('M1: 口徑相同(含數字字串與數字之同值、緩衝與單位數取預設、查得時刻與來源不同)者照舊以等效年化比較: 較低不覆寫、較高覆寫, 皆無警告', async function() {
            let fdData = await seed('same', '20.00%', { unit: unitA })
            let unitSame = { rule: { stepSize: '0.001', minQty: ' 0.001 ', minNotional: '2e1', asOf: '2027-02-02T00:00:00', source: 'other' } } //未給buffer與units(預設0.1、1)
            let warnsLow = await runLog(fdData, '10.00%', { unit: unitSame })
            let afterLow = readOne(fdData)
            assert.strictEqual(afterLow.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '20.00%') //M1 較低不覆寫(照舊比較)
            assert.deepStrictEqual(afterLow.data.settings.unit, unitA)
            assert.strictEqual(warnsLow.length, 0)
            let warnsHigh = await runLog(fdData, '30.00%', { unit: unitSame })
            let afterHigh = readOne(fdData)
            assert.strictEqual(afterHigh.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '30.00%') //M1 較高覆寫
            assert.deepStrictEqual(afterHigh.data.settings.unit.rule, { ...ruleA, asOf: '2027-02-02T00:00:00', source: 'other' })
            assert.strictEqual(warnsHigh.length, 0)
        })

        it('M1: uIni不屬口徑(uIni不同而口徑相同者照舊比較); 既有之unit為數字字串寫法者與數字之同值視為同口徑', async function() {
            let fdData = await seed('uini-not-caliber', '20.00%', { unit: unitA, uIni: 1000 })
            let warns = await runLog(fdData, '10.00%', { unit: unitA, uIni: 50000 })
            let one = readOne(fdData)
            assert.strictEqual(one.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '20.00%') //M1 uIni不同亦照舊比較, 較低不覆寫
            assert.strictEqual(one.data.settings.uIni, 1000)
            assert.strictEqual(warns.length, 0)
            //既有之unit手工改為數字字串寫法(例如較早版本所寫之策略檔)
            let fp = path.resolve(fdData, one.name)
            let data = JSON.parse(fs.readFileSync(fp, 'utf8'))
            data.settings.unit = { rule: { ...ruleA, stepSize: '0.001', minQty: '0.001', minNotional: '20' }, buffer: '0.1', units: '1' }
            fs.writeFileSync(fp, JSON.stringify(data), 'utf8')
            let warns2 = await runLog(fdData, '10.00%', { unit: unitA })
            assert.strictEqual(readOne(fdData).data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '20.00%') //M1 同值之字串寫法視為同口徑, 較低不覆寫
            assert.strictEqual(warns2.length, 0)
        })

        it('M1: 既有與本次皆無unit者照舊以等效年化比較(無警告)', async function() {
            let fdData = await seed('both-none', '50.00%')
            let warnsLow = await runLog(fdData, '10.00%')
            assert.strictEqual(readOne(fdData).data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '50.00%') //較低不覆寫
            let warnsHigh = await runLog(fdData, '60.00%')
            assert.strictEqual(readOne(fdData).data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '60.00%') //較高覆寫
            assert.strictEqual(warnsLow.length + warnsHigh.length, 0)
        })

        it('M1: 口徑不同而日誌未開時仍覆寫, 不輸出警告', async function() {
            let fdData = await seed('quiet', '50.00%')
            let logs = await captureLog(async () => {
                await runIn(fdData, { unit: unitA, funRunStrategyCustom: stub('20.00%') })
            })
            assert.deepStrictEqual(readOne(fdData).data.settings.unit, unitA)
            assert.strictEqual(logs.filter((args) => typeof args[0] === 'string' && args[0].startsWith('警告')).length, 0)
        })

        it('M1: 存檔前重跑使檔名改變時, 對新檔名亦依口徑判定(口徑不同即覆寫)', async function() {
            //替身核心以numTrade 30(級距A)評估, 存檔前重跑之核心回numTrade 1(級距不同) => 檔名改變, 對新檔名重檢
            let fdData = path.resolve(fdTmp, 'mix', 'rerun-name')
            let smRe = { ...smBase, numTrade: 1, rEquivalentCumuProfitOrLossFinalNormYear: '20.00%' }
            await runIn(fdData, { funRunStrategyCustom: stub('50.00%', { numTrade: 1 }) }) //舊檔(無unit): numTrade 1之檔名, 50%
            let ss0 = readStrategies(fdData, { readContent: true })
            assert.strictEqual(ss0.length, 1)
            let logs = await captureLog(async () => {
                await runIn(fdData, { unit: unitA, useShowLog: true, useRunStrategyBeforeSave: true, funRunStrategyCustom: stub('50.00%', { numTrade: 30 }), funRunStrategyCustomBeforeSave: async () => ({ summary: smRe }) })
            })
            let ss = readStrategies(fdData, { readContent: true })
            let mine = ss.find((s) => s.name === ss0[0].name)
            assert.ok(mine, '前提: 重跑後之檔名為numTrade 1之級距')
            assert.deepStrictEqual(mine.data.settings.unit, unitA) //M1 重算檔名後對新檔名亦依口徑覆寫(舊檔無unit, 較低之等效年化亦覆寫)
            assert.strictEqual(mine.data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '20.00%')
            assert.ok(logs.some((args) => args[0] === WARN_MIX))
        })

    })

})
