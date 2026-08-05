import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import size from 'lodash-es/size.js'
import cint from 'wsemi/src/cint.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import randomIntsNdpRange from 'wsemi/src/randomIntsNdpRange.mjs'
import sep from 'wsemi/src/sep.mjs'
import estimPicks from './estimPicks.mjs'


/**
 * 依指標組成comps隨機挑選keys，再率定各key之門檻與止盈止損，求解最佳策略
 *
 * comps為以逗號分隔之3個數字字串，依序代表由一般類(keysNorm)、指數類(keysIndex)與成交量類(keysVolumn)各隨機挑選之key個數，例如'2,1,0'代表挑2個一般類、1個指數類與0個成交量類
 * 各類皆以randomIntsNdpRange不重複隨機取樣，故同一comps每次執行所挑之keys不同
 * comps非3段時throw，其餘檢核與分類邏輯同estimPicks
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-estimComps.test.mjs Github}
 * @function
 * @param {Function} ott 輸入時區時間函數，傳入時間字串回傳dayjs時間物件，可用src/ott.mjs
 * @param {String} name 輸入幣種名稱字串，例如'btc'
 * @param {String} symbol 輸入交易對名稱字串，例如'BTCUSDT'
 * @param {String} interval 輸入K線週期字串，例如'4hr'
 * @param {String} fdOhlc 輸入儲存K線(ohlc)序列資料夾字串
 * @param {String} fdParam 輸入儲存指標參數序列資料夾字串
 * @param {String} timeStart 輸入回測起始時間字串，格式'YYYY-MM-DDTHH:mm:ss'
 * @param {String} timeEnd 輸入回測結束時間字串，格式'YYYY-MM-DDTHH:mm:ss'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {String} comps 輸入指標組成字串，為逗號分隔之3個數字，例如'2,1,0'
 * @param {String} fdData 輸入儲存策略資料夾字串，不存在時自動建立
 * @param {Object} [opt={}] 輸入設定物件，預設{}，全部欄位皆傳遞至estimPicks
 * @returns {Promise} 回傳Promise，resolve為undefined
 * @example
 *
 * import ott from './src/ott.mjs'
 *
 * //comps='2,1,0', 挑2種一般類、1種指數類與0種成交量類
 * await estimComps(ott, 'btc', 'BTCUSDT', '4hr', './data/ohlc', './data/param', '2022-07-01T00:00:00', '2025-04-08T00:00:00', 'long', '2,1,0', './data/strategy', {})
 *
 */
let estimComps = async (ott, name, symbol, interval, fdOhlc, fdParam, timeStart, timeEnd, mode, comps, fdData, opt = {}) => {

    if (!isestr(name)) {
        throw new Error(`invalid name[${name}]`)
    }
    if (!isestr(symbol)) {
        throw new Error(`invalid symbol[${symbol}]`)
    }
    if (!isestr(interval)) {
        throw new Error(`invalid interval[${interval}]`)
    }
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
    if (!isestr(comps)) {
        throw new Error(`invalid comps[${comps}]`)
    }
    if (!isestr(fdData)) {
        throw new Error(`invalid fdData[${fdData}]`)
    }

    //cs, 例如comps='2,1,0', 此為挑2種norm, 1種index, 0種volumn
    let cs = sep(comps, ',')
    if (size(cs) !== 3) {
        throw new Error(`comps[${comps}]非預期`)
    }
    cs = map(cs, cint)
    // console.log('cs', cs)

    //pkn
    let pkn = (arr, n) => {
        let up = size(arr) - 1
        let ks = randomIntsNdpRange(0, up, n)
        let rs = map(ks, (k) => {
            return get(arr, k)
        })
        return rs
    }

    //funPickKeys
    let funPickKeys = ({ keysNorm, keysIndex, keysVolumn }) => {
        let keys = []
        if (cs[0] >= 1) {
            keys = [
                ...keys,
                ...pkn(keysNorm, cs[0]),
            ]
        }
        if (cs[1] >= 1) {
            keys = [
                ...keys,
                ...pkn(keysIndex, cs[1]),
            ]
        }
        if (cs[2] >= 1) {
            keys = [
                ...keys,
                ...pkn(keysVolumn, cs[2]),
            ]
        }
        // console.log('keys', keys)
        return keys
    }

    //estimPicks
    await estimPicks(ott, name, symbol, interval, fdOhlc, fdParam, timeStart, timeEnd, mode, funPickKeys, fdData, opt)

}


export default estimComps
