import assert from 'assert'
import fs from 'fs'
import estimFinder from '../src/estimFinder.mjs'
import ott from '../src/ott.mjs'
import { buildFdTmp, buildFdData, buildSt, keySettings } from './unit-setup.mjs'


//規格來源: src/estimFinder.mjs
//  estimFinder(ott, st, fdOhlc, fdParam, fdData, opt):
//    mode未給時由'long'與'short'隨機取一
//    timeStart未給時為'2022-07-01T00:00:00'
//    timeEnd未給時依mode給予: long為'2025-04-08T00:00:00', short為'2025-10-06T00:00:00'
//    comps未給時由18種預設組成隨機取一, 各組成之第1段皆>=2、第2段0-2、第3段0-1
//    最後交由estimComps
//  觀察方式: 測試資料自2022-07-01起算且僅數十根K線, 故預設timeStart恰通過而預設timeEnd必然超出資料範圍,
//    w-data-tdprovide拋出之訊息內含實際使用之timeStart與timeEnd, 藉此驗證預設值


let fdTmp = buildFdTmp('estimFinder')


let st = buildSt()


//keysParam: norm 4個、index 2個、volumn 1個, 使18種預設comps皆可取樣
let keysNorm = ['btc_4hr_ma_1day', 'btc_4hr_ma_2day', 'btc_4hr_rsi', 'btc_4hr_kdj']
let keysIndex = ['index_fear_greed', 'index_dxy']
let keysVolumn = ['btc_4hr_vbs_ratio']
let keysParam = [...keysNorm, ...keysIndex, ...keysVolumn]


//tBase2022: 測試資料起始時間, 恰為estimFinder之預設timeStart
let tBase2022 = Date.UTC(2022, 6, 1)


let d = null


//call: 以合法引數為底, 依ov.opt覆寫opt後呼叫
let call = (ov = {}) => {
    let a = {
        fdOhlc: d.fdOhlc,
        fdParam: d.fdParam,
        fdData: d.fdData,
        opt: { keySettings, comps: '1,0,0' },
        ...ov,
    }
    return estimFinder(ott, st, a.fdOhlc, a.fdParam, a.fdData, a.opt)
}


//catchMsg: 取得reject之錯誤訊息
let catchMsg = async (pm) => {
    try {
        await pm
    }
    catch (err) {
        return err.message
    }
    throw new Error('未如預期reject')
}


describe('estimFinder', function() {

    before(function() {
        d = buildFdData(fdTmp, 'finder', keysParam, { n: 30, base: tBase2022 })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('timeStart預設與覆寫', function() {

        it('未給opt.timeStart時使用2022-07-01T00:00:00', async function() {
            //測試資料恰自2022-07-01起算, 故預設timeStart通過而停在timeEnd檢核
            let msg = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'long' } }))
            assert.match(msg, /timeEnd/, `實得: ${msg}`)
            assert.doesNotMatch(msg, /timeStartData/, `實得: ${msg}`)
        })

        it('資料起始晚於預設timeStart時, 錯誤訊息指出預設之timeStart', async function() {
            let dd = buildFdData(fdTmp, 'ts-late', keysNorm, { n: 10, base: Date.UTC(2023, 0, 1) })
            let msg = await catchMsg(estimFinder(ott, st, dd.fdOhlc, dd.fdParam, dd.fdData, { keySettings, comps: '1,0,0', mode: 'long' }))
            assert.match(msg, /timeStart\[2022-07-01T00:00:00\]/, `實得: ${msg}`)
        })

        it('給予opt.timeStart時以其覆寫預設值', async function() {
            let msg = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'long', timeStart: '1990-01-01T00:00:00' } }))
            assert.match(msg, /timeStart\[1990-01-01T00:00:00\]/, `實得: ${msg}`)
        })

    })

    describe('timeEnd預設與覆寫', function() {

        it('mode為long時預設timeEnd為2025-04-08T00:00:00', async function() {
            let msg = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'long' } }))
            assert.match(msg, /timeEnd\[2025-04-08T00:00:00\]/, `實得: ${msg}`)
        })

        it('mode為short時預設timeEnd為2025-10-06T00:00:00', async function() {
            let msg = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'short' } }))
            assert.match(msg, /timeEnd\[2025-10-06T00:00:00\]/, `實得: ${msg}`)
        })

        it('給予opt.timeEnd時以其覆寫預設值, 不再依mode區分', async function() {
            let msgLong = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'long', timeEnd: '2099-01-01T00:00:00' } }))
            let msgShort = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'short', timeEnd: '2099-01-01T00:00:00' } }))
            assert.match(msgLong, /timeEnd\[2099-01-01T00:00:00\]/, `實得: ${msgLong}`)
            assert.match(msgShort, /timeEnd\[2099-01-01T00:00:00\]/, `實得: ${msgShort}`)
        })

    })

    describe('mode預設', function() {

        it('未給opt.mode時由long與short隨機取一, 兩者於多次呼叫皆出現', async function() {
            this.timeout(60000)

            //以預設timeEnd反推所用之mode: long對應2025-04-08, short對應2025-10-06
            let got = new Set()
            for (let i = 0; i < 40; i++) {
                let msg = await catchMsg(call({ opt: { keySettings, comps: '1,0,0' } }))
                if (msg.indexOf('timeEnd[2025-04-08T00:00:00]') >= 0) {
                    got.add('long')
                }
                else if (msg.indexOf('timeEnd[2025-10-06T00:00:00]') >= 0) {
                    got.add('short')
                }
                else {
                    assert.fail(`非預期之timeEnd: ${msg}`)
                }
            }
            assert.deepStrictEqual([...got].sort(), ['long', 'short'])
        })

        it('給予opt.mode時不再隨機', async function() {
            for (let i = 0; i < 10; i++) {
                let msg = await catchMsg(call({ opt: { keySettings, comps: '1,0,0', mode: 'short' } }))
                assert.match(msg, /timeEnd\[2025-10-06T00:00:00\]/, `實得: ${msg}`)
            }
        })

    })

    describe('comps預設與覆寫', function() {

        it('未給opt.comps時由預設組成隨機取一, 挑出之keys非空', async function() {
            //opt未給keySettings, keys非空時停在estimKeys之opt.keySettings檢核
            for (let i = 0; i < 20; i++) {
                await assert.rejects(call({ opt: {} }), /invalid opt.keySettings/)
            }
        })

        it('給予opt.comps時以其覆寫, 三段皆為0則未挑任何key', async function() {
            await assert.rejects(call({ opt: { keySettings, comps: '0,0,0' } }), /invalid keys/)
        })

        it('給予非3段之opt.comps時throw', async function() {
            await assert.rejects(call({ opt: { keySettings, comps: '1,2' } }), /非預期/)
        })

    })

    describe('輸入檢核', function() {

        it('fdOhlc非有效字串時reject', async function() {
            await assert.rejects(call({ fdOhlc: '' }), /invalid fdOhlc/)
            await assert.rejects(call({ fdOhlc: null }), /invalid fdOhlc/)
        })

        it('fdParam非有效字串時reject', async function() {
            await assert.rejects(call({ fdParam: '' }), /invalid fdParam/)
        })

        it('fdData非有效字串時reject', async function() {
            await assert.rejects(call({ fdData: '' }), /invalid fdData/)
        })

    })

})
