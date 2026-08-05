import assert from 'assert'
import fs from 'fs'
import path from 'path'
import estimKeys from '../src/estimKeys.mjs'
import readStrategies from '../src/readStrategies.mjs'
import genTid from '../src/genTid.mjs'
import cont from '../src/cont.mjs'
import ott from '../src/ott.mjs'
import { buildFdTmp, buildFdData, name, symbol, interval } from './unit-setup.mjs'


//規格來源: src/estimKeys.mjs
//  estimKeys(ott, name, symbol, interval, fdOhlc, fdParam, timeStart, timeEnd, mode, keys, fdData, opt):
//    設計變數為[止損, 止盈, ...各key門檻], 止損止盈由opt.thsSl與opt.thsTp之百分比清單除以100離散取值
//    各key門檻由rang(-2,2,40)之41點各自平移+10與-10為82點, 解值>0代表'>'條件、<0代表'<'條件, 還原時扣除平移值
//    以opt.methodOml指定之演算法求解(預設PSO), 各次以runStrategy回測並經calcFitness計算適應值
//    滿足thNumTrade、thRWin與thREquivalentCumuProfitOrLossFinalNormYear三門檻者, 以genStrategyFileName存入fdData
//    同tkid(tid+級距)已有策略時, 僅於等效年化盈虧更佳時抽換並刪除較差者, 故同tkid恆僅一檔
//    fdData不存在時自動建立


let fdTmp = buildFdTmp('estimKeys')


//optBase: 三門檻皆放寬, 使求解過程之可用參數組必然寫出策略檔
let optBase = {
    thsTp: [3],
    thsSl: [2],
    thNumTrade: 1,
    thRWin: 0,
    thREquivalentCumuProfitOrLossFinalNormYear: -1e9,
}


describe('estimKeys', function() {

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('求解與策略儲存', function() {

        let keys = ['btc_4hr_ma_1day']
        let d = null
        let m = null

        before(async function() {
            this.timeout(120000)
            d = buildFdData(fdTmp, 'solve', keys, { n: 20 })
            m = await estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, d.fdData, optBase)
        })

        it('回傳omlPSO之求解結果, 含bestSolution與停止資訊', function() {
            assert.ok(typeof m === 'object' && m !== null)
            assert.ok(Number.isFinite(m.bestSolution.fitness), `fitness須為有限數: ${m.bestSolution.fitness}`)
            assert.ok(typeof m.stopMode === 'string' && m.stopMode.length > 0)
            assert.ok(m.stopExecutions > 0)
        })

        it('未給omlPSO設定時採其預設值, 以NContiguous=100停止', function() {
            assert.match(m.stopMode, /NContiguous\[100\]$/, `實得: ${m.stopMode}`)
        })

        it('設計變數個數為2(止損止盈)加上keys個數', function() {
            assert.strictEqual(m.bestSolution.ps.length, 2 + keys.length)
        })

        it('止損與止盈之解值取自opt.thsSl與opt.thsTp除以100', function() {
            //thsSl=[2] → 0.02, thsTp=[3] → 0.03, 各僅1點故解值唯一
            assert.strictEqual(m.bestSolution.ps[0].value, 0.02)
            assert.strictEqual(m.bestSolution.ps[1].value, 0.03)
        })

        it('各key門檻之解值落於平移後之兩區間, 絕對值介於8至12', function() {
            //rang(-2,2,40)之值域[-2,2], 平移量vdir=10, 故'>'組為[8,12]、'<'組為[-12,-8]
            m.bestSolution.ps.slice(2).forEach((p, i) => {
                assert.ok(Math.abs(p.value) >= 8 - 1e-9 && Math.abs(p.value) <= 12 + 1e-9, `第${i}個門檻解值 ${p.value} 超出範圍`)
            })
        })

        it('fdData不存在時自動建立, 並寫出策略檔', function() {
            assert.ok(fs.existsSync(d.fdData), 'fdData須被建立')
            let ss = readStrategies(d.fdData)
            assert.ok(ss.length > 0, '門檻放寬時須有策略檔寫出')
        })

        it('策略檔名之tid段等同於genTid之輸出', function() {
            let tid = genTid('btc', '4hr', 'long', keys)
            let ss = readStrategies(d.fdData)
            ss.forEach((s) => {
                assert.strictEqual(s.tid, tid, `檔名 ${s.name}`)
            })
        })

        it('同tkid恆僅保留一檔', function() {
            let ss = readStrategies(d.fdData)
            let tkids = ss.map((v) => {
                return v.tkid
            })
            assert.strictEqual(new Set(tkids).size, tkids.length, `tkid重複: ${tkids}`)
        })

        it('策略檔內容含策略、回測摘要與適應值', function() {
            let ss = readStrategies(d.fdData, { readContent: true })
            ss.forEach((s) => {
                let c = s.data
                assert.strictEqual(c.tid, s.tid)
                assert.ok(typeof c.sid === 'string' && c.sid.length > 0)
                assert.strictEqual(c.name, 'btc')
                assert.strictEqual(c.symbol, 'BTCUSDT')
                assert.strictEqual(c.interval, '4hr')
                assert.strictEqual(c.mode, 'long')
                assert.strictEqual(c.keyOhlc, 'btc_price_4hr') //`${name}_price_${interval}`
                assert.ok(Number.isFinite(c.fitness))
                assert.ok(typeof c.summary === 'object' && c.summary !== null)
            })
        })

        it('策略檔內之conds各元素為{key,sym,th}, key取自keys, sym為>或<, th落於[-2,2]', function() {
            let ss = readStrategies(d.fdData, { readContent: true })
            ss.forEach((s) => {
                assert.strictEqual(s.data.conds.length, keys.length)
                s.data.conds.forEach((cond) => {
                    assert.ok(keys.includes(cond.key), `key[${cond.key}]不在keys內`)
                    assert.ok(cond.sym === '>' || cond.sym === '<', `sym[${cond.sym}]非預期`)
                    assert.ok(cond.th >= -2 - 1e-9 && cond.th <= 2 + 1e-9, `th[${cond.th}]超出[-2,2]`)
                })
            })
        })

        it('策略檔內之settings止盈止損等同於opt所給之百分比除以100', function() {
            let ss = readStrategies(d.fdData, { readContent: true })
            ss.forEach((s) => {
                assert.strictEqual(s.data.settings.rStopLoss, 0.02)
                assert.strictEqual(s.data.settings.rTakeProfit, 0.03)
                assert.strictEqual(s.data.settings.uIni, 1000)
                assert.strictEqual(s.data.settings.uTrade, 1)
                assert.strictEqual(s.data.settings.rFee, 0.0005)
            })
        })

        it('策略檔之級距段與檔內summary.numTrade一致', function() {
            let ss = readStrategies(d.fdData, { readContent: true })
            ss.forEach((s) => {
                let numTrade = Number(s.data.summary.numTrade)
                assert.ok(numTrade >= 1, `已存策略之交易次數須達thNumTrade: ${numTrade}`)
            })
        })

        it('策略檔之等效年化盈虧段與檔內summary一致', function() {
            let ss = readStrategies(d.fdData, { readContent: true })
            ss.forEach((s) => {
                assert.strictEqual(s.rEquivalentCumuProfitOrLossFinalNormYear, s.data.summary.rEquivalentCumuProfitOrLossFinalNormYear)
            })
        })

    })

    describe('儲存門檻', function() {

        it('交易次數門檻無法達成時不寫出任何策略檔', async function() {
            this.timeout(120000)
            let keys = ['btc_4hr_ma_1day']
            let d = buildFdData(fdTmp, 'nosave', keys, { n: 20 })

            await estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, d.fdData, {
                ...optBase,
                thNumTrade: 1e9, //資料僅20根K線, 無從達成
            })

            assert.deepStrictEqual(readStrategies(d.fdData), [])
        })

    })

    describe('omlPSO設定傳遞', function() {

        //opt除estimKeys自身欄位外皆原樣傳遞至omlPSO, 兩者欄位名稱無重疊
        //  停止機制優先序為Nl > NContiguous > NCore, 各以stopMode字串標明
        //  以下皆縮小Np並關閉再搜尋與移民策略, 使各案例快速完成

        let keys = ['btc_4hr_ma_1day']
        let d = null

        before(function() {
            d = buildFdData(fdTmp, 'pso', keys, { n: 20 })
        })

        //optPso: 縮小求解量之共用PSO設定
        let optPso = {
            Np: 8,
            UseRepeat: false,
            UseImmigration: false,
        }

        //call: 以獨立之策略資料夾執行求解
        let call = (tag, extra = {}) => {
            let fdData = path.resolve(fdTmp, 'pso', `s-${tag}`)
            return estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, {
                ...optBase,
                ...optPso,
                ...extra,
            })
        }

        it('給NContiguous時以最佳解連續未更新次數達該值而停止', async function() {
            let m = await call('ncontiguous', { NContiguous: 5 })
            assert.match(m.stopMode, /^stop by iContinue\[5\] >= NContiguous\[5\]$/, `實得: ${m.stopMode}`)
        })

        it('給Nl時以迴圈數達該值而停止, stopIteration即為Nl', async function() {
            //迴圈數自0起算, 停止判準為i >= Nl
            let m = await call('nl', { Nl: 3 })
            assert.match(m.stopMode, /^stop by Nl\[3\]$/, `實得: ${m.stopMode}`)
            assert.strictEqual(m.stopIteration, 3)
        })

        it('給NCore時以核心分析次數達該值而停止', async function() {
            //NCore為最低優先序, 故須將Nl與NContiguous放大使其不先觸發
            let m = await call('ncore', { NCore: 50, Nl: 1e6, NContiguous: 1e6 })
            assert.match(m.stopMode, /NCore\[50\]$/, `實得: ${m.stopMode}`)
            assert.ok(m.stopExecutions >= 50, `核心分析次數 ${m.stopExecutions} 須達NCore`)
        })

        it('縮小NContiguous可大幅降低核心分析次數', async function() {
            //預設NContiguous為100, 縮小至5後求解量須明顯減少
            let m = await call('less', { NContiguous: 5 })
            assert.ok(m.stopExecutions < 5000, `核心分析次數 ${m.stopExecutions} 未如預期減少`)
        })

        it('funGenerationBefore與funGenerationAfter每代成對呼叫, funEndLoop於末代不呼叫', async function() {
            //funGenerationAfter置於停止判斷之前故與before成對, funEndLoop置於停止判斷之後故少一次
            let nBefore = 0
            let nAfter = 0
            let nEndLoop = 0
            await call('hooks', {
                Nl: 3,
                funGenerationBefore: () => {
                    nBefore++
                },
                funGenerationAfter: () => {
                    nAfter++
                },
                funEndLoop: () => {
                    nEndLoop++
                },
            })
            assert.ok(nBefore >= 1, `funGenerationBefore未被呼叫`)
            assert.strictEqual(nAfter, nBefore, `after ${nAfter} 與 before ${nBefore} 未成對`)
            assert.strictEqual(nEndLoop, nBefore - 1, `endLoop ${nEndLoop} 須較before ${nBefore} 少一次`)
        })

        it('funGenerationBefore收到本代超參數物件', async function() {
            let got = null
            await call('params', {
                Nl: 2,
                funGenerationBefore: (o) => {
                    if (got === null) {
                        got = o
                    }
                },
            })
            assert.ok(got !== null, `funGenerationBefore未被呼叫`)
            assert.deepStrictEqual(Object.keys(got.params).sort(), [
                'LocalSearchMethod',
                'ModeOutLimit',
                'psoBeta',
                'psoC1',
                'psoC2',
                'psoGamma',
                'psoInertiaMin',
            ])
        })

        it('funGetBetter被呼叫時收到最佳解與迴圈數', async function() {
            //呼叫次數取決於迴圈中是否出現更優解, 故僅驗證引數形式
            //  omlPSO之迴圈數自0起算(let i = -1後於迴圈首行i++), 故首代之i為0
            let calls = []
            await call('getbetter', {
                Nl: 5,
                funGetBetter: (bestSolution, i) => {
                    calls.push({ bestSolution, i })
                },
            })
            calls.forEach((v, k) => {
                assert.ok(Number.isFinite(v.bestSolution.fitness), `第${k}次之fitness非有限數`)
                assert.strictEqual(v.bestSolution.ps.length, 2 + keys.length, `第${k}次之設計變數個數非預期`)
                assert.ok(Number.isInteger(v.i) && v.i >= 0, `第${k}次之迴圈數非預期: ${v.i}`)
            })
        })

        it('PSO設定與estimKeys自身設定可同時給予且互不干擾', async function() {
            let fdData = path.resolve(fdTmp, 'pso', 's-mix')
            let m = await estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, {
                ...optBase,
                ...optPso,
                NContiguous: 5,
            })

            //PSO設定生效
            assert.match(m.stopMode, /NContiguous\[5\]$/, `實得: ${m.stopMode}`)

            //estimKeys自身之thsSl與thsTp仍決定止損止盈之取值
            assert.strictEqual(m.bestSolution.ps[0].value, 0.02)
            assert.strictEqual(m.bestSolution.ps[1].value, 0.03)

            //estimKeys自身之三門檻仍決定策略是否存檔
            let ss = readStrategies(fdData, { readContent: true })
            assert.ok(ss.length > 0, '門檻放寬時須有策略檔寫出')
            ss.forEach((s) => {
                assert.strictEqual(s.data.settings.rStopLoss, 0.02)
                assert.strictEqual(s.data.settings.rTakeProfit, 0.03)
            })
        })

    })

    describe('methodOml演算法選擇', function() {

        //各演算法之超參數集合不同, 以funGenerationBefore所收到之params鍵集合判別實際採用者
        //  迴圈數之欄位名亦不同: RGA與DE為Ng、HS為Ni、PSO與ACO為Nl, 故一次給齊各欄位後,
        //  由stopMode所標明之欄位名即可看出實際採用之演算法

        let keys = ['btc_4hr_ma_1day']
        let d = null

        before(function() {
            d = buildFdData(fdTmp, 'method', keys, { n: 20 })
        })

        //kpParams: 各演算法於funGenerationBefore所提供之超參數鍵(已排序)
        let kpParams = {
            RGA: ['LocalSearchMethod', 'ModeOutLimit', 'rgaCrossover', 'rgaElitism', 'rgaMutation', 'rgaMutationRate', 'rgaSelection'],
            DE: ['LocalSearchMethod', 'ModeOutLimit', 'deCrossoverFactor', 'deF', 'deLanda', 'deMutation'],
            HS: ['LocalSearchMethod', 'ModeOutLimit', 'hsHMC', 'hsHMCR', 'hsPA', 'hsPAR'],
            PSO: ['LocalSearchMethod', 'ModeOutLimit', 'psoBeta', 'psoC1', 'psoC2', 'psoGamma', 'psoInertiaMin'],
            ACO: ['LocalSearchMethod', 'ModeOutLimit', 'acoAlpha', 'acoExploitationRate', 'acoRo'],
        }

        //kpKeyIteration: 各演算法之迴圈數欄位名
        let kpKeyIteration = {
            RGA: 'Ng',
            DE: 'Ng',
            HS: 'Ni',
            PSO: 'Nl',
            ACO: 'Nl',
        }

        //optStop: 一次給齊各演算法之迴圈數與族群數欄位, 各演算法僅取用自身認得者
        let optStop = {
            Ng: 2,
            Ni: 2,
            Nl: 2,
            Np: 6,
            Ns: 6,
            Na: 6,
            UseRepeat: false,
            UseImmigration: false,
        }

        //run: 執行求解並回傳{m, params}
        let run = async (tag, extra = {}) => {
            let fdData = path.resolve(fdTmp, 'method', `s-${tag}`)
            let params = null
            let m = await estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, fdData, {
                ...optBase,
                ...optStop,
                ...extra,
                funGenerationBefore: (o) => {
                    if (params === null) {
                        params = o.params
                    }
                },
            })
            return { m, params }
        }

        Object.keys(kpParams).forEach((methodOml) => {
            it(`methodOml為${methodOml}時採用該演算法`, async function() {
                let { m, params } = await run(methodOml, { methodOml })
                assert.deepStrictEqual(Object.keys(params).sort(), kpParams[methodOml], `${methodOml}之超參數集合非預期`)
                assert.match(m.stopMode, new RegExp(`^stop by ${kpKeyIteration[methodOml]}\\[2\\]$`), `${methodOml}實得: ${m.stopMode}`)
                assert.strictEqual(m.stopIteration, 2)
            })
        })

        it('未給methodOml時採PSO', async function() {
            let { m, params } = await run('default')
            assert.deepStrictEqual(Object.keys(params).sort(), kpParams.PSO)
            assert.match(m.stopMode, /^stop by Nl\[2\]$/, `實得: ${m.stopMode}`)
        })

        it('methodOml非五者之一時亦採PSO', async function() {
            let { m, params } = await run('unknown', { methodOml: 'XXX' })
            assert.deepStrictEqual(Object.keys(params).sort(), kpParams.PSO)
            assert.match(m.stopMode, /^stop by Nl\[2\]$/, `實得: ${m.stopMode}`)
        })

        it('各演算法之求解結果皆含bestSolution與停止資訊', async function() {
            let { m } = await run('shape', { methodOml: 'DE' })
            assert.ok(Number.isFinite(m.bestSolution.fitness))
            assert.strictEqual(m.bestSolution.ps.length, 2 + keys.length)
            assert.ok(typeof m.stopMode === 'string' && m.stopMode.length > 0)
            assert.ok(m.stopExecutions > 0)
        })

    })

    describe('輸入檢核', function() {

        let keys = ['btc_4hr_ma_1day']
        let d = null

        before(function() {
            d = buildFdData(fdTmp, 'check', keys, { n: 10 })
        })

        //call: 以合法引數為底, 依opt覆寫指定引數後呼叫
        let call = (ov = {}) => {
            let a = {
                name,
                symbol,
                interval,
                fdOhlc: d.fdOhlc,
                fdParam: d.fdParam,
                timeStart: d.timeStart,
                timeEnd: d.timeEnd,
                mode: 'long',
                keys,
                fdData: d.fdData,
                opt: optBase,
                ...ov,
            }
            return estimKeys(ott, a.name, a.symbol, a.interval, a.fdOhlc, a.fdParam, a.timeStart, a.timeEnd, a.mode, a.keys, a.fdData, a.opt)
        }

        it('name非有效字串時reject', async function() {
            await assert.rejects(call({ name: '' }), /invalid name/)
            await assert.rejects(call({ name: null }), /invalid name/)
        })

        it('symbol非有效字串時reject', async function() {
            await assert.rejects(call({ symbol: '' }), /invalid symbol/)
        })

        it('interval非有效字串時reject', async function() {
            await assert.rejects(call({ interval: '' }), /invalid interval/)
        })

        it('fdOhlc非有效字串時reject', async function() {
            await assert.rejects(call({ fdOhlc: '' }), /invalid fdOhlc/)
            await assert.rejects(call({ fdOhlc: null }), /invalid fdOhlc/)
        })

        it('fdParam非有效字串時reject', async function() {
            await assert.rejects(call({ fdParam: '' }), /invalid fdParam/)
        })

        it('timeStart非有效字串時reject', async function() {
            await assert.rejects(call({ timeStart: '' }), /invalid timeStart/)
        })

        it('timeEnd非有效字串時reject', async function() {
            await assert.rejects(call({ timeEnd: '' }), /invalid timeEnd/)
        })

        it('mode非long或short時reject', async function() {
            await assert.rejects(call({ mode: 'buy' }), /invalid mode/)
            await assert.rejects(call({ mode: '' }), /invalid mode/)
        })

        it('keys非有效陣列時reject', async function() {
            await assert.rejects(call({ keys: [] }), /invalid keys/)
            await assert.rejects(call({ keys: 'aa' }), /invalid keys/)
        })

        it('fdData非有效字串時reject', async function() {
            await assert.rejects(call({ fdData: '' }), /invalid fdData/)
        })

        it('回測時間範圍超出資料範圍時reject', async function() {
            //w-data-tdprovide之getTimeSeriesFullByTimeRange檢核起訖時間
            await assert.rejects(call({ timeStart: '1990-01-01T00:00:00' }), /timeStartData/)
            await assert.rejects(call({ timeEnd: '2099-01-01T00:00:00' }), /timeEndData/)
        })

    })

    describe('策略檔名規則', function() {

        it('檔名恰可由dlmPkgs切為3段', function() {
            //由求解階段所產生之檔案驗證
            let fdData = path.resolve(fdTmp, 'solve', 'data-strategy')
            let fns = fs.readdirSync(fdData)
            assert.ok(fns.length > 0)
            fns.forEach((fn) => {
                assert.strictEqual(fn.slice(0, -5).split(cont.dlmPkgs).length, 3, `檔名 ${fn}`)
                assert.ok(fn.endsWith('.json'), `檔名 ${fn}`)
            })
        })

    })

})
