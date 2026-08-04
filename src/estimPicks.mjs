import each from 'lodash-es/each.js'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import dataProvide from 'w-data-tdprovide'
import estimKeys from './estimKeys.mjs'


/**
 * 由fdParam內全部指標key分類後挑選keys，再率定各key之門檻與止盈止損，求解最佳策略
 *
 * 先由fdParam列舉全部指標key，並依名稱分為3類: 開頭為'index_'者為keysIndex(指數類)、含'_vbs_'者為keysVolumn(成交量類)、其餘為keysNorm(一般類)
 * 分類後各類可經opt內對應之過濾函數再行篩選，接著呼叫funPickKeys由3類挑出待率定之keys，最後交由estimKeys求解
 * fdOhlc、fdParam、timeStart、timeEnd、fdData無效或mode非'long'或'short'或funPickKeys非函數時throw
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-estimPicks.test.mjs Github}
 * @function
 * @param {Function} ott 輸入時區時間函數，傳入時間字串回傳dayjs時間物件，可用src/ott.mjs
 * @param {Object} st 輸入設定物件，需可由opt.keySettings取得name、symbol與interval欄位
 * @param {String} fdOhlc 輸入儲存K線(ohlc)序列資料夾字串
 * @param {String} fdParam 輸入儲存指標參數序列資料夾字串
 * @param {String} timeStart 輸入回測起始時間字串，格式'YYYY-MM-DDTHH:mm:ss'
 * @param {String} timeEnd 輸入回測結束時間字串，格式'YYYY-MM-DDTHH:mm:ss'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {Function} funPickKeys 輸入挑選keys函數，傳入{keysNorm,keysIndex,keysVolumn}物件，回傳待率定之指標key字串陣列
 * @param {String} fdData 輸入儲存策略資料夾字串，不存在時自動建立
 * @param {Object} [opt={}] 輸入設定物件，預設{}，其餘欄位皆傳遞至estimKeys
 * @param {Function} [opt.funFilterKeysNorm=null] 輸入過濾一般類key之async函數，傳入keysNorm陣列回傳過濾後陣列，預設null
 * @param {Function} [opt.funFilterKeysIndex=null] 輸入過濾指數類key之async函數，傳入keysIndex陣列回傳過濾後陣列，預設null
 * @param {Function} [opt.funFilterKeysVolumn=null] 輸入過濾成交量類key之async函數，傳入keysVolumn陣列回傳過濾後陣列，預設null
 * @returns {Promise} 回傳Promise，resolve為undefined
 * @example
 *
 * import ott from './src/ott.mjs'
 *
 * let st = {
 *     btc4hr: { name: 'btc', symbol: 'BTCUSDT', interval: '4hr' },
 * }
 *
 * //funPickKeys, 由一般類挑第1個key為待率定key
 * let funPickKeys = ({ keysNorm, keysIndex, keysVolumn }) => {
 *     return [keysNorm[0]]
 * }
 *
 * await estimPicks(ott, st, './data/ohlc', './data/param', '2022-07-01T00:00:00', '2025-04-08T00:00:00', 'long', funPickKeys, './data/strategy', {
 *     keySettings: 'btc4hr',
 * })
 *
 */
let estimPicks = async (ott, st, fdOhlc, fdParam, timeStart, timeEnd, mode, funPickKeys, fdData, opt = {}) => {

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
    if (!isfun(funPickKeys)) {
        throw new Error(`funPickKeys is not a function`)
    }
    if (!isestr(fdData)) {
        throw new Error(`invalid fdData[${fdData}]`)
    }

    let funFilterKeysNorm = get(opt, 'funFilterKeysNorm', null)
    let funFilterKeysIndex = get(opt, 'funFilterKeysIndex', null)
    let funFilterKeysVolumn = get(opt, 'funFilterKeysVolumn', null)

    //provideData
    let provideData = dataProvide(fdOhlc, fdParam)

    //keysParam
    let keysParam = provideData.getKeysParam()
    // console.log('keysParam', keysParam)

    //keysIndex, keysVolumn, keysNorm
    let keysIndex = []
    let keysVolumn = []
    let keysNorm = []
    each(keysParam, (v) => {
        let b1 = v.indexOf('index_') === 0
        let b2 = v.indexOf('_vbs_') >= 0
        let b3 = !(b1 || b2)
        if (b1) {
            keysIndex.push(v)
        }
        else if (b2) {
            keysVolumn.push(v)
        }
        else if (b3) {
            keysNorm.push(v)
        }
    })
    // console.log('keysIndex', keysIndex)
    // console.log('keysVolumn', keysVolumn)
    // console.log('keysNorm', keysNorm)
    // console.log(size(keysIndex) + size(keysVolumn) + size(keysNorm))

    if (isfun(funFilterKeysNorm)) {
        keysNorm = await funFilterKeysNorm(keysNorm)
    }
    if (isfun(funFilterKeysIndex)) {
        keysIndex = await funFilterKeysIndex(keysIndex)
    }
    if (isfun(funFilterKeysVolumn)) {
        keysVolumn = await funFilterKeysVolumn(keysVolumn)
    }

    //keys
    let keys = funPickKeys({ keysNorm, keysIndex, keysVolumn })
    // console.log('keys', keys)

    //estimKeys
    await estimKeys(ott, st, fdOhlc, fdParam, timeStart, timeEnd, mode, keys, fdData, opt)

}


export default estimPicks
