import assert from 'assert'
import fs from 'fs'
import estimPicks from '../src/estimPicks.mjs'
import ott from '../src/ott.mjs'
import { buildFdTmp, buildFdData, buildSt, keySettings } from './unit-setup.mjs'


//規格來源: src/estimPicks.mjs
//  estimPicks(ott, st, fdOhlc, fdParam, timeStart, timeEnd, mode, funPickKeys, fdData, opt):
//    由fdParam列舉全部指標key後分3類: 開頭為'index_'者為keysIndex, 含'_vbs_'者為keysVolumn, 其餘為keysNorm
//    分類後各類依序經opt.funFilterKeysNorm、opt.funFilterKeysIndex、opt.funFilterKeysVolumn過濾(皆await)
//    再呼叫funPickKeys({keysNorm,keysIndex,keysVolumn})取得keys, 最後交由estimKeys求解
//  觀察方式: 以funPickKeys回傳空陣列, 使estimKeys於keys檢核即reject, 藉此於不進入求解之情況下驗證分類與過濾


let fdTmp = buildFdTmp('estimPicks')


let st = buildSt()


//keysParam: 涵蓋3類, index_開頭為指數類, 含_vbs_為成交量類, 其餘為一般類
let keyNormA = 'btc_4hr_ma_1day'
let keyNormB = 'btc_4hr_rsi'
let keyIndex = 'index_fear_greed'
let keyVolumn = 'btc_4hr_vbs_ratio'
let keysParam = [keyNormA, keyNormB, keyIndex, keyVolumn]


let d = null


//call: 以合法引數為底, 依ov覆寫指定引數後呼叫
let call = (ov = {}) => {
    let a = {
        fdOhlc: d.fdOhlc,
        fdParam: d.fdParam,
        timeStart: d.timeStart,
        timeEnd: d.timeEnd,
        mode: 'long',
        funPickKeys: () => {
            return []
        },
        fdData: d.fdData,
        opt: { keySettings },
        ...ov,
    }
    return estimPicks(ott, st, a.fdOhlc, a.fdParam, a.timeStart, a.timeEnd, a.mode, a.funPickKeys, a.fdData, a.opt)
}


describe('estimPicks', function() {

    before(function() {
        d = buildFdData(fdTmp, 'picks', keysParam, { n: 10 })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('指標key分類', function() {

        it('依名稱分為keysNorm、keysIndex與keysVolumn三類', async function() {
            let got = null
            await assert.rejects(call({
                funPickKeys: (o) => {
                    got = o
                    return []
                },
            }), /invalid keys/)

            assert.deepStrictEqual(got.keysNorm.sort(), [keyNormA, keyNormB].sort())
            assert.deepStrictEqual(got.keysIndex, [keyIndex])
            assert.deepStrictEqual(got.keysVolumn, [keyVolumn])
        })

        it('分類互斥且涵蓋fdParam內全部key', async function() {
            let got = null
            await assert.rejects(call({
                funPickKeys: (o) => {
                    got = o
                    return []
                },
            }), /invalid keys/)

            let all = [...got.keysNorm, ...got.keysIndex, ...got.keysVolumn]
            assert.strictEqual(all.length, keysParam.length)
            assert.deepStrictEqual(all.sort(), [...keysParam].sort())
        })

        it('僅開頭為index_者歸為指數類, 名稱中段含index_者仍為一般類', async function() {
            let dd = buildFdData(fdTmp, 'cls-index', ['btc_index_rsi', 'index_rsi'], { n: 10 })
            let got = null
            await assert.rejects(estimPicks(ott, st, dd.fdOhlc, dd.fdParam, dd.timeStart, dd.timeEnd, 'long', (o) => {
                got = o
                return []
            }, dd.fdData, { keySettings }), /invalid keys/)

            assert.deepStrictEqual(got.keysIndex, ['index_rsi'])
            assert.deepStrictEqual(got.keysNorm, ['btc_index_rsi'])
        })

        it('含_vbs_者優先於一般類, 且index_開頭優先於成交量類', async function() {
            //判斷順序為index_開頭 → 含_vbs_ → 其餘
            let dd = buildFdData(fdTmp, 'cls-vbs', ['index_a_vbs_b', 'btc_vbs_c'], { n: 10 })
            let got = null
            await assert.rejects(estimPicks(ott, st, dd.fdOhlc, dd.fdParam, dd.timeStart, dd.timeEnd, 'long', (o) => {
                got = o
                return []
            }, dd.fdData, { keySettings }), /invalid keys/)

            assert.deepStrictEqual(got.keysIndex, ['index_a_vbs_b'])
            assert.deepStrictEqual(got.keysVolumn, ['btc_vbs_c'])
            assert.deepStrictEqual(got.keysNorm, [])
        })

    })

    describe('過濾函數', function() {

        it('funFilterKeysNorm之回傳取代原keysNorm', async function() {
            let got = null
            await assert.rejects(call({
                opt: {
                    keySettings,
                    funFilterKeysNorm: (ks) => {
                        return ks.filter((v) => {
                            return v === keyNormA
                        })
                    },
                },
                funPickKeys: (o) => {
                    got = o
                    return []
                },
            }), /invalid keys/)

            assert.deepStrictEqual(got.keysNorm, [keyNormA])
        })

        it('funFilterKeysIndex與funFilterKeysVolumn同樣可過濾各自類別', async function() {
            let got = null
            await assert.rejects(call({
                opt: {
                    keySettings,
                    funFilterKeysIndex: () => {
                        return []
                    },
                    funFilterKeysVolumn: () => {
                        return []
                    },
                },
                funPickKeys: (o) => {
                    got = o
                    return []
                },
            }), /invalid keys/)

            assert.deepStrictEqual(got.keysIndex, [])
            assert.deepStrictEqual(got.keysVolumn, [])
            assert.strictEqual(got.keysNorm.length, 2) //未給過濾函數者不受影響
        })

        it('過濾函數為async時亦被await', async function() {
            let got = null
            await assert.rejects(call({
                opt: {
                    keySettings,
                    funFilterKeysNorm: async (ks) => {
                        return ks.slice(0, 1)
                    },
                },
                funPickKeys: (o) => {
                    got = o
                    return []
                },
            }), /invalid keys/)

            assert.strictEqual(got.keysNorm.length, 1)
            assert.ok(typeof got.keysNorm[0] === 'string')
        })

    })

    describe('keys傳遞', function() {

        it('funPickKeys回傳空陣列時, estimKeys於keys檢核reject', async function() {
            await assert.rejects(call({
                funPickKeys: () => {
                    return []
                },
            }), /invalid keys/)
        })

        it('funPickKeys回傳非空陣列時通過keys檢核, 續往後續檢核', async function() {
            //opt未給keySettings, 故停在estimKeys之opt.keySettings檢核, 代表keys已通過
            await assert.rejects(call({
                funPickKeys: () => {
                    return [keyNormA]
                },
                opt: {},
            }), /invalid opt.keySettings/)
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

        it('funPickKeys非函數時reject', async function() {
            await assert.rejects(call({ funPickKeys: null }), /funPickKeys is not a function/)
            await assert.rejects(call({ funPickKeys: 'aa' }), /funPickKeys is not a function/)
        })

        it('fdData非有效字串時reject', async function() {
            await assert.rejects(call({ fdData: '' }), /invalid fdData/)
        })

    })

})
