import path from 'path'
import each from 'lodash-es/each.js'
import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import round from 'lodash-es/round.js'
import size from 'lodash-es/size.js'
import cint from 'wsemi/src/cint.mjs'
import dig from 'wsemi/src/dig.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'
import fsDeleteFile from 'wsemi/src/fsDeleteFile.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsWriteJson from 'wsemi/src/fsWriteJson.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isnum from 'wsemi/src/isnum.mjs'
import rang from 'wsemi/src/rang.mjs'
import wround from 'wsemi/src/round.mjs'
import omlPSO from 'w-optimization/src/omlPSO.mjs'
import dataProvide from 'w-data-tdprovide'
import runStrategy from 'w-trade-backtest/src/runStrategy.mjs'
import readStrategies from './readStrategies.mjs'
import genTid from './genTid.mjs'
import genSid from './genSid.mjs'
import p2r from './p2r.mjs'
import calcLevelNumTrade from './calcLevelNumTrade.mjs'
import calcFitness from './calcFitness.mjs'
import genStrategyFileName from './genStrategyFileName.mjs'


/**
 * 針對指定keys率定各key之門檻與止盈止損，求解最佳策略
 *
 * 設計變數為[止損比例, 止盈比例, ...各key之門檻]，止損與止盈由opt.thsSl與opt.thsTp給予之百分比清單離散取值
 * 各key門檻取值範圍為[-thLim,thLim]切為thLim*20段，並各自平移+vdir與-vdir(vdir=thLim*5)為兩組，使解值恆大於0代表'>'條件、恆小於0代表'<'條件，還原時再扣除平移值，故單一設計變數即同時涵蓋大於與小於兩種條件
 * 以omlPSO粒子群最佳化求解，各次計算皆以w-trade-backtest之runStrategy回測並經calcFitness計算適應值
 * 各次計算結果若同時滿足交易次數、勝率與最終等效年化盈虧三門檻，則以genStrategyFileName產生檔名存入fdData；同tid且同交易次數級距(tkid)已有策略時，僅於最終等效年化盈虧更佳時抽換，並刪除較差者
 * fdOhlc、fdParam、timeStart、timeEnd、keys、fdData無效或mode非'long'或'short'時throw
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-estimKeys.test.mjs Github}
 * @function
 * @param {Function} ott 輸入時區時間函數，傳入時間字串回傳dayjs時間物件，可用src/ott.mjs
 * @param {Object} st 輸入設定物件，需可由opt.keySettings取得name、symbol與interval欄位
 * @param {String} fdOhlc 輸入儲存K線(ohlc)序列資料夾字串
 * @param {String} fdParam 輸入儲存指標參數序列資料夾字串
 * @param {String} timeStart 輸入回測起始時間字串，格式'YYYY-MM-DDTHH:mm:ss'
 * @param {String} timeEnd 輸入回測結束時間字串，格式'YYYY-MM-DDTHH:mm:ss'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {Array} keys 輸入待率定門檻之指標key字串陣列
 * @param {String} fdData 輸入儲存策略資料夾字串，不存在時自動建立
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} opt.keySettings 輸入取用st內設定之鍵字串，例如'btc4hr'代表取用st.btc4hr.name、st.btc4hr.symbol與st.btc4hr.interval
 * @param {Array} [opt.thsTp=[1,2,3,4,5,6,7,8,9,10]] 輸入止盈門檻百分比數值陣列，預設[1,2,3,4,5,6,7,8,9,10]
 * @param {Array} [opt.thsSl=[1,2,3,4,5,6,7,8,9,10]] 輸入止損門檻百分比數值陣列，預設[1,2,3,4,5,6,7,8,9,10]
 * @param {Number} [opt.thNumTrade=1] 輸入策略須儲存之最少交易次數數值，預設1
 * @param {Number} [opt.thRWin=0.5] 輸入策略須儲存之最低勝率比例數值，預設0.5
 * @param {Number} [opt.thREquivalentCumuProfitOrLossFinalNormYear=0.15] 輸入策略須儲存之最低最終等效年化盈虧比例數值，預設0.15
 * @param {Boolean} [opt.useShowLog=false] 輸入是否顯示求解過程log布林值，預設false
 * @returns {Promise} 回傳Promise，resolve為omlPSO之求解結果物件，含bestSolution、stopMode、stopIteration與stopExecutions等欄位
 * @example
 *
 * import ott from './src/ott.mjs'
 *
 * //st, 各設定以keySettings為鍵儲存
 * let st = {
 *     btc4hr: {
 *         name: 'btc',
 *         symbol: 'BTCUSDT',
 *         interval: '4hr',
 *     },
 * }
 *
 * //keys, 待率定門檻之指標key, 各key於fdParam內須有對應之`${key}.json`
 * let keys = ['btc_price_4hr_ma_1day']
 *
 * let m = await estimKeys(ott, st, './data/ohlc', './data/param', '2022-07-01T00:00:00', '2025-04-08T00:00:00', 'long', keys, './data/strategy', {
 *     keySettings: 'btc4hr',
 *     thsTp: [1, 2, 3],
 *     thsSl: [1, 2, 3],
 *     useShowLog: true,
 * })
 * console.log(m.bestSolution.fitness)
 * // => 1.0325
 *
 */
let estimKeys = async (ott, st, fdOhlc, fdParam, timeStart, timeEnd, mode, keys, fdData, opt = {}) => {

    if (!isestr(fdOhlc)) {
        throw new Error(`invalid fdOhlc[${fdOhlc}]`)
    }
    if (!isestr(fdParam)) {
        throw new Error(`invalid fdParam[${fdParam}]`)
    }
    if (!isestr(timeStart)) {
        throw new Error(`invalid timeStart[${timeStart}]`)
    }
    if (!isestr(timeEnd)) {
        throw new Error(`invalid timeEnd[${timeEnd}]`)
    }
    if (mode !== 'long' && mode !== 'short') {
        throw new Error(`invalid mode[${mode}]`)
    }
    if (!isearr(keys)) {
        throw new Error(`invalid keys[${keys}]`)
    }
    if (!isestr(fdData)) {
        throw new Error(`invalid fdData[${fdData}]`)
    }

    let keySettings = get(opt, 'keySettings', '')
    if (!isestr(keySettings)) {
        throw new Error(`invalid opt.keySettings[${keySettings}]`)
    }
    let thsTp = get(opt, 'thsTp', null)
    if (!isearr(thsTp)) {
        thsTp = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }
    let thsSl = get(opt, 'thsSl', null)
    if (!isearr(thsSl)) {
        thsSl = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }
    let thNumTrade = get(opt, 'thNumTrade', null)
    if (!isnum(thNumTrade)) {
        thNumTrade = 1
    }
    let thRWin = get(opt, 'thRWin', null)
    if (!isnum(thRWin)) {
        thRWin = 0.5
    }
    let thREquivalentCumuProfitOrLossFinalNormYear = get(opt, 'thREquivalentCumuProfitOrLossFinalNormYear', null)
    if (!isnum(thREquivalentCumuProfitOrLossFinalNormYear)) {
        thREquivalentCumuProfitOrLossFinalNormYear = 0.15
    }
    let useShowLog = get(opt, 'useShowLog', null)

    //provideData
    let provideData = dataProvide(fdOhlc, fdParam)

    //st
    let name = get(st, `${keySettings}.name`, '')
    let symbol = get(st, `${keySettings}.symbol`, '')
    let interval = get(st, `${keySettings}.interval`, '')

    //fdData, 儲存策略資料夾, 由呼叫端指定, 不存在則建立
    if (!fsIsFolder(fdData)) {
        fsCreateFolder(fdData)
    }

    //funGetSeries
    let funGetSeries = await provideData.buildGetTimeSeriesByTimeRange(timeStart, timeEnd)

    //tid
    let tid = genTid(name, interval, mode, keys)
    // console.log('tid', tid)

    //vdir, 添加平移值方便後續判識方向
    let thLim = 2
    let vdir = thLim * 5

    //dps
    let dps = []
    let idx = 0 //額外(非conds)設計變數之個數
    if (true) {

        //dps, 止損門檻與增量
        if (true) {
            let values

            //掛單止損門檻(%), 對應 xs[0] = rStopLoss
            values = thsSl
            values = map(values, (v) => {
                return v / 100
            })
            // console.log('values', values)
            dps.push({
                values,
                n: size(values),
            })
            idx++

            //掛單止盈門檻(%), 對應 xs[1] = rTakeProfit
            values = thsTp
            values = map(values, (v) => {
                return v / 100
            })
            // console.log('values', values)
            dps.push({
                values,
                n: size(values),
            })
            idx++

            // //每次下單金額(USDT), 因等效年化報酬都是會基於最大持倉去計算, 故下單金額與最大持倉成正比, 故不再須視為參數之一
            // values = [1]
            // // console.log('values', values)
            // dps.push({
            //     values,
            //     n: size(values),
            // })
            // idx++

        }

        //dps, 基於keys
        each(keys, () => {

            //大於條件
            // let valuesU_fine = rang(0.01, 0.10, 9) //細粒度小尺度區: [0.01, 0.10] step 0.01 (10 點, 給 absP99 < 0.1 的 115 個小尺度 keyOut)
            // let valuesU_main = rang(0.15, 2.0, 37) //主區: [0.15, 2.0] step 0.05 (38 點)
            // let valuesU = [...valuesU_fine, ...valuesU_main] //合計 48 點
            let valuesU = rang(-thLim, thLim, thLim * 20)
            valuesU = map(valuesU, (v) => {
                return v + vdir //添加vdir使全部解皆>0, 方便後續判識轉換
            })

            //小於條件
            // let valuesL_main = rang(-2.0, -0.15, 37) //主區: [-2.0, -0.15] step 0.05 (38 點)
            // let valuesL_fine = rang(-0.10, -0.01, 9) //細粒度小尺度區: [-0.10, -0.01] step 0.01 (10 點, 給 absP99 < 0.1 的 115 個小尺度 keyOut)
            // let valuesL = [...valuesL_main, ...valuesL_fine] //合計 48 點
            let valuesL = rang(-thLim, thLim, thLim * 20)
            valuesL = map(valuesL, (v) => {
                return v - vdir //添加-vdir使全部解皆<0, 方便後續判識轉換
            })

            //values
            let values = [
                ...valuesU,
                ...valuesL,
            ]

            //push
            dps.push({
                values,
                n: size(values),
            })

        })

    }

    //ifun, fitnessMin
    let ifun = 0
    let fitnessMin = 1e20

    //fun
    let fun = async (xs) => {
        //xs: 各元素為整數指標, 代表key所使用的conds

        ifun++

        //rStopLoss, rTakeProfit
        let rStopLoss = xs[0] //止損
        rStopLoss = round(rStopLoss, 3)
        let rTakeProfit = xs[1] //止盈
        rTakeProfit = round(rTakeProfit, 3)
        let uTrade = 1 //原本使用xs[2]

        //conds
        let conds = map(keys, (key, i) => {

            //ix
            let ix = i + idx

            //x
            let x = get(xs, ix, null)

            //check
            if (x === null) {
                console.log('xs', xs)
                console.log('ix', ix)
                console.log('key', key)
                console.log('i', i)
                throw new Error(`invalid x`)
            }

            //sym, th
            let sym = ''
            let th = null
            if (x < 0) {
                sym = '<'
                th = x + vdir
                th = wround(th, 3) //門檻小數位要夠多, 否則切細會被抹去
            }
            else {
                sym = '>'
                th = x - vdir
                th = wround(th, 3) //門檻小數位要夠多, 否則切細會被抹去
            }

            return {
                key,
                sym,
                th,
            }
        })
        // console.log(ifun, 'conds', conds)

        //sid
        let sid = genSid(name, interval, mode, conds)
        // console.log('sid', sid)

        //strategy
        let strategy = {

            tid,
            sid,

            name,
            symbol,
            interval,

            keyOhlc: `${name}_price_${interval}`, //OHLC數據

            mode,

            conds,

            settings: {
                uIni: 1000, //初始資金(USDT)
                uTrade, //每次下單金額(USDT)
                rTakeProfit, //止盈
                rStopLoss, //止損
                rFee: 0.0005, //手續費
            },

        }

        //runStrategy
        let r = await runStrategy(ott, strategy, funGetSeries)
        // console.log(ifun, 'summary', r.summary)

        //numTrade
        let numTrade = cint(r.summary.numTrade)

        //rWin
        let rWin = p2r(r.summary.rWin)

        // //rCumuProfitOrLossFinal
        // let rCumuProfitOrLossFinal = p2r(r.summary.rCumuProfitOrLossFinal)

        // //rTradeAllMax
        // let rTradeAllMax = p2r(r.summary.rTradeAllMax)

        // //rEquivalentCumuProfitOrLossFinal
        // let rEquivalentCumuProfitOrLossFinal = p2r(r.summary.rEquivalentCumuProfitOrLossFinal)

        //rEquivalentCumuProfitOrLossFinalNormYear
        let rEquivalentCumuProfitOrLossFinalNormYear = p2r(r.summary.rEquivalentCumuProfitOrLossFinalNormYear)

        //fitness
        let fitness = calcFitness(strategy.settings, r.summary)

        //res
        let res = {

            ...strategy,

            summary: r.summary,

            fitness,

        }
        //  console.log(ifun, res)
        let resBrief = {

            '方向': res.mode,
            '每次下單金額': res.settings.uTrade,
            '止盈': dig(res.settings.rTakeProfit * 100, 1) + '%',
            '止損': dig(res.settings.rStopLoss * 100, 1) + '%',
            // '最大持倉金額': res.summary.uTradeAllMax,
            '最大持倉比例': res.summary.rTradeAllMax,
            '交易次數': res.summary.numTrade,
            '最大回撤率': res.summary.rDrawdownMax,
            '勝率': res.summary.rWin,
            '夏普值': dig(res.summary.rSharpe, 4),
            '最終盈虧': res.summary.rCumuProfitOrLossFinal,
            '最終等效盈虧': res.summary.rEquivalentCumuProfitOrLossFinal,
            '最終等效年化盈虧': res.summary.rEquivalentCumuProfitOrLossFinalNormYear,

            'fitness': res.fitness,

        }
        // console.log(ifun, resBrief)

        //update fitnessMin
        if (fitnessMin > fitness) {

            if (useShowLog) {
                console.log(ifun, '更新最佳解', resBrief)
            }

            //update
            fitnessMin = fitness

        }

        //儲存可用參數組
        if (
            numTrade >= thNumTrade &&
            rWin >= thRWin &&
            // rCumuProfitOrLossFinal > 0 &&
            // rTradeAllMax <= 0.8 &&
            // rEquivalentCumuProfitOrLossFinal >= 0.3 &&
            rEquivalentCumuProfitOrLossFinalNormYear >= thREquivalentCumuProfitOrLossFinalNormYear && //單策略等效年化報酬率之限制, 不能給太高
            true
        ) {

            if (useShowLog) {
                console.log(ifun, '可用參數組', resBrief)
            }

            //kpTid
            let kpTkid = {}
            if (true) {
                let ss = readStrategies(fdData, { readContent: false })
                each(ss, (s) => {
                    kpTkid[s.tkid] = s
                })
            }
            // console.log('kpTkid', kpTkid)

            //levelNumTrade
            let levelNumTrade = calcLevelNumTrade(numTrade)

            //tkid
            let tkid = `${tid}:${levelNumTrade}`

            //b
            let b = false

            //rEquivalentCumuProfitOrLossFinalNormYearNew
            let rEquivalentCumuProfitOrLossFinalNormYearNew = rEquivalentCumuProfitOrLossFinalNormYear

            //檢查是否已有tid策略
            if (haskey(kpTkid, tkid)) {

                //rEquivalentCumuProfitOrLossFinalNormYearOld
                let rEquivalentCumuProfitOrLossFinalNormYearOld = p2r(kpTkid[tkid].rEquivalentCumuProfitOrLossFinalNormYear)

                //check
                if (rEquivalentCumuProfitOrLossFinalNormYearNew > rEquivalentCumuProfitOrLossFinalNormYearOld) {

                    //出現更好的等效盈虧比例, 須抽換
                    b = true

                    //先刪除較差tid策略
                    if (useShowLog) {
                        console.log(`刪除較差策略...`, `${rEquivalentCumuProfitOrLossFinalNormYearNew} > ${rEquivalentCumuProfitOrLossFinalNormYearOld}`, kpTkid[tkid].path)
                    }
                    fsDeleteFile(kpTkid[tkid].path)

                }

            }
            else {

                //新出現須儲存
                b = true

            }

            //save
            if (b) {

                //fnStrategy
                let fnStrategy = genStrategyFileName(name, interval, mode, keys, strategy.settings, r.summary)

                //fpStrategy
                let fpStrategy = path.resolve(fdData, fnStrategy)

                //fsWriteJson
                fsWriteJson(fpStrategy, res, { useFormat: true })

            }

        }

        return fitness
    }

    //m
    let m = await omlPSO(dps, fun, {
        // funGenerationBefore,
        // funGenerationAfter,
        // funGetBetter,
    })
    if (useShowLog) {
        // console.log('m', m)
        console.log('bestSolution', m.bestSolution)
        console.log('stopMode', m.stopMode)
        console.log('stopIteration', m.stopIteration)
        console.log('stopExecutions', m.stopExecutions)
    }

    return m
}


export default estimKeys
