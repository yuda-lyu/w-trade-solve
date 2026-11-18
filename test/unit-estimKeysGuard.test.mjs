import assert from 'assert'
import fs from 'fs'
import path from 'path'
import round from 'lodash-es/round.js'
import estimKeys from '../src/estimKeys.mjs'
import estimFinder from '../src/estimFinder.mjs'
import readStrategies from '../src/readStrategies.mjs'
import genTid from '../src/genTid.mjs'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import ott from '../src/ott.mjs'
import { buildFdData, name, symbol, interval } from './unit-setup.mjs'


//規格來源: sgud/rule/rulebook.md 之 WS-TP-01、WS-TP-02、WS-KN-02 與 src/estimKeys.mjs 之 JSDoc
//  WS-TP-01 opt.thsTp、opt.thsSl(止盈止損候選, 百分比): null或undefined為未給(採1至10); 給予者須為非空陣列, 各元素為有效數字(數字或數字字串, 通過即轉為數值使用與落地),
//           且除以100取至小數3位後須大於0(即不得為0、負數或小於0.05); 無效即throw `invalid opt.thsTp: must be a non-empty array of positive numbers that stay positive after rounding`(thsSl同式, 不含輸入值), 於建立fdData與載入數據之前
//  WS-TP-02 opt.thNumTrade、opt.thRWin、opt.thREquivalentCumuProfitOrLossFinalNormYear為入庫之篩選門檻, 無效時改用預設(跨套件規格K3, 不影響下單金額), 不throw
//  WS-KN-02 同tkid覆寫前, 舊檔之keys(為陣列者)須與本次相同, 不同即throw hash collision(tid由keys縮寫而得, 縮寫後相同而keys不同者其tkid、檔名、name、interval皆同); keys相同者行為不變; 舊檔無keys者不比對


let fdTmp = path.resolve('./test/_tmp/estimKeysGuard')

//optQuick, 三門檻放寬且縮小求解量(不含thsTp與thsSl, 各案自行給予)
let optQuick = {
    thNumTrade: 1,
    thRWin: 0,
    thREquivalentCumuProfitOrLossFinalNormYear: -1e9,
    Np: 8,
    NContiguous: 5,
    UseRepeat: false,
    UseImmigration: false,
}

//K1、K2: 縮寫後之tid相同而keys不同(genTid剔除`${name}_`與`${interval}_`樣式); K3另一個key(供順序不同之案)
let K1 = 'btc_4hr_ma_1day'
let K2 = 'ma_1day'
let K3 = 'btc_4hr_rsi'
let K4 = 'rsi' //縮寫後與K3相同之tid
let keys = [K1]
let d = null

//stub, 替身核心(交易次數固定故tkid固定, 同一資料夾內恆為同一檔), 以rEq指定最終等效年化盈虧, nt指定交易次數
let stub = (rEq, nt = 30) => async () => ({ summary: { numTrade: nt, rWin: '60.00%', uEquityFinal: 1200, rEquivalentCumuProfitOrLossFinalNormYear: rEq } })

//MSG, 無效時之訊息
let MSG_TP = 'invalid opt.thsTp: must be a non-empty array of positive numbers that stay positive after rounding'
let MSG_SL = 'invalid opt.thsSl: must be a non-empty array of positive numbers that stay positive after rounding'

//DEF, 預設候選
let DEF = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

//runIn, 於指定策略資料夾求解並讀回策略檔; seen記錄各次評估所見之settings
let runIn = async (fdData, extra = {}, ks = keys, dd = d) => {
    let seen = []
    let core = async ({ strategy }) => {
        seen.push({ ...strategy.settings })
        return { summary: { numTrade: 30, rWin: '60.00%', uEquityFinal: 1200, rEquivalentCumuProfitOrLossFinalNormYear: '20.00%' } }
    }
    let m = await estimKeys(ott, name, symbol, interval, dd.fdOhlc, dd.fdParam, dd.timeStart, dd.timeEnd, 'long', ks, fdData, { ...optQuick, funRunStrategyCustom: core, ...extra })
    let ss = fs.existsSync(fdData) ? readStrategies(fdData, { readContent: true }) : []
    return { m, ss, seen }
}


describe('estimKeys之止盈止損候選檢測與覆寫前keys比對', function() {

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        d = buildFdData(fdTmp, 'data', [K1, K2, K3, K4], { n: 30 })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('WS-TP-01 opt.thsTp、opt.thsSl之檢測與轉換', function() {

        it('未給、null、undefined時採1至10(同既有): solve記錄預設候選, 各候選之止盈止損皆為0.01至0.1', async function() {
            for (let [tag, extra] of [['none', {}], ['null', { thsTp: null, thsSl: null }], ['undef', { thsTp: undefined, thsSl: undefined }]]) {
                let { ss, seen } = await runIn(path.resolve(fdTmp, `def-${tag}`), extra)
                assert.ok(ss.length > 0, tag)
                assert.deepStrictEqual(ss[0].data.solve.thsTp, DEF, tag)
                assert.deepStrictEqual(ss[0].data.solve.thsSl, DEF, tag)
                let okVals = DEF.map((v) => round(v / 100, 3))
                assert.ok(seen.length > 0 && seen.every((st) => okVals.includes(st.rTakeProfit) && okVals.includes(st.rStopLoss)), tag)
            }
        })

        it('有效候選: 數字字串轉為數值後使用與落地(solve與settings), 不改呼叫端之陣列, 去頭尾空白之數字字串可用', async function() {
            let tp = Object.freeze(['3', ' 4.5 ', 5, '0.05'])
            let sl = Object.freeze([2, '2.5'])
            let { ss, seen } = await runIn(path.resolve(fdTmp, 'valid'), { thsTp: tp, thsSl: sl })
            assert.ok(ss.length > 0)
            assert.deepStrictEqual(ss[0].data.solve.thsTp, [3, 4.5, 5, 0.05]) //K4: 落地為數值
            assert.deepStrictEqual(ss[0].data.solve.thsSl, [2, 2.5])
            let okTp = [3, 4.5, 5, 0.05].map((v) => round(v / 100, 3))
            let okSl = [2, 2.5].map((v) => round(v / 100, 3))
            assert.ok(seen.length > 0 && seen.every((st) => okTp.includes(st.rTakeProfit) && okSl.includes(st.rStopLoss)))
            assert.deepStrictEqual([...tp], ['3', ' 4.5 ', 5, '0.05']) //呼叫端之陣列不變
        })

        it('取捨後之邊界: 0.05(取至小數3位為0.001)可用, 0.04999(取捨後為0)無效(鑑別前提: 兩者取捨後之值確實一正一零)', async function() {
            assert.ok(round(0.05 / 100, 3) > 0) //前提
            assert.strictEqual(round(0.04999 / 100, 3), 0) //前提
            let { ss } = await runIn(path.resolve(fdTmp, 'edge'), { thsTp: [0.05], thsSl: ['0.05'] })
            assert.ok(ss.length > 0)
            assert.strictEqual(ss[0].data.settings.rTakeProfit, 0.001)
            for (let [k, extra, msg] of [['tp', { thsTp: [0.04999] }, MSG_TP], ['sl', { thsSl: ['0.04999'] }, MSG_SL], ['tp-mix', { thsTp: [5, 0.04999] }, MSG_TP]]) {
                await assert.rejects(runIn(path.resolve(fdTmp, `edge-${k}`), extra), (err) => err.message === msg, k)
            }
        })

        it('無效時reject(訊息固定、不含輸入值), 不建立fdData、不載入數據(數據資料夾不存在亦先得此錯誤)', async function() {
            let sparse = [3, 4]
            sparse.length = 3
            let bad = [
                'abc', 5, {}, true, '', [], //非陣列、空陣列
                [0], [-1], ['-3'], [0, 3], [3, 0], ['0'], [-0], //0與負數
                [NaN], [Infinity], [-Infinity], ['abc'], [''], ['0x10'], ['1e999'], [true], [null], [undefined], [[3]], [{}], [new Number(3)], [10n], //元素非有效數字
                [0.04], ['0.04'], [0.049], [1e-9], ['1e-400'], //取至小數3位後為0(或下溢)
                sparse,
            ]
            for (let [msgTag, key, msg] of [['tp', 'thsTp', MSG_TP], ['sl', 'thsSl', MSG_SL]]) {
                for (let [k, v] of bad.entries()) {
                    let fdData = path.resolve(fdTmp, `bad-${msgTag}-${k}`)
                    await assert.rejects(estimKeys(ott, name, symbol, interval, path.resolve(fdTmp, 'no-ohlc'), path.resolve(fdTmp, 'no-param'), d.timeStart, d.timeEnd, 'long', keys, fdData, { ...optQuick, [key]: v }), (err) => {
                        assert.strictEqual(err.message, msg, `${key} case ${k}`)
                        return true
                    })
                    assert.ok(!fs.existsSync(fdData), `${key} case ${k} 不得建立fdData`)
                }
            }
            //兩者皆給而其一無效: 指出無效者; 兩者皆無效時先報thsTp
            await assert.rejects(estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, path.resolve(fdTmp, 'bad-mix1'), { ...optQuick, thsTp: [3], thsSl: [0] }), (err) => err.message === MSG_SL)
            await assert.rejects(estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', keys, path.resolve(fdTmp, 'bad-mix2'), { ...optQuick, thsTp: [0], thsSl: [0] }), (err) => err.message === MSG_TP)
            assert.ok(!fs.existsSync(path.resolve(fdTmp, 'bad-mix1')) && !fs.existsSync(path.resolve(fdTmp, 'bad-mix2')))
        })

        it('經estimFinder原樣傳遞: 無效之thsTp、thsSl同樣reject且不建立fdData; 有效者落地', async function() {
            let call = (fdData, extra) => estimFinder(ott, name, symbol, interval, d.fdOhlc, d.fdParam, fdData, {
                ...optQuick,
                mode: 'long',
                comps: '1,0,0',
                timeStart: d.timeStart,
                timeEnd: d.timeEnd,
                funRunStrategyCustom: stub('20.00%'),
                ...extra,
            })
            for (let [k, extra, msg] of [['tp', { thsTp: [0] }, MSG_TP], ['sl', { thsSl: [-1] }, MSG_SL]]) {
                let fdData = path.resolve(fdTmp, `f-bad-${k}`)
                await assert.rejects(call(fdData, extra), (err) => err.message === msg, k)
                assert.ok(!fs.existsSync(fdData), k)
            }
            let fdOk = path.resolve(fdTmp, 'f-ok')
            await call(fdOk, { thsTp: ['3'], thsSl: [2] })
            let ss = readStrategies(fdOk, { readContent: true })
            assert.strictEqual(ss.length, 1)
            assert.deepStrictEqual(ss[0].data.solve.thsTp, [3])
        })

    })

    describe('WS-TP-02 入庫之篩選門檻維持無效用預設(K3)', function() {

        it('thNumTrade、thRWin、thREquivalentCumuProfitOrLossFinalNormYear無效時不throw, 採預設1、0.5、0.15並記於solve', async function() {
            for (let [k, v] of [['str', 'abc'], ['obj', {}], ['arr', []], ['bool', true], ['nul', null], ['undef', undefined]]) {
                let { ss } = await runIn(path.resolve(fdTmp, `k3-${k}`), { thsTp: [3], thsSl: [2], thNumTrade: v, thRWin: v, thREquivalentCumuProfitOrLossFinalNormYear: v })
                assert.strictEqual(ss.length, 1, k) //替身核心之摘要: 30次、勝率60%、等效年化20%, 皆過預設門檻
                assert.strictEqual(ss[0].data.solve.thNumTrade, 1, k)
                assert.strictEqual(ss[0].data.solve.thRWin, 0.5, k)
                assert.strictEqual(ss[0].data.solve.thREquivalentCumuProfitOrLossFinalNormYear, 0.15, k)
            }
        })

    })

    describe('WS-KN-02 覆寫前比對舊檔之keys', function() {

        let call = (fdData, ks, rEq, extra = {}) => estimKeys(ott, name, symbol, interval, d.fdOhlc, d.fdParam, d.timeStart, d.timeEnd, 'long', ks, fdData, { ...optQuick, thsTp: [3], thsSl: [2], funRunStrategyCustom: stub(rEq), ...extra })
        let fpOf = (fdData, ks, nt = 30) => path.resolve(fdData, genStrategyFileName(name, interval, 'long', ks, {}, { numTrade: nt }))

        it('鑑別前提: K1與K2之tid、tkid、檔名、name、interval皆同而keys不同', function() {
            assert.strictEqual(genTid(name, interval, 'long', [K1]), genTid(name, interval, 'long', [K2]))
            assert.strictEqual(genStrategyFileName(name, interval, 'long', [K1], {}, { numTrade: 30 }), genStrategyFileName(name, interval, 'long', [K2], {}, { numTrade: 30 }))
            assert.notDeepStrictEqual([K1], [K2])
        })

        it('keys不同(同tkid、同檔名、同name與interval)時throw hash collision且既有檔逐位不變, 即使本次等效年化較佳', async function() {
            let fdData = path.resolve(fdTmp, 'kn1')
            await call(fdData, [K1], '20.00%')
            let fp = fpOf(fdData, [K1])
            assert.ok(fs.existsSync(fp))
            let before = fs.readFileSync(fp, 'utf8')
            let old = JSON.parse(before)
            assert.deepStrictEqual(old.keys, [K1])
            assert.strictEqual(old.tkid, `${genTid(name, interval, 'long', [K2])}:12`) //前提: 舊檔之tkid即本次K2所得者
            assert.strictEqual(old.name, name)
            assert.strictEqual(old.interval, interval)
            await assert.rejects(call(fdData, [K2], '99.00%'), (err) => {
                assert.match(err.message, /^hash collision: fnStrategy\[long_12_[0-9a-f]{16}\.json\], keysOld differs from keys, tkid\[/)
                assert.ok(!err.message.includes(K1), '訊息不帶keys之值(tkid內為縮寫後之tid, 不含原key)')
                return true
            })
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), before) //既有檔逐位不變(無此規則時較佳者會覆寫為keys=[K2])
            assert.strictEqual(fs.readdirSync(fdData).length, 1)
        })

        it('keys相同時行為不變: 較佳者覆寫、較差者不寫', async function() {
            let fdData = path.resolve(fdTmp, 'kn2')
            for (let [rEq, exp] of [['20.00%', '20.00%'], ['30.00%', '30.00%'], ['10.00%', '30.00%']]) {
                await call(fdData, [K1], rEq)
                let ss = readStrategies(fdData, { readContent: true })
                assert.strictEqual(ss.length, 1)
                assert.strictEqual(ss[0].data.summary.rEquivalentCumuProfitOrLossFinalNormYear, exp, rEq)
                assert.deepStrictEqual(ss[0].data.keys, [K1])
            }
        })

        it('keys之比對先於口徑之比對: 舊檔與本次之基礎單位口徑不同而keys亦不同者仍throw(不因口徑不同而覆寫); 同keys而口徑不同者照舊以本次覆寫(鑑別前提)', async function() {
            let fdData = path.resolve(fdTmp, 'kn6')
            await call(fdData, [K1], '20.00%', { unit: { rule: { stepSize: 0.001, minQty: 0.001, minNotional: 20 } } })
            let fp = fpOf(fdData, [K1])
            let before = fs.readFileSync(fp, 'utf8')
            await assert.rejects(call(fdData, [K2], '99.00%'), (err) => /^hash collision: /.test(err.message)) //本次未給unit(口徑不同), keys亦不同
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), before)
            //前提: 同keys、口徑不同時以本次覆寫(即使較差), 故上列之throw來自keys之比對而非他因
            await call(fdData, [K1], '10.00%')
            let ss = readStrategies(fdData, { readContent: true })
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '10.00%')
            assert.ok(!('unit' in ss[0].data.settings))
        })

        it('keys為多個時逐一比對: 只有第二個key不同(縮寫後之tid、tkid、檔名皆同)亦throw, 既有檔不變', async function() {
            assert.strictEqual(genTid(name, interval, 'long', [K1, K3]), genTid(name, interval, 'long', [K1, K4])) //前提: 首個key相同、第二個key不同而tid相同
            let fdData = path.resolve(fdTmp, 'kn7')
            await call(fdData, [K1, K3], '20.00%')
            let fp = fpOf(fdData, [K1, K3])
            assert.strictEqual(fp, fpOf(fdData, [K1, K4])) //前提: 同檔名
            let before = fs.readFileSync(fp, 'utf8')
            await assert.rejects(call(fdData, [K1, K4], '99.00%'), (err) => /^hash collision: /.test(err.message))
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), before)
        })

        it('keys之順序不同者tid與檔名本即不同, 兩檔並存不報錯(未碰撞時行為不變)', async function() {
            let fdData = path.resolve(fdTmp, 'kn3')
            await call(fdData, [K1, K3], '20.00%')
            await call(fdData, [K3, K1], '20.00%')
            assert.strictEqual(readStrategies(fdData, { readContent: true }).length, 2)
        })

        it('舊檔無keys(缺欄或非陣列)者不比對, 照舊以等效年化比較(不比對之寬鬆處理同tkid、name、interval各欄)', async function() {
            for (let [tag, mut] of [['absent', (o) => { delete o.keys }], ['string', (o) => { o.keys = 'x' }], ['null', (o) => { o.keys = null }]]) {
                let fdData = path.resolve(fdTmp, `kn4-${tag}`)
                await call(fdData, [K1], '20.00%')
                let fp = fpOf(fdData, [K1])
                let o = JSON.parse(fs.readFileSync(fp, 'utf8'))
                mut(o)
                fs.writeFileSync(fp, JSON.stringify(o), 'utf8')
                await call(fdData, [K2], '99.00%') //不throw, 較佳者覆寫
                let ss = readStrategies(fdData, { readContent: true })
                assert.strictEqual(ss.length, 1, tag)
                assert.strictEqual(ss[0].data.summary.rEquivalentCumuProfitOrLossFinalNormYear, '99.00%', tag)
                assert.deepStrictEqual(ss[0].data.keys, [K2], tag)
            }
        })

        it('存檔前重跑使檔名改變後之重檢(第二處checkSavable)亦比對keys: 重跑之檔名已有keys不同之舊檔即throw, 舊檔不變', async function() {
            let fdData = path.resolve(fdTmp, 'kn5')
            //既有: K1於交易次數30(級距12)之檔
            await call(fdData, [K1], '20.00%')
            let fp = fpOf(fdData, [K1], 30)
            let before = fs.readFileSync(fp, 'utf8')
            //本次K2: 評估核心回2次(級距1, 其檔不存在, 通過第一次檢查), 存檔前重跑回30次(級距12, 即上述既有檔之檔名)
            await assert.rejects(call(fdData, [K2], '99.00%', {
                funRunStrategyCustom: stub('99.00%', 2),
                useRunStrategyBeforeSave: true,
                funRunStrategyCustomBeforeSave: stub('99.00%', 30),
            }), (err) => /^hash collision: fnStrategy\[long_12_[0-9a-f]{16}\.json\], keysOld differs from keys/.test(err.message))
            assert.strictEqual(fs.readFileSync(fp, 'utf8'), before)
            assert.strictEqual(fs.readdirSync(fdData).length, 1)
        })

    })

})
