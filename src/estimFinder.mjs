import get from 'lodash-es/get.js'
import sample from 'lodash-es/sample.js'
import isestr from 'wsemi/src/isestr.mjs'
import estimComps from './estimComps.mjs'


/**
 * 以隨機之交易方向與指標組成求解最佳策略
 *
 * 供批次探索用之進入點，未指定時mode由'long'與'short'隨機取一，comps由18種預設組成隨機取一，故重複呼叫即可隨機探索各種策略
 * 未指定時timeStart預設為'2022-07-01T00:00:00'，timeEnd則依mode給予不同值: 做多為'2025-04-08T00:00:00'(須涵蓋暴跌數據)，做空為'2025-10-06T00:00:00'(須涵蓋暴漲數據)，藉此提高率定難度
 * fdOhlc、fdParam與fdData無效時throw
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-estimFinder.test.mjs Github}
 * @function
 * @param {Function} ott 輸入時區時間函數，傳入時間字串回傳dayjs時間物件，可用src/ott.mjs
 * @param {Object} st 輸入設定物件，需可由opt.keySettings取得name、symbol與interval欄位
 * @param {String} fdOhlc 輸入儲存K線(ohlc)序列資料夾字串
 * @param {String} fdParam 輸入儲存指標參數序列資料夾字串
 * @param {String} fdData 輸入儲存策略資料夾字串，不存在時自動建立
 * @param {Object} [opt={}] 輸入設定物件，預設{}，全部欄位皆傳遞至estimComps
 * @param {String} [opt.mode=''] 輸入交易方向字串，可選'long'或'short'，未給予時隨機取一，預設''
 * @param {String} [opt.timeStart='2022-07-01T00:00:00'] 輸入回測起始時間字串，預設'2022-07-01T00:00:00'
 * @param {String} [opt.timeEnd=''] 輸入回測結束時間字串，未給予時做多為'2025-04-08T00:00:00'、做空為'2025-10-06T00:00:00'，預設''
 * @param {String} [opt.comps=''] 輸入指標組成字串，例如'2,1,0'，未給予時由18種預設組成隨機取一，預設''
 * @returns {Promise} 回傳Promise，resolve為undefined
 * @example
 *
 * import ott from './src/ott.mjs'
 *
 * let st = {
 *     btc4hr: { name: 'btc', symbol: 'BTCUSDT', interval: '4hr' },
 * }
 *
 * //mode與comps皆隨機, 適合以迴圈重複呼叫批次探索
 * await estimFinder(ott, st, './data/ohlc', './data/param', './data/strategy', {
 *     keySettings: 'btc4hr',
 * })
 *
 */
let estimFinder = async (ott, st, fdOhlc, fdParam, fdData, opt = {}) => {

    if (!isestr(fdOhlc)) {
        throw new Error(`invalid fdOhlc[${fdOhlc}]`)
    }
    if (!isestr(fdParam)) {
        throw new Error(`invalid fdParam[${fdParam}]`)
    }
    if (!isestr(fdData)) {
        throw new Error(`invalid fdData[${fdData}]`)
    }

    let useMode = get(opt, 'mode', null)
    let useTimeStart = get(opt, 'timeStart', null)
    let useTimeEnd = get(opt, 'timeEnd', null)
    let uesComps = get(opt, 'comps', null)

    //mode
    let mode = ''
    if (isestr(useMode)) {
        mode = useMode
    }
    else {
        mode = Math.random() < 0.5 ? `long` : `short`
    }

    //timeStart
    let timeStart = '2022-07-01T00:00:00'
    if (isestr(useTimeStart)) {
        timeStart = useTimeStart
    }

    //timeEnd
    let timeEnd = ''
    if (isestr(useTimeEnd)) {
        timeEnd = useTimeEnd
    }
    else {
        if (mode === 'long') {
            timeEnd = '2025-04-08T00:00:00' //做多策略須使用至4/8暴跌數據, 提高難度 [tag:提高率定難度]
        }
        else {
            timeEnd = '2025-10-06T00:00:00' //做空策略須使用至10/6暴漲數據, 增加難度 [tag:提高率定難度]
        }
    }

    //comps
    let compsAll = [

        '2,0,0',
        '3,0,0',
        '4,0,0',
        '2,1,0',
        '3,1,0',
        '4,1,0',
        '2,2,0',
        '3,2,0',
        '4,2,0',

        '2,0,1',
        '3,0,1',
        '4,0,1',
        '2,1,1',
        '3,1,1',
        '4,1,1',
        '2,2,1',
        '3,2,1',
        '4,2,1',

    ]
    let comps = ''
    if (isestr(uesComps)) {
        comps = uesComps
    }
    else {
        comps = sample(compsAll) //例如comps='2,1,0', 此為挑2種norm, 1種index, 0種volumn
    }

    //estimComps
    await estimComps(ott, st, fdOhlc, fdParam, timeStart, timeEnd, mode, comps, fdData, opt)

}


export default estimFinder
