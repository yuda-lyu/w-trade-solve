import assert from 'assert'
import fs from 'fs'
import estimComps from '../src/estimComps.mjs'
import readStrategies from '../src/readStrategies.mjs'
import genTid from '../src/genTid.mjs'
import ott from '../src/ott.mjs'
import { buildFdTmp, buildFdData, buildSt, keySettings } from './unit-setup.mjs'


//規格來源: src/estimComps.mjs
//  estimComps(ott, st, fdOhlc, fdParam, timeStart, timeEnd, mode, comps, fdData, opt):
//    comps以wsemi sep依','切割(自動trim並剔除空段), 須恰為3段否則throw
//    3段依序為由keysNorm、keysIndex與keysVolumn各隨機挑選之key個數, 為0者不挑
//    各類以wsemi randomIntsNdpRange不重複取樣後, 交由estimPicks與estimKeys
//  觀察方式: 未給opt.keySettings時, keys非空則停在estimKeys之opt.keySettings檢核,
//    keys為空則停在keys檢核, 兩者錯誤訊息不同, 故可驗證各類挑選是否生效


let fdTmp = buildFdTmp('estimComps')


let st = buildSt()


let keyNormA = 'btc_4hr_ma_1day'
let keyNormB = 'btc_4hr_rsi'
let keyIndex = 'index_fear_greed'
let keyVolumn = 'btc_4hr_vbs_ratio'
let keysParam = [keyNormA, keyNormB, keyIndex, keyVolumn]


let d = null


//empty: 過濾函數, 將該類清空
let empty = () => {
    return []
}


//call: 以合法引數為底, 依ov覆寫指定引數後呼叫
let call = (ov = {}) => {
    let a = {
        fdOhlc: d.fdOhlc,
        fdParam: d.fdParam,
        timeStart: d.timeStart,
        timeEnd: d.timeEnd,
        mode: 'long',
        comps: '1,0,0',
        fdData: d.fdData,
        opt: {}, //未給keySettings, 使流程停在estimKeys之opt.keySettings檢核
        ...ov,
    }
    return estimComps(ott, st, a.fdOhlc, a.fdParam, a.timeStart, a.timeEnd, a.mode, a.comps, a.fdData, a.opt)
}


describe('estimComps', function() {

    before(function() {
        d = buildFdData(fdTmp, 'comps', keysParam, { n: 10 })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('comps格式', function() {

        it('非3段時throw', async function() {
            await assert.rejects(call({ comps: '1,2' }), /非預期/)
            await assert.rejects(call({ comps: '1,2,3,4' }), /非預期/)
            await assert.rejects(call({ comps: '1' }), /非預期/)
        })

        it('空段被剔除後不足3段時throw', async function() {
            //wsemi sep會剔除空段, 故'1,,2'僅為2段
            await assert.rejects(call({ comps: '1,,2' }), /非預期/)
        })

        it('各段前後空白被trim, 不影響解析', async function() {
            //' 1 , 0 , 0 '等同'1,0,0', 應挑到1個key而停在keySettings檢核
            await assert.rejects(call({ comps: ' 1 , 0 , 0 ' }), /invalid opt.keySettings/)
        })

        it('comps非有效字串時throw', async function() {
            await assert.rejects(call({ comps: '' }), /invalid comps/)
            await assert.rejects(call({ comps: null }), /invalid comps/)
        })

    })

    describe('各類挑選', function() {

        it('三段皆為0時未挑任何key, estimKeys於keys檢核reject', async function() {
            await assert.rejects(call({ comps: '0,0,0' }), /invalid keys/)
        })

        it('第1段對應一般類: 僅一般類有key時仍可挑出', async function() {
            await assert.rejects(call({
                comps: '1,0,0',
                opt: { funFilterKeysIndex: empty, funFilterKeysVolumn: empty },
            }), /invalid opt.keySettings/)
        })

        it('第2段對應指數類: 僅指數類有key時仍可挑出', async function() {
            await assert.rejects(call({
                comps: '0,1,0',
                opt: { funFilterKeysNorm: empty, funFilterKeysVolumn: empty },
            }), /invalid opt.keySettings/)
        })

        it('第3段對應成交量類: 僅成交量類有key時仍可挑出', async function() {
            await assert.rejects(call({
                comps: '0,0,1',
                opt: { funFilterKeysNorm: empty, funFilterKeysIndex: empty },
            }), /invalid opt.keySettings/)
        })

        it('向已清空之類別挑選時, 取樣範圍上界為-1而throw', async function() {
            //pkn以randomIntsNdpRange(0, size(arr)-1, n)取樣, 空陣列時上界為-1
            await assert.rejects(call({
                comps: '1,0,0',
                opt: { funFilterKeysNorm: empty },
            }), /vstart\[0\] > vend\[-1\]/)
        })

        it('挑選個數超過該類key數時, 取樣結果以該類key數為上限', async function() {
            //一般類僅2個key, 要求4個時仍可挑出(非空)而通過keys檢核
            await assert.rejects(call({
                comps: '4,0,0',
                opt: { funFilterKeysIndex: empty, funFilterKeysVolumn: empty },
            }), /invalid opt.keySettings/)
        })

    })

    describe('端對端求解', function() {

        it('comps=1,0,0且一般類僅1個key時, 產出策略之tid即該key所組成', async function() {
            this.timeout(120000)

            let dd = buildFdData(fdTmp, 'e2e', [keyNormA, keyIndex, keyVolumn], { n: 20 })

            await estimComps(ott, st, dd.fdOhlc, dd.fdParam, dd.timeStart, dd.timeEnd, 'long', '1,0,0', dd.fdData, {
                keySettings,
                thsTp: [3],
                thsSl: [2],
                thNumTrade: 1,
                thRWin: 0,
                thREquivalentCumuProfitOrLossFinalNormYear: -1e9,
            })

            let ss = readStrategies(dd.fdData)
            assert.ok(ss.length > 0, '門檻放寬時須有策略檔寫出')

            let tid = genTid('btc', '4hr', 'long', [keyNormA])
            ss.forEach((s) => {
                assert.strictEqual(s.tid, tid, `檔名 ${s.name}`)
            })
        })

    })

    describe('輸入檢核', function() {

        it('fdOhlc非有效字串時reject', async function() {
            await assert.rejects(call({ fdOhlc: '' }), /invalid fdOhlc/)
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
        })

        it('fdData非有效字串時reject', async function() {
            await assert.rejects(call({ fdData: '' }), /invalid fdData/)
        })

    })

})
