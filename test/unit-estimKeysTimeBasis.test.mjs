import assert from 'assert'
import fs from 'fs'
import path from 'path'
import runStrategy from 'w-trade-backtest/src/runStrategy.mjs'
import buildStrategyFastSession from 'w-trade-backtest/src/buildStrategyFastSession.mjs'
import parseBarTime from 'w-trade-backtest/src/barTime.mjs'
import dataProvide from 'w-data-tdprovide'
import estimKeys from '../src/estimKeys.mjs'
import readStrategies from '../src/readStrategies.mjs'
import ott from '../src/ott.mjs'
import { buildFdData, name, symbol, interval } from './unit-setup.mjs'


//規格來源: sgud/rule/rulebook.md 之 WS-TB-01 ~ WS-TB-05 與 src/estimKeys.mjs 之 JSDoc(每根K線之秒數opt.intervalSec、時間口徑opt.timeBasis)
//  WS-TB-01 相依之w-trade-backtest須>=1.1.43(package.json之下限), 以其src/barTime.mjs之預設匯出parseBarTime檢測opt.intervalSec與opt.timeBasis(判準與訊息由回測套件定; 訊息以`invalid opt.intervalSec`或`invalid opt.timeBasis`起頭、不含輸入值), 於建立fdData、載入數據之前;
//           寫入settings之值為其回傳之轉換後之值(本套件不重述其判準, 測試以契約核對: 實際回傳之{ intervalSec, timeBasis }之值與型別); null或undefined為未給
//  WS-TB-02 只把有給之鍵(轉換後之值)附加於策略之settings, 接於既有鍵(含unit)之後, 鍵序intervalSec、timeBasis; 未給時settings之鍵與鍵序同既有
//  WS-TB-03 只給intervalSec(或timeBasis為'open')時策略之績效數字與未給相同; timeBasis為'span'時依回測套件之'span'口徑計算(官方重放相符)
//  WS-TB-04 同tkid覆寫前之口徑判斷擴為「基礎單位 + 時間口徑」: 缺timeBasis等同'open'; 'open'時不計intervalSec; 'span'與'open'不同、'span'之intervalSec不同亦不同; 口徑不同即不比等效年化、以本次覆寫, 日誌記一行警告(不帶值)
//  WS-TB-05 自訂評估核心收到之strategy.settings含時間口徑之鍵(加速核心依之評估)


let fdTmp = path.resolve('./test/_tmp/estimKeysTimeBasis')
let keys = ['btc_4hr_ma_1day']
let d = null

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

let KEYS5 = ['uIni', 'uTrade', 'rTakeProfit', 'rStopLoss', 'rFee']

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

//run, 於獨立策略資料夾求解並讀回策略檔
let run = async (tag, extra = {}) => {
    let fdData = path.resolve(fdTmp, 'run', tag)
    let m = await estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, ...extra })
    let ss = fs.existsSync(fdData) ? readStrategies(fdData, { readContent: true }) : []
    return { m, ss, fdData }
}

//stub, 替身核心(交易次數固定故tkid固定, 同一資料夾內恆為同一檔), 以rEq指定最終等效年化盈虧
let stub = (rEq) => async () => ({ summary: { numTrade: 30, rWin: '60.00%', uEquityFinal: 1200, rEquivalentCumuProfitOrLossFinalNormYear: rEq } })

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

//seq, 同一資料夾依序求解(替身核心), 回傳最後之策略檔與日誌
let seq = async (tag, steps) => {
    let fdData = path.resolve(fdTmp, 'seq', tag)
    let logs = []
    for (let [rEq, extra] of steps) {
        let ls = await captureLog(() => estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, funRunStrategyCustom: stub(rEq), useShowLog: true, ...extra }))
        logs.push(ls)
    }
    let ss = readStrategies(fdData, { readContent: true })
    return { ss, logs }
}
let MSG_WARN_TIME = '警告: 既有策略與本次之時間口徑不同, 以本次口徑覆寫(不比較等效年化)'
let hasWarn = (ls) => ls.some((args) => args[0] === MSG_WARN_TIME)


describe('estimKeys之每根K線秒數與時間口徑(opt.intervalSec、opt.timeBasis)', function() {

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        d = buildFdData(fdTmp, 'data', keys, { n: 30 }) //30根4hr, 末根20:00(故'span'之回測天數與'open'不同)
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('WS-TB-01 契約: 回測套件之parseBarTime', function() {

        it('package.json對w-trade-backtest之下限須>=1.1.43(含src/barTime.mjs與其預設匯出)', function() {
            let pkg = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'))
            let range = pkg.dependencies['w-trade-backtest']
            let m = /^[\^~>=\s]*(\d+)\.(\d+)\.(\d+)/.exec(range)
            assert.ok(m, `無法解讀之範圍 ${range}`)
            let v = [Number(m[1]), Number(m[2]), Number(m[3])]
            let min = [1, 1, 43]
            let ok = v[0] > min[0] || (v[0] === min[0] && (v[1] > min[1] || (v[1] === min[1] && v[2] >= min[2])))
            assert.ok(ok, `w-trade-backtest之下限 ${range} 低於 1.1.43`)
            //已安裝者亦須提供該預設匯出(函數)
            assert.strictEqual(typeof parseBarTime, 'function')
        })

        it('parseBarTime之實際回傳為{ intervalSec, timeBasis }(鍵序、值與型別): 未給為{ null, \'open\' }, 數字字串轉為數值', function() {
            //本套件之寫入依此契約: 回傳之intervalSec為數值或null, timeBasis為'open'或'span'
            let cases = [
                [undefined, null, 'open'],
                [null, null, 'open'],
                [{}, null, 'open'],
                [{ intervalSec: null, timeBasis: null }, null, 'open'],
                [{ intervalSec: 14400 }, 14400, 'open'],
                [{ intervalSec: '14400' }, 14400, 'open'],
                [{ intervalSec: ' 86400 ' }, 86400, 'open'],
                [{ timeBasis: 'open' }, null, 'open'],
                [{ intervalSec: 14400, timeBasis: 'open' }, 14400, 'open'],
                [{ intervalSec: '86400', timeBasis: 'span' }, 86400, 'span'],
                [{ intervalSec: 60, timeBasis: 'span' }, 60, 'span'],
            ]
            for (let [input, iv, tb] of cases) {
                let r = parseBarTime(input, 'opt')
                assert.deepStrictEqual(Object.keys(r), ['intervalSec', 'timeBasis'], JSON.stringify(input))
                assert.strictEqual(r.intervalSec, iv, JSON.stringify(input))
                assert.strictEqual(r.timeBasis, tb, JSON.stringify(input))
                assert.ok(r.intervalSec === null || typeof r.intervalSec === 'number', JSON.stringify(input))
            }
            //無效者throw, 訊息以`invalid <名稱>.intervalSec`或`invalid <名稱>.timeBasis`起頭(名稱為第2參數), 不含輸入值
            let bad = [
                [{ intervalSec: 0 }, /^invalid opt\.intervalSec: must be /],
                [{ intervalSec: 'abc' }, /^invalid opt\.intervalSec: must be /],
                [{ timeBasis: 'x' }, /^invalid opt\.timeBasis: must be /],
                [{ timeBasis: 'span' }, /^invalid opt\.intervalSec: must be /],
            ]
            for (let [input, re] of bad) {
                assert.throws(() => parseBarTime(input, 'opt'), (err) => re.test(err.message), JSON.stringify(input))
            }
        })

        it('estimKeys寫入settings之值即parseBarTime對同一輸入之回傳(值與型別), 只有給之鍵', async function() {
            let cases = [
                ['c0', { intervalSec: '14400' }],
                ['c1', { intervalSec: 14400 }],
                ['c2', { intervalSec: ' 86400 ' }],
                ['c3', { timeBasis: 'open' }],
                ['c4', { intervalSec: '14400', timeBasis: 'open' }],
                ['c5', { intervalSec: '14400', timeBasis: 'span' }],
                ['c6', { intervalSec: 86400, timeBasis: 'span' }],
            ]
            for (let [tag, extra] of cases) {
                let exp = parseBarTime(extra, 'opt') //契約: 實際回傳
                let { ss } = await run(`ct-${tag}`, { funRunStrategyCustom: stub('20.00%'), ...extra })
                assert.strictEqual(ss.length, 1, tag)
                let st = ss[0].data.settings
                let expKeys = [...KEYS5]
                if (extra.intervalSec !== undefined) {
                    expKeys.push('intervalSec')
                    assert.strictEqual(st.intervalSec, exp.intervalSec, tag)
                    assert.strictEqual(typeof st.intervalSec, 'number', tag)
                }
                if (extra.timeBasis !== undefined) {
                    expKeys.push('timeBasis')
                    assert.strictEqual(st.timeBasis, exp.timeBasis, tag)
                }
                assert.deepStrictEqual(Object.keys(st), expKeys, tag) //鍵序intervalSec、timeBasis, 未給之鍵不附加
            }
        })

        it('無效之值即reject(訊息以invalid opt.intervalSec或invalid opt.timeBasis起頭、不含輸入值), 不建fdData、不載入數據', async function() {
            //只用不受回測套件判準微調影響之無效值(判準由回測套件定, 本套件不重述)
            let bad = [
                ['iv', { intervalSec: 0 }], ['iv', { intervalSec: -60 }], ['iv', { intervalSec: '1.5' }],
                ['iv', { intervalSec: 'abc' }], ['iv', { intervalSec: true }], ['iv', { intervalSec: [60] }],
                ['tb', { timeBasis: 'x' }], ['tb', { timeBasis: 'OPEN' }], ['tb', { timeBasis: 1 }], ['tb', { intervalSec: 14400, timeBasis: 'spam' }],
                ['iv', { timeBasis: 'span' }], //'span'須同時給intervalSec
            ]
            for (let [k, [kind, extra]] of bad.entries()) {
                let fdData = path.resolve(fdTmp, `bad-${k}`)
                await assert.rejects(estimKeys(ott, name, symbol, interval, path.resolve(fdTmp, 'no-ohlc'), path.resolve(fdTmp, 'no-param'), d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, ...extra }), (err) => {
                    let re = kind === 'iv' ? /^invalid opt\.intervalSec: must be / : /^invalid opt\.timeBasis: must be /
                    assert.match(err.message, re, `case ${k}: ${err.message}`)
                    let v = kind === 'iv' ? extra.intervalSec : extra.timeBasis
                    if (typeof v === 'string' && !/^[\d.]+$/.test(v) && v !== 'span' && v !== 'open') {
                        assert.ok(!err.message.includes(v), `case ${k} 不得回顯輸入值`) //數字與open/span本為訊息之字樣, 只驗其餘字串
                    }
                    return true
                })
                assert.ok(!fs.existsSync(fdData), `case ${k} 不得建立fdData`)
            }
        })

    })

    describe('WS-TB-02、03 settings之附加與績效數字', function() {

        it('未給或為null、undefined時settings之鍵與鍵序同既有', async function() {
            for (let [tag, extra] of [['none', {}], ['null', { intervalSec: null, timeBasis: null }], ['undef', { intervalSec: undefined, timeBasis: undefined }]]) {
                let { ss } = await run(`def-${tag}`, { funRunStrategyCustom: stub('20.00%'), ...extra })
                assert.strictEqual(ss.length, 1, tag)
                assert.deepStrictEqual(Object.keys(ss[0].data.settings), KEYS5, tag)
            }
        })

        it('只給intervalSec(數字字串): settings多intervalSec一鍵(轉為數值), 以檔內settings重放與去掉intervalSec重放之摘要皆與檔內相同', async function() {
            let { ss } = await run('iv', { intervalSec: '14400' })
            assert.ok(ss.length > 0)
            for (let s of ss) {
                let st = s.data.settings
                assert.deepStrictEqual(Object.keys(st), [...KEYS5, 'intervalSec'])
                assert.strictEqual(st.intervalSec, 14400)
                let r1 = await replay(s.data, st)
                let { intervalSec, ...st0 } = st
                let r0 = await replay(s.data, st0)
                assert.deepStrictEqual(noTimeTest(r1.summary), noTimeTest(s.data.summary))
                assert.deepStrictEqual(noTimeTest(r0.summary), noTimeTest(s.data.summary)) //績效數字與未給相同
            }
        })

        it('只給timeBasis為open: settings多timeBasis一鍵, 績效數字與未給相同', async function() {
            let { ss } = await run('open', { timeBasis: 'open' })
            assert.ok(ss.length > 0)
            for (let s of ss) {
                let st = s.data.settings
                assert.deepStrictEqual(Object.keys(st), [...KEYS5, 'timeBasis'])
                assert.strictEqual(st.timeBasis, 'open')
                let { timeBasis, ...st0 } = st
                assert.deepStrictEqual(noTimeTest((await replay(s.data, st0)).summary), noTimeTest(s.data.summary))
            }
        })

        it('timeBasis為span: settings帶兩鍵, 官方重放相符, 且與open之回測天數不同(鑑別前提)', async function() {
            let { ss } = await run('span', { intervalSec: 14400, timeBasis: 'span' })
            assert.ok(ss.length > 0)
            let nDiff = 0
            for (let s of ss) {
                let st = s.data.settings
                assert.deepStrictEqual(Object.keys(st), [...KEYS5, 'intervalSec', 'timeBasis'])
                assert.strictEqual(st.intervalSec, 14400)
                assert.strictEqual(st.timeBasis, 'span')
                assert.deepStrictEqual(noTimeTest((await replay(s.data, st)).summary), noTimeTest(s.data.summary))
                let { intervalSec, timeBasis, ...st0 } = st
                let r0 = await replay(s.data, st0)
                if (r0.summary.btDays !== s.data.summary.btDays) {
                    nDiff++
                }
            }
            assert.strictEqual(nDiff, ss.length, '末根20:00之4hr資料, span之回測天數須多1日')
        })

        it('與基礎單位併用時鍵序為既有五鍵、unit、intervalSec、timeBasis', async function() {
            let { ss } = await run('unit', { funRunStrategyCustom: stub('20.00%'), uIni: 10000, unit: { rule: { stepSize: 0.001, minQty: 0.001, minNotional: 20 } }, intervalSec: 14400, timeBasis: 'span' })
            assert.deepStrictEqual(Object.keys(ss[0].data.settings), [...KEYS5, 'unit', 'intervalSec', 'timeBasis'])
        })

    })

    describe('WS-TB-04 同tkid覆寫前之口徑判斷', function() {

        let rEqOf = (ss) => ss[0].data.summary.rEquivalentCumuProfitOrLossFinalNormYear

        it('只差intervalSec(open)者為同一口徑: 既有99%不被本次20%覆寫, 亦無時間口徑之警告', async function() {
            for (let [tag, a, b] of [
                ['def-iv', {}, { intervalSec: 14400 }],
                ['iv-def', { intervalSec: 14400 }, {}],
                ['open-iv', { timeBasis: 'open' }, { intervalSec: 86400 }],
                ['ivopen-def', { intervalSec: 14400, timeBasis: 'open' }, {}],
            ]) {
                let { ss, logs } = await seq(tag, [['99.00%', a], ['20.00%', b]])
                assert.strictEqual(ss.length, 1, tag)
                assert.strictEqual(rEqOf(ss), '99.00%', tag)
                assert.ok(!hasWarn(logs[1]), tag)
            }
        })

        it('span與open、span之intervalSec不同、無法解讀者為不同口徑: 本次20%覆寫既有99%並記警告', async function() {
            for (let [tag, a, b] of [
                ['def-span', {}, { intervalSec: 14400, timeBasis: 'span' }],
                ['span-def', { intervalSec: 14400, timeBasis: 'span' }, {}],
                ['span-open', { intervalSec: 14400, timeBasis: 'span' }, { intervalSec: 14400, timeBasis: 'open' }],
                ['span-span2', { intervalSec: 14400, timeBasis: 'span' }, { intervalSec: 86400, timeBasis: 'span' }],
            ]) {
                let { ss, logs } = await seq(tag, [['99.00%', a], ['20.00%', b]])
                assert.strictEqual(ss.length, 1, tag)
                assert.strictEqual(rEqOf(ss), '20.00%', tag)
                assert.ok(hasWarn(logs[1]), tag)
                assert.strictEqual(logs[1].find((args) => args[0] === MSG_WARN_TIME).length, 2, `${tag} 警告只帶檔名`)
            }
            //既有檔之timeBasis無法解讀(手改): 視為不同口徑
            let { ss, fdData } = await run('garbage', { funRunStrategyCustom: stub('99.00%') })
            let fp = path.resolve(fdData, ss[0].name)
            let dt = JSON.parse(fs.readFileSync(fp, 'utf8'))
            dt.settings.timeBasis = 'garbage'
            fs.writeFileSync(fp, JSON.stringify(dt), 'utf8')
            let r = await run('garbage', { funRunStrategyCustom: stub('20.00%') })
            assert.strictEqual(rEqOf(r.ss), '20.00%')
        })

        it('同一span口徑照舊以等效年化比較', async function() {
            let sp = { intervalSec: 14400, timeBasis: 'span' }
            let { ss, logs } = await seq('span-span', [['99.00%', sp], ['20.00%', { intervalSec: '14400', timeBasis: 'span' }], ['99.50%', sp]])
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(rEqOf(ss), '99.50%')
            assert.ok(!hasWarn(logs[1]) && !hasWarn(logs[2]))
        })

    })

    describe('WS-TB-05 自訂評估核心', function() {

        it('加速核心收到含時間口徑之settings: 其等效年化與官方回測相同, 存檔前官方重跑之摘要落地', async function() {
            let seen = []
            let byKey = new Map()
            let fast = async ({ ott, strategy, funGetSeries }) => {
                seen.push({ ...strategy.settings })
                let sk = keys.join(',')
                let session = byKey.get(sk)
                if (!session) {
                    let arrOhlc = await funGetSeries(strategy.keyOhlc)
                    let serieses = {}
                    for (let k of keys) {
                        serieses[k] = await funGetSeries(k)
                    }
                    session = buildStrategyFastSession(ott, { arrOhlc, mode: strategy.mode, serieses })
                    byKey.set(sk, session)
                }
                return { summary: session.evaluate({ conds: strategy.conds, tp: strategy.settings.rTakeProfit, sl: strategy.settings.rStopLoss, settings: strategy.settings }) }
            }
            let { ss } = await run('fast', { funRunStrategyCustom: fast, useRunStrategyBeforeSave: true, intervalSec: 14400, timeBasis: 'span' })
            assert.ok(seen.length > 0 && seen.every((st) => st.intervalSec === 14400 && st.timeBasis === 'span'))
            assert.ok(ss.length > 0)
            for (let s of ss) {
                let rf = await fast({ ott, strategy: s.data, funGetSeries: await dataProvide(d.fdOhlc, d.fdParam).buildGetTimeSeriesByTimeRange(s.data.solve.timeStart, s.data.solve.timeEnd) })
                for (let k of ['numTrade', 'rWin', 'btDays', 'rEquivalentCumuProfitOrLossFinalNormYear']) {
                    assert.deepStrictEqual(rf.summary[k], s.data.summary[k], k)
                }
            }
        })

    })

})
