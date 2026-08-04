import join from 'lodash-es/join.js'
import cont from './cont.mjs'


/**
 * 產生策略種類識別碼tid
 *
 * 以cont.dlmSeps串接mode與各key為識別字串，再進行縮寫替換以縮短長度
 * 縮寫替換依序為: 剔除`${coin}_`、剔除`${interval}_`、'price_'轉'p_'、'index_'轉'i_'、'Ohlc_'轉'o_'、'Close_'轉'c_'、'Volumn_'轉'v_'
 * 因替換係以`${coin}_`與`${interval}_`為樣式，故coin與interval須給予有效字串，否則將剔除全部底線
 * tid僅由mode與keys決定，未含各key之門檻條件，故同組keys之各門檻組合皆對應同一tid
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-genTid.test.mjs Github}
 * @function
 * @param {String} coin 輸入幣種名稱字串，例如'btc'
 * @param {String} interval 輸入K線週期字串，例如'4hr'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {Array} keys 輸入指標key字串陣列
 * @returns {String} 回傳策略種類識別碼tid字串
 * @example
 *
 * let tid = genTid('btc', '4hr', 'long', ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr'])
 * console.log(tid)
 * // => 'long ║ p_ma_1day ║ i_rsi_4hr'
 *
 */
let genTid = (coin, interval, mode, keys) => {
    let tid = join([mode, ...keys], cont.dlmSeps)
    tid = tid.replaceAll(`${coin}_`, '')
    tid = tid.replaceAll(`${interval}_`, '')
    tid = tid.replaceAll(`price_`, 'p_')
    tid = tid.replaceAll(`index_`, 'i_')
    tid = tid.replaceAll(`Ohlc_`, 'o_')
    tid = tid.replaceAll(`Close_`, 'c_')
    tid = tid.replaceAll(`Volumn_`, 'v_')
    // console.log('tid', tid)
    return tid
}


export default genTid
