import assert from 'assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import * as nodeModule from 'module'
import { fileURLToPath } from 'url'
import rang from 'wsemi/src/rang.mjs'
import wround from 'wsemi/src/round.mjs'
import estimKeys from '../src/estimKeys.mjs'
import estimFinder from '../src/estimFinder.mjs'
import readStrategies from '../src/readStrategies.mjs'
import genTid from '../src/genTid.mjs'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import calcLevelNumTrade from '../src/calcLevelNumTrade.mjs'
import WTradeSolve from '../src/WTradeSolve.mjs'
import ott from '../src/ott.mjs'
import { buildFdData, name, symbol, interval } from './unit-setup.mjs'


//規格來源: sgud/rule/rulebook.md 之 WS-GL-01 ~ WS-GL-09、WS-KN-01 與 src/estimKeys.mjs、src/calcLevelNumTrade.mjs、src/genStrategyFileName.mjs 之 JSDoc
//  WS-GL-01 opt.thsCond: 非空陣列且至多1001點, 元素為有效數字或數字字串(isenum), 轉為數值後嚴格遞增; 無效即throw `invalid opt.thsCond: must be a non-empty array of at most 1001 strictly increasing finite numbers`(不含輸入值), 於載入數據、建立fdData之前; null或undefined為未給
//  WS-GL-02 給opt.thsCond時: 每個key之可用值為[...格點+vdir, ...格點-vdir](vdir = max(格點絕對值之最大者, 2) * 5), 還原以查表得格點原值(不取捨小數位), 解值>0為'>'、<0為'<'; 解值非可用值者拋`invalid x`
//  WS-GL-03 給opt.thsCond時策略檔之solve於thsSl之後記轉為數值之thsCond; 未給不記
//  WS-GL-04 級距設定(estimKeys之opt.levelNumTradeBounds、calcLevelNumTrade與genStrategyFileName之設定物件opt.levelNumTradeBounds): 非空陣列且至多101個, 元素為正整數或整數字串(iseint且>=1), 轉為數值後嚴格遞增; 無效即throw `invalid opt.levelNumTradeBounds: must be a non-empty array of at most 101 strictly increasing positive integers`(不含輸入值); calcLevelNumTrade之第2參數非物件(陣列map等回呼所收之索引)時視為未給
//  WS-GL-05 級距代碼 = 不大於交易次數之最大下界, 小於首個下界(含<=0)者為0, 末級距不設上限
//  WS-GL-06 給級距設定時tkid為`${tid}:${級距}@${下界以逗號串接}`, 檔名為`${mode}_${級距}_${md5(`${coin}:${interval}:${tkid}`)前16碼}.json`
//  WS-GL-07 同一資料夾混用不同級距設定時互不覆寫(識別與檔名皆不同); 同一級距設定之同tkid照舊以等效年化比較
//  WS-GL-08 給opt.levelNumTradeBounds時策略檔之solve記轉為數值之levelNumTradeBounds; 未給不記
//  WS-GL-09 未給兩選項(或為null)時格點、還原、級距、tkid、檔名與solve之鍵逐位同既有
//  WS-KN-01 鍵名之期別標籤依實際時間跨度換算時(每根1day之標籤為4hr標籤之6倍時間, 期別為鍵之末段), 識別、檔名、去重與讀回正確且無碰撞; genTid剔除`${interval}_`之步驟不觸及此類鍵名


let fdTmp = path.resolve('./test/_tmp/estimKeysGridLevel')

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

let keys = ['btc_4hr_ma_1day']
let d = null

//MSG, 兩選項之錯誤訊息
let MSG_THS = 'invalid opt.thsCond: must be a non-empty array of at most 1001 strictly increasing finite numbers'
let MSG_BDS = 'invalid opt.levelNumTradeBounds: must be a non-empty array of at most 101 strictly increasing positive integers'

//lvOpt, calcLevelNumTrade之設定物件
let lvOpt = (levelNumTradeBounds) => ({ levelNumTradeBounds })

//canHook, module.register(子行程之模組解析鉤子)需Node >= 20.6(或18.19)
let canHook = typeof nodeModule.register === 'function'

//runHook, 子行程(test/tools/gridLevelRun.mjs)掛上解析鉤子後執行指定情境, 回傳其最後一行之JSON
let runHook = (mode, tag) => {
    let fdTools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tools')
    let r = spawnSync(process.execPath, [path.resolve(fdTools, 'gridLevelRun.mjs'), path.resolve(fdTmp, `hook-${tag}`), mode], { encoding: 'utf8', windowsHide: true, timeout: 120000 })
    let ls = String(r.stdout || '').trim().split('\n')
    try {
        return JSON.parse(ls[ls.length - 1])
    }
    catch (err) {
        throw new Error(`gridLevelRun ${mode} 輸出非預期: status ${r.status}; ${String(r.stderr || '').slice(0, 500)}`)
    }
}

//smOf, 替身核心之摘要(numTrade與等效年化可指定, 其餘欄過三門檻)
let smOf = (numTrade, rEq = '20.00%') => ({ numTrade, rWin: '60.00%', uEquityFinal: 1200, rEquivalentCumuProfitOrLossFinalNormYear: rEq })

//rec, 替身核心: 記錄各次評估之conds, 回傳指定之摘要
let rec = (sm) => {
    let seen = []
    let core = async ({ strategy }) => {
        seen.push(strategy.conds.map((c) => ({ ...c })))
        return { summary: sm }
    }
    return { seen, core }
}

//runIn, 於指定策略資料夾求解並讀回策略檔; 同時記錄funEndLoop所見之各粒子(ind, value)
let runIn = async (fdData, extra = {}, ks = keys, dd = d, nm = name, itv = interval) => {
    let pairs = []
    let m = await estimKeys(ott, nm, symbol, itv, dd.fdOhlc, dd.fdParam, dd.timeStart, dd.timeEnd, 'long', ks, fdData, {
        ...optQuick,
        funEndLoop: (particles) => {
            particles.forEach((p) => {
                p.ps.forEach((v, i) => {
                    pairs.push({ i, ind: v.ind, value: v.value })
                })
            })
        },
        ...extra,
    })
    let ss = fs.existsSync(fdData) ? readStrategies(fdData, { readContent: true }) : []
    return { m, ss, pairs }
}

//md5h, md5前16碼
let md5h = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(0, 16)


describe('estimKeys之條件門檻格點與交易次數級距', function() {

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        d = buildFdData(fdTmp, 'data', keys, { n: 30 })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('WS-GL-09 未給新選項時逐位同既有', function() {

        it('門檻之可用值為rang(-2,2,40)各平移+10與-10(82點, 依序), 還原為扣除平移後取至小數3位', async function() {
            let { core, seen } = rec(smOf(30))
            let { pairs, ss } = await runIn(path.resolve(fdTmp, 'def'), { funRunStrategyCustom: core, Nl: 4 })
            let base = rang(-2, 2, 40)
            let values = [...base.map((v) => v + 10), ...base.map((v) => v - 10)] //WS-GL-09: 既有之可用值
            let kp = pairs.filter((p) => p.i === 2)
            assert.ok(kp.length > 0)
            kp.forEach((p) => {
                assert.ok(p.ind >= 0 && p.ind < 82, `ind ${p.ind}`)
                assert.strictEqual(p.value, values[p.ind], `ind ${p.ind}`) //可用值逐位同既有
            })
            //還原: '>'為wround(x-10,3), '<'為wround(x+10,3)
            let ths41 = base.map((v) => wround(v, 3))
            seen.forEach((cs) => {
                assert.ok(ths41.includes(cs[0].th), `th ${cs[0].th}`)
            })
            //solve無新鍵, tkid不帶級距設定
            assert.strictEqual(ss.length, 1)
            let c = ss[0].data
            assert.deepStrictEqual(Object.keys(c.solve), ['timeStart', 'timeEnd', 'methodOml', 'thNumTrade', 'thRWin', 'thREquivalentCumuProfitOrLossFinalNormYear', 'thsTp', 'thsSl', 'timeSolved'])
            assert.strictEqual(c.tkid, `${c.tid}:12`)
            assert.strictEqual(ss[0].name, genStrategyFileName(name, interval, 'long', keys, {}, { numTrade: 30 }))
            assert.strictEqual(ss[0].name, `long_12_${md5h(`${name}:${interval}:${c.tid}:12`)}.json`) //既有之雜湊輸入
        })

        it('兩選項為null或undefined時視同未給', async function() {
            for (let [tag, extra] of [['n', { thsCond: null, levelNumTradeBounds: null }], ['u', { thsCond: undefined, levelNumTradeBounds: undefined }]]) {
                let { core } = rec(smOf(30))
                let { ss } = await runIn(path.resolve(fdTmp, `def-${tag}`), { funRunStrategyCustom: core, ...extra })
                let c = ss[0].data
                assert.ok(!('thsCond' in c.solve) && !('levelNumTradeBounds' in c.solve), tag)
                assert.strictEqual(c.tkid, `${c.tid}:12`, tag)
                assert.strictEqual(c.levelNumTrade, 12, tag)
            }
        })

        it('calcLevelNumTrade之回呼寫法(map、Array.from)與第2參數為{}、null、undefined或省略時同既有', function() {
            //既有級距表: 3 → 1、30 → 12、300 → 102、7 → 2、70 → 13(第2參數為設定物件, 回呼所收之索引不是設定)
            assert.deepStrictEqual([3, 30, 300].map(calcLevelNumTrade), [1, 12, 102])
            assert.deepStrictEqual([3, 30, 300].map(WTradeSolve.calcLevelNumTrade), [1, 12, 102])
            assert.deepStrictEqual(Array.from([7, 70], calcLevelNumTrade), [2, 13])
            assert.deepStrictEqual([5, 6, 9, 10].map((v, i, arr) => calcLevelNumTrade(v, i, arr)), [1, 2, 2, 11])
            for (let [n, lv] of [[-3, 0], [0, 0], [1, 1], [5, 1], [6, 2], [9, 2], [10, 11], [24, 11], [25, 12], [99, 14], [100, 101], [999, 104], [1000, 1001], [4999, 1004], [5000, 100], [8000, 100]]) {
                assert.strictEqual(calcLevelNumTrade(n), lv, `n ${n}`)
                assert.strictEqual(calcLevelNumTrade(n, {}), lv, `n ${n} {}`)
                assert.strictEqual(calcLevelNumTrade(n, null), lv, `n ${n} null`)
                assert.strictEqual(calcLevelNumTrade(n, undefined), lv, `n ${n} undefined`)
                assert.strictEqual(calcLevelNumTrade(n, { levelNumTradeBounds: null }), lv, `n ${n} bounds null`)
            }
        })

        it('genStrategyFileName之新參數為null或undefined時同既有', function() {
            for (let n of [-3, 0, 1, 5, 6, 9, 10, 24, 25, 99, 100, 999, 1000, 4999, 5000, 8000]) {
                assert.strictEqual(genStrategyFileName('btc', '4hr', 'long', ['aa', 'bb'], {}, { numTrade: n }, { levelNumTradeBounds: null }), genStrategyFileName('btc', '4hr', 'long', ['aa', 'bb'], {}, { numTrade: n }), `n ${n}`)
                assert.strictEqual(genStrategyFileName('btc', '4hr', 'long', ['aa', 'bb'], {}, { numTrade: n }, {}), genStrategyFileName('btc', '4hr', 'long', ['aa', 'bb'], {}, { numTrade: n }), `n ${n}`)
            }
        })

    })

    describe('WS-GL-01 ~ 03 opt.thsCond', function() {

        it('入庫與評估之門檻皆為所給格點之原值(不取捨小數位), 數字字串轉為數值, solve記錄thsCond', async function() {
            //格點含小數3位以下之值(-0.0005、1/3)與超出±2者, 既有之取捨會使其不在格點內
            let given = [-3.5, '-0.0005', 1 / 3, ' 2.75 ']
            let ths = [-3.5, -0.0005, 1 / 3, 2.75]
            Object.freeze(given)
            let { core, seen } = rec(smOf(30))
            let { ss, m } = await runIn(path.resolve(fdTmp, 'g1'), { funRunStrategyCustom: core, thsCond: given })
            assert.ok(seen.length > 0)
            seen.forEach((cs) => {
                assert.ok(ths.includes(cs[0].th), `th ${cs[0].th} 不在格點內`) //WS-GL-02: 原值
                assert.ok(cs[0].sym === '>' || cs[0].sym === '<')
            })
            assert.strictEqual(ss.length, 1)
            let c = ss[0].data
            assert.ok(ths.includes(c.conds[0].th))
            assert.deepStrictEqual(c.solve.thsCond, ths) //WS-GL-03: 轉為數值
            assert.deepStrictEqual(Object.keys(c.solve), ['timeStart', 'timeEnd', 'methodOml', 'thNumTrade', 'thRWin', 'thREquivalentCumuProfitOrLossFinalNormYear', 'thsTp', 'thsSl', 'thsCond', 'timeSolved'])
            //最佳解之解值為格點±vdir, vdir = max(3.5, 2) * 5 = 17.5
            let enc = [...ths.map((v) => v + 17.5), ...ths.map((v) => v - 17.5)]
            assert.ok(enc.includes(m.bestSolution.ps[2].value), `解值 ${m.bestSolution.ps[2].value}`)
            assert.strictEqual(c.tkid, `${c.tid}:12`) //thsCond不參與tkid
        })

        it('可用值為[...格點+vdir, ...格點-vdir], 格點落於±2內者vdir為10', async function() {
            let ths = [-0.5, 0, 0.25]
            let values = [...ths.map((v) => v + 10), ...ths.map((v) => v - 10)]
            let { core, seen } = rec(smOf(30))
            let { pairs } = await runIn(path.resolve(fdTmp, 'g2'), { funRunStrategyCustom: core, thsCond: ths, Nl: 6 })
            let kp = pairs.filter((p) => p.i === 2)
            assert.ok(kp.length > 0)
            kp.forEach((p) => {
                assert.ok(p.ind >= 0 && p.ind < 6, `ind ${p.ind} 超出2倍格點數`) //WS-GL-02: 可用值個數為格點數之2倍
                assert.strictEqual(p.value, values[p.ind], `ind ${p.ind}`) //WS-GL-02: 依序之編碼
            })
            //還原: '>'組(ind<3)為格點原值且sym為'>', '<'組為'<'
            seen.forEach((cs) => {
                assert.ok(ths.includes(cs[0].th))
            })
        })

        it('格點超出±2時vdir隨之放大, 各可用值仍依序對應', async function() {
            let ths = [-6, -1, 4]
            let vdir = 30
            let values = [...ths.map((v) => v + vdir), ...ths.map((v) => v - vdir)]
            let { core } = rec(smOf(30))
            let { pairs } = await runIn(path.resolve(fdTmp, 'g3'), { funRunStrategyCustom: core, thsCond: ths, Nl: 6 })
            let kp = pairs.filter((p) => p.i === 2)
            assert.ok(kp.length > 0)
            kp.forEach((p) => {
                assert.strictEqual(p.value, values[p.ind], `ind ${p.ind}`)
            })
        })

        it('多個key共用同一格點(各key之可用值相同)', async function() {
            let ks = ['btc_4hr_ma_1day', 'btc_4hr_ma_2day']
            let dd = buildFdData(fdTmp, 'data2', ks, { n: 30 })
            let ths = [-1, 0.5, 1.5, 3]
            let values = [...ths.map((v) => v + 15), ...ths.map((v) => v - 15)]
            let { core, seen } = rec(smOf(30))
            let { pairs } = await runIn(path.resolve(fdTmp, 'g4'), { funRunStrategyCustom: core, thsCond: ths, Nl: 4 }, ks, dd)
            let kp = pairs.filter((p) => p.i >= 2)
            assert.ok(kp.some((p) => p.i === 2) && kp.some((p) => p.i === 3))
            kp.forEach((p) => {
                assert.strictEqual(p.value, values[p.ind], `i ${p.i} ind ${p.ind}`)
            })
            seen.forEach((cs) => {
                assert.strictEqual(cs.length, 2)
                cs.forEach((c) => assert.ok(ths.includes(c.th)))
            })
        })

        it('無效時reject(訊息固定、不含輸入值), 不建立fdData、不載入數據', async function() {
            let bad = [
                [], 'abc', {}, 1, true,
                [1, 1], [2, 1], [0, -0],
                [NaN], [Infinity], [-Infinity], ['0x10'], [''], ['abc'], [true], [null], [undefined], [[1]], [new Number(1)], [10n],
                [1, 'x'],
                [-1e308, 1e308], //平移後溢位
                [-3e307, 3e307], //平移量有限而末點平移後溢位(兩組仍嚴格遞增)
                [1e308], //單點而平移後溢位
                [1e-20, 2e-20], //平移後無法分辨
                [-3, -3 + 1.5e-15, 3], //原值可分辨, 平移後只有'<'組合併(vdir 15)
                [-3, 3 - 1.5e-15, 3], //原值可分辨, 平移後只有'>'組合併
                [3, -3, 1], //未排序(兩端之絕對值同為3)
                Array.from({ length: 1002 }, (v, i) => i), //超過1001點
            ]
            let sparse = [1, 2]
            sparse.length = 3
            bad.push(sparse)
            for (let [k, v] of bad.entries()) {
                let fdData = path.resolve(fdTmp, `g-bad-${k}`)
                await assert.rejects(estimKeys(ott, name, symbol, interval, path.resolve(fdTmp, 'no-ohlc'), path.resolve(fdTmp, 'no-param'), d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, thsCond: v }), (err) => {
                    assert.strictEqual(err.message, MSG_THS, `case ${k}`)
                    return true
                })
                assert.ok(!fs.existsSync(fdData), `case ${k} 不得建立fdData`)
            }
        })

        it('單點格點、含負零之格點與恰1001點之格點可用', async function() {
            let { core, seen } = rec(smOf(30))
            await runIn(path.resolve(fdTmp, 'g-one'), { funRunStrategyCustom: core, thsCond: [0.7] })
            seen.forEach((cs) => assert.strictEqual(cs[0].th, 0.7))
            let r2 = rec(smOf(30))
            await runIn(path.resolve(fdTmp, 'g-negzero'), { funRunStrategyCustom: r2.core, thsCond: [-1, -0, 1] })
            r2.seen.forEach((cs) => assert.ok([-1, 0, 1].includes(cs[0].th)))
            let ths1001 = Array.from({ length: 1001 }, (v, i) => (i - 500) / 100) //上限之邊界
            let r3 = rec(smOf(30))
            let { ss } = await runIn(path.resolve(fdTmp, 'g-1001'), { funRunStrategyCustom: r3.core, thsCond: ths1001 })
            assert.strictEqual(ss[0].data.solve.thsCond.length, 1001)
            r3.seen.forEach((cs) => assert.ok(ths1001.includes(cs[0].th)))
        })

        it('解值非可用值時拋invalid x(以替身最佳化函數送入非格點之解值; 子行程以模組解析鉤子替換)', function() {
            if (!canHook) {
                console.log('略過: module.register需Node >= 20.6(或18.19)')
                this.skip()
            }
            //鑑別前提: 同一替身送入格點之可用值時照常完成並寫出策略
            let ok = runHook('omlOk', 'ok')
            assert.strictEqual(ok.hook, 'stub', JSON.stringify(ok))
            assert.strictEqual(ok.grid, 'resolved', JSON.stringify(ok))
            assert.strictEqual(ok.gridFiles, 1, JSON.stringify(ok))
            //送入非可用值: 給thsCond時拋invalid x、不寫檔; 未給thsCond時同既有(扣除平移後取捨, 不拋)
            let bad = runHook('omlBad', 'bad')
            assert.strictEqual(bad.hook, 'stub', JSON.stringify(bad))
            assert.strictEqual(bad.grid, 'invalid x', JSON.stringify(bad))
            assert.strictEqual(bad.gridFiles, 0, JSON.stringify(bad))
            assert.strictEqual(bad.def, 'resolved', JSON.stringify(bad))
        })

        it('每個可用值之還原: 前半(格點+vdir)為\'>\'、後半(格點-vdir)為\'<\', 門檻為對應格點之原值; 各key之可用值陣列各一份副本(子行程以替身最佳化函數依序評估最後一個設計變數之全部可用值)', function() {
            if (!canHook) {
                console.log('略過: module.register需Node >= 20.6(或18.19)')
                this.skip()
            }
            let o = runHook('omlAll', 'all')
            assert.strictEqual(o.hook, 'stub', JSON.stringify(o)) //前提: 鉤子生效
            assert.strictEqual(o.r, 'resolved', JSON.stringify(o))
            let ths = [-1, 0.5, 3]
            //WS-GL-02: 可用值依序為[...格點+vdir(>0, '>'), ...格點-vdir(<0, '<')], 各還原為對應格點之原值
            assert.deepStrictEqual(o.seen, [...ths.map((t) => ['>', t]), ...ths.map((t) => ['<', t])], JSON.stringify(o))
            assert.strictEqual(o.info.n, 6) //n為格點數之2倍
            assert.strictEqual(o.info.nValues, 6)
            assert.strictEqual(o.info.shared, false) //WS-GL-02: 各key各一份副本(非同一陣列)
        })

    })

    describe('WS-GL-04 ~ 08 交易次數級距', function() {

        let bds = [1, 3, 6, 10, 20, 40]
        let tagB = '1,3,6,10,20,40'

        it('calcLevelNumTrade: 級距代碼為不大於交易次數之最大下界, 小於首個下界者為0, 末級距不設上限', function() {
            let kp = [[-5, 0], [0, 0], [1, 1], [2, 1], [3, 3], [5, 3], [6, 6], [9, 6], [10, 10], [19, 10], [20, 20], [39, 20], [40, 40], [41, 40], [100000, 40]]
            kp.forEach(([n, lv]) => {
                assert.strictEqual(calcLevelNumTrade(n, lvOpt(bds)), lv, `n ${n}`)
            })
            //首個下界大於1: 小於首個下界者為0
            assert.strictEqual(calcLevelNumTrade(4, lvOpt([5, 50])), 0)
            assert.strictEqual(calcLevelNumTrade(5, lvOpt([5, 50])), 5)
            assert.strictEqual(calcLevelNumTrade(49, lvOpt([5, 50])), 5)
            assert.strictEqual(calcLevelNumTrade(50, lvOpt([5, 50])), 50)
            //交易次數之轉換同既有(cint四捨五入、數字字串)
            assert.strictEqual(calcLevelNumTrade(2.6, lvOpt(bds)), 3)
            assert.strictEqual(calcLevelNumTrade('7', lvOpt(bds)), 6)
            //下界收整數字串; 恰101個下界可用(上限之邊界)
            assert.strictEqual(calcLevelNumTrade(7, lvOpt(['1', ' 3 ', '6.0'])), 6)
            let b101 = Array.from({ length: 101 }, (v, i) => i + 1)
            assert.strictEqual(calcLevelNumTrade(1000, lvOpt(b101)), 101)
            assert.strictEqual(calcLevelNumTrade(57, lvOpt(b101)), 57)
        })

        it('calcLevelNumTrade與genStrategyFileName: 下界無效時throw(訊息固定、不含輸入值)', function() {
            let bad = [[], 'x', {}, 3, [0], [-1], [1.5], [1, 1], [3, 2], ['a'], [null], [NaN], [Infinity], [2 ** 53], ['0x10'], [true], [new Number(1)], ['9007199254740993'], Array.from({ length: 102 }, (v, i) => i + 1)]
            bad.forEach((v, k) => {
                assert.throws(() => calcLevelNumTrade(5, lvOpt(v)), (err) => err.message === MSG_BDS, `case ${k}`)
                assert.throws(() => genStrategyFileName('btc', '4hr', 'long', ['aa'], {}, { numTrade: 5 }, { levelNumTradeBounds: v }), (err) => err.message === MSG_BDS, `case ${k}`)
            })
        })

        it('genStrategyFileName: 給下界時檔名之級距段為級距代碼, 雜湊輸入之tkid帶級距設定, 與預設級距之檔名不同', function() {
            let ks = ['aa', 'bb']
            let tid = genTid('btc', '4hr', 'long', ks)
            for (let n of [1, 2, 7, 30, 500]) {
                let lv = calcLevelNumTrade(n, lvOpt(bds))
                let fn = genStrategyFileName('btc', '4hr', 'long', ks, {}, { numTrade: n }, { levelNumTradeBounds: bds })
                assert.strictEqual(fn, `long_${lv}_${md5h(`btc:4hr:${tid}:${lv}@${tagB}`)}.json`, `n ${n}`) //WS-GL-06
                assert.notStrictEqual(fn, genStrategyFileName('btc', '4hr', 'long', ks, {}, { numTrade: n }), `n ${n}`) //預設級距代碼同為1時(n=1)檔名仍不同
                assert.match(fn, /^long_\d+_[0-9a-f]{16}\.json$/) //樣式同既有(readStrategies可依樣式判讀)
            }
            //下界不同者檔名不同; 下界為整數字串者同其數值
            assert.notStrictEqual(genStrategyFileName('btc', '4hr', 'long', ks, {}, { numTrade: 1 }, { levelNumTradeBounds: [1, 3] }), genStrategyFileName('btc', '4hr', 'long', ks, {}, { numTrade: 1 }, { levelNumTradeBounds: [1, 4] }))
            assert.strictEqual(genStrategyFileName('btc', '4hr', 'long', ks, {}, { numTrade: 1 }, { levelNumTradeBounds: ['1', '3'] }), genStrategyFileName('btc', '4hr', 'long', ks, {}, { numTrade: 1 }, { levelNumTradeBounds: [1, 3] }))
        })

        it('estimKeys: 檔內levelNumTrade、tkid、檔名依下界, solve記錄levelNumTradeBounds, readStrategies讀回一致', async function() {
            let given = ['1', 3, '6', 10, 20, ' 40 ']
            Object.freeze(given)
            let { core } = rec(smOf(7))
            let fdData = path.resolve(fdTmp, 'l1')
            let { ss } = await runIn(fdData, { funRunStrategyCustom: core, levelNumTradeBounds: given })
            assert.strictEqual(ss.length, 1)
            let s = ss[0]
            let c = s.data
            assert.strictEqual(c.levelNumTrade, 6) //WS-GL-05
            assert.strictEqual(c.tkid, `${c.tid}:6@${tagB}`) //WS-GL-06
            assert.strictEqual(s.name, genStrategyFileName(name, interval, 'long', keys, {}, { numTrade: 7 }, { levelNumTradeBounds: bds }))
            assert.deepStrictEqual(c.solve.levelNumTradeBounds, bds) //WS-GL-08: 轉為數值
            assert.deepStrictEqual(Object.keys(c.solve), ['timeStart', 'timeEnd', 'methodOml', 'thNumTrade', 'thRWin', 'thREquivalentCumuProfitOrLossFinalNormYear', 'thsTp', 'thsSl', 'levelNumTradeBounds', 'timeSolved'])
            assert.strictEqual(s.tkid, c.tkid)
            assert.strictEqual(s.levelNumTrade, '6')
            assert.strictEqual(s.tid, c.tid)
        })

        it('同一級距設定之同tkid照舊以等效年化比較(較佳者覆寫, 較差者不寫)', async function() {
            let fdData = path.resolve(fdTmp, 'l2')
            for (let [rEq, exp] of [['20.00%', '20.00%'], ['30.00%', '30.00%'], ['10.00%', '30.00%']]) {
                let { core } = rec(smOf(7, rEq))
                let { ss } = await runIn(fdData, { funRunStrategyCustom: core, levelNumTradeBounds: bds })
                assert.strictEqual(ss.length, 1)
                assert.strictEqual(ss[0].data.summary.rEquivalentCumuProfitOrLossFinalNormYear, exp, `rEq ${rEq}`)
            }
        })

        it('WS-GL-07 混用: 既有預設級距之策略不被自訂級距之策略覆寫(級距代碼相同亦然), 不同下界亦互不覆寫', async function() {
            let fdData = path.resolve(fdTmp, 'l3')
            //既有: 預設級距(numTrade 1 → 代碼1), 等效年化99%
            let r0 = rec(smOf(1, '99.00%'))
            await runIn(fdData, { funRunStrategyCustom: r0.core })
            //自訂下界[1,3,6](numTrade 1 → 代碼1), 等效年化20%(較差): 鑑別前提 —— 若與預設同檔名, 較差者不會寫入, 只剩1檔
            let r1 = rec(smOf(1, '20.00%'))
            await runIn(fdData, { funRunStrategyCustom: r1.core, levelNumTradeBounds: [1, 3, 6] })
            //另一組下界[1,2,4]
            let r2 = rec(smOf(1, '10.00%'))
            let { ss } = await runIn(fdData, { funRunStrategyCustom: r2.core, levelNumTradeBounds: [1, 2, 4] })
            assert.strictEqual(ss.length, 3, `檔數 ${ss.length}`)
            let byTkid = {}
            ss.forEach((s) => {
                byTkid[s.tkid] = s.data.summary.rEquivalentCumuProfitOrLossFinalNormYear
            })
            let tid = genTid(name, interval, 'long', keys)
            assert.deepStrictEqual(byTkid, {
                [`${tid}:1`]: '99.00%',
                [`${tid}:1@1,3,6`]: '20.00%',
                [`${tid}:1@1,2,4`]: '10.00%',
            })
        })

        it('存檔前重跑跨級距時, 新檔名亦依下界', async function() {
            let nCall = 0
            let fdData = path.resolve(fdTmp, 'l4')
            let { ss } = await runIn(fdData, {
                funRunStrategyCustom: async () => {
                    nCall++
                    return { summary: nCall === 1 ? smOf(2) : smOf(0) } //僅首次放行(代碼1)
                },
                useRunStrategyBeforeSave: true,
                funRunStrategyCustomBeforeSave: async () => ({ summary: smOf(7, '33.00%') }), //重跑為代碼6
                levelNumTradeBounds: [1, 3, 6],
            })
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].name, genStrategyFileName(name, interval, 'long', keys, {}, { numTrade: 7 }, { levelNumTradeBounds: [1, 3, 6] }))
            assert.strictEqual(ss[0].data.tkid, `${ss[0].data.tid}:6@1,3,6`)
            assert.strictEqual(ss[0].data.levelNumTrade, 6)
        })

        it('無效時reject(訊息固定、不含輸入值), 不建立fdData、不載入數據', async function() {
            let bad = [[], 'x', {}, 3, [0], [-1], [1.5], [1, 1], [3, 2], ['a'], [null], [NaN], [Infinity], [2 ** 53], ['0x10'], [true], [new Number(1)], Array.from({ length: 102 }, (v, i) => i + 1)]
            for (let [k, v] of bad.entries()) {
                let fdData = path.resolve(fdTmp, `l-bad-${k}`)
                await assert.rejects(estimKeys(ott, name, symbol, interval, path.resolve(fdTmp, 'no-ohlc'), path.resolve(fdTmp, 'no-param'), d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, levelNumTradeBounds: v }), (err) => {
                    assert.strictEqual(err.message, MSG_BDS, `case ${k}`)
                    return true
                })
                assert.ok(!fs.existsSync(fdData), `case ${k} 不得建立fdData`)
            }
        })

        it('經estimFinder原樣傳遞兩選項', async function() {
            let fdData = path.resolve(fdTmp, 'l5')
            let { core, seen } = rec(smOf(7))
            await estimFinder(ott, name, symbol, interval, d.fdOhlc, d.fdParam, fdData, {
                ...optQuick,
                mode: 'long',
                comps: '1,0,0',
                timeStart: d.timeStart,
                timeEnd: d.timeEnd,
                funRunStrategyCustom: core,
                thsCond: [-2.5, 2.5],
                levelNumTradeBounds: [1, 3, 6],
            })
            let ss = readStrategies(fdData, { readContent: true })
            assert.strictEqual(ss.length, 1)
            assert.deepStrictEqual(ss[0].data.solve.thsCond, [-2.5, 2.5])
            assert.strictEqual(ss[0].data.tkid, `${ss[0].data.tid}:6@1,3,6`)
            seen.forEach((cs) => assert.ok([-2.5, 2.5].includes(cs[0].th)))
        })

    })

    describe('WS-KN-01 期別標籤依實際時間跨度之鍵名(每根1day之標籤為4hr標籤之6倍時間)', function() {

        //鍵名組成: `${cointpe}_${keyKind}_${keyIn}_${keyOut}_${method}_${period}`, 期別為末段
        let bars = [1, 2, 3, 4, 5, 6, 12, 24, 42, 90, 180]
        let label = (hours) => hours % 24 === 0 ? `${hours / 24}day` : `${hours}hr`
        let labels4hr = bars.map((b) => label(b * 4)) //4hr, 8hr, ..., 30day
        let labels1day = bars.map((b) => label(b * 24)) //1day, 2day, ..., 180day
        let prefixes = []
        for (let a of ['price', 'index']) {
            for (let b of ['ohlc', 'vbs']) {
                for (let c of ['Close', 'none', 'volumn']) {
                    for (let e of ['param', 'ADX', 'RSI', 'DIF']) {
                        for (let f of ['ma', 'ema', 'adx', 'rsi', 'macd']) {
                            prefixes.push(`${a}_${b}_${c}_${e}_${f}`)
                        }
                    }
                }
            }
        }
        let keysOf = (labels) => {
            let ks = ['index_ohlc_Close_param_orig_none', 'price_ohlc_Close_param_orig_none']
            prefixes.forEach((p) => labels.forEach((lb) => ks.push(`${p}_${lb}`)))
            return ks
        }

        it('標籤表依規則: 每根1day之標籤為4hr標籤之6倍時間, 且含與週期字串同形之1day', function() {
            assert.deepStrictEqual(labels4hr, ['4hr', '8hr', '12hr', '16hr', '20hr', '1day', '2day', '4day', '7day', '15day', '30day'])
            assert.deepStrictEqual(labels1day, ['1day', '2day', '3day', '4day', '5day', '6day', '12day', '24day', '42day', '90day', '180day'])
        })

        for (let [itv, labels] of [['1day', labels1day], ['4hr', labels4hr]]) {

            it(`週期${itv}: 單鍵之tid為單射, 剔除\`${itv}_\`之步驟不觸及任何鍵, 多鍵組合不重複, 檔名不重複`, function() {
                let ks = keysOf(labels)
                //單鍵
                let mTid = new Map()
                ks.forEach((k) => {
                    let t = genTid('eth', itv, 'long', [k])
                    assert.ok(!mTid.has(t), `tid碰撞 ${mTid.get(t)} vs ${k}`)
                    mTid.set(t, k)
                    assert.strictEqual(t, genTid('eth', 'zz-none', 'long', [k]), `剔除週期觸及 ${k}`) //週期字串不在鍵內(期別為末段, 其後無底線)
                })
                //多鍵組合(確定性抽樣)
                let seed = 7
                let rnd = () => {
                    seed = (seed + 0x6D2B79F5) | 0
                    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
                }
                let mCombo = new Map()
                for (let n = 0; n < 5000; n++) {
                    let nk = 2 + Math.floor(rnd() * 3)
                    let cs = []
                    while (cs.length < nk) {
                        let k = ks[Math.floor(rnd() * ks.length)]
                        if (!cs.includes(k)) {
                            cs.push(k)
                        }
                    }
                    let t = genTid('eth', itv, 'long', cs)
                    let sig = cs.join('|')
                    assert.ok(!mCombo.has(t) || mCombo.get(t) === sig, `組合tid碰撞 ${t}`)
                    mCombo.set(t, sig)
                }
                //檔名: 單鍵 × 各級距(預設與自訂), 相異之(鍵, 級距設定, 級距代碼)各得相異之檔名
                let sFn = new Set()
                let sTk = new Set()
                ks.forEach((k) => {
                    for (let numTrade of [3, 8, 20, 60, 200, 1500, 6000]) {
                        sFn.add(genStrategyFileName('eth', itv, 'long', [k], {}, { numTrade }))
                        sTk.add(`${k}|def|${calcLevelNumTrade(numTrade)}`)
                        sFn.add(genStrategyFileName('eth', itv, 'long', [k], {}, { numTrade }, { levelNumTradeBounds: [1, 3, 6, 10, 20, 40] }))
                        sTk.add(`${k}|bds|${calcLevelNumTrade(numTrade, lvOpt([1, 3, 6, 10, 20, 40]))}`)
                    }
                })
                assert.strictEqual(sFn.size, sTk.size)
            })

        }

        it('同一鍵名於4hr與1day之檔名不同(雜湊含週期)', function() {
            let k = 'price_ohlc_Close_param_ma_1day'
            assert.strictEqual(genTid('eth', '4hr', 'long', [k]), genTid('eth', '1day', 'long', [k]))
            assert.notStrictEqual(genStrategyFileName('eth', '4hr', 'long', [k], {}, { numTrade: 30 }), genStrategyFileName('eth', '1day', 'long', [k], {}, { numTrade: 30 }))
        })

        it('以每根1day之新名稱求解(官方回測): 識別、檔名、去重與讀回正確', async function() {
            //合成日線(各根逐筆相異)與3個新名稱之因子
            let ks = ['price_ohlc_Close_param_ma_1day', 'index_ohlc_none_RSI_rsi_6day', 'price_vbs_volumn_param_ema_180day']
            let nm = 'eth'
            let fdRoot = path.resolve(fdTmp, 'kn')
            let fdOhlc = path.resolve(fdRoot, 'ohlc')
            let fdParam = path.resolve(fdRoot, 'param')
            fs.mkdirSync(fdOhlc, { recursive: true })
            fs.mkdirSync(fdParam, { recursive: true })
            let n = 40
            let ts = []
            for (let i = 0; i < n; i++) {
                ts.push(new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 19))
            }
            let c0 = 100
            let arrOhlc = ts.map((time, i) => {
                let o = c0
                c0 = Math.max(1, c0 + Math.sin(i * 0.31) * 4 + Math.cos(i * 0.11) * 3)
                return { time, Open: o, High: Math.max(o, c0) + 2, Low: Math.min(o, c0) - 2, Close: c0 }
            })
            fs.writeFileSync(path.resolve(fdOhlc, `${nm}_price_1day.json`), JSON.stringify(arrOhlc), 'utf8')
            ks.forEach((k, j) => {
                fs.writeFileSync(path.resolve(fdParam, `${k}.json`), JSON.stringify(ts.map((time, i) => ({ time, param: Math.sin(i * 0.17 + j * 0.5) }))), 'utf8')
            })
            let dd = { fdOhlc, fdParam, timeStart: ts[0], timeEnd: ts[n - 1] }
            let tidExp = 'long ║ p_ohlc_c_param_ma_1day ║ i_ohlc_none_RSI_rsi_6day ║ p_vbs_volumn_param_ema_180day' //縮寫只換price_、index_、Close_
            for (let [tag, extra] of [['def', {}], ['bds', { levelNumTradeBounds: [1, 3, 6, 10] }]]) {
                let fdData = path.resolve(fdRoot, `s-${tag}`)
                let { ss } = await runIn(fdData, extra, ks, dd, nm, '1day')
                assert.ok(ss.length > 0, tag)
                let tkids = ss.map((s) => s.tkid)
                assert.strictEqual(new Set(tkids).size, tkids.length, `${tag} tkid重複`)
                ss.forEach((s) => {
                    let c = s.data
                    assert.strictEqual(c.tid, tidExp, tag)
                    assert.strictEqual(s.tid, tidExp, tag)
                    assert.deepStrictEqual(s.ps, tidExp.split(' ║ ').slice(1), tag)
                    assert.deepStrictEqual(c.conds.map((v) => v.key), ks, tag)
                    assert.strictEqual(c.keyOhlc, `${nm}_price_1day`, tag)
                    assert.strictEqual(s.name, genStrategyFileName(nm, '1day', 'long', ks, c.settings, c.summary, extra), tag)
                    assert.strictEqual(c.levelNumTrade, calcLevelNumTrade(c.numTrade, extra), tag)
                })
            }
        })

    })

})
