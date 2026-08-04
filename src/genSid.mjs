import join from 'lodash-es/join.js'
import map from 'lodash-es/map.js'
import cont from './cont.mjs'


/**
 * 產生策略識別碼sid
 *
 * 各cond先組為`${key}${sym}${th}`，再以cont.dlmSeps串接mode與各cond為識別字串，最後進行與genTid相同之縮寫替換
 * 縮寫替換依序為: 剔除`${coin}_`、剔除`${interval}_`、'price_'轉'p_'、'index_'轉'i_'、'Ohlc_'轉'o_'、'Close_'轉'c_'、'Volumn_'轉'v_'
 * 因替換係以`${coin}_`與`${interval}_`為樣式，故coin與interval須給予有效字串，否則將剔除全部底線
 * sid已含各cond之門檻，故同組keys之不同門檻組合對應不同sid，可與僅由keys決定之tid區別
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-genSid.test.mjs Github}
 * @function
 * @param {String} coin 輸入幣種名稱字串，例如'btc'
 * @param {String} interval 輸入K線週期字串，例如'4hr'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {Array} conds 輸入條件物件陣列，各元素為{key,sym,th}，key為指標key字串，sym為'>'或'<'，th為門檻數值
 * @returns {String} 回傳策略識別碼sid字串
 * @example
 *
 * let conds = [
 *     { key: 'btc_price_4hr_ma_1day', sym: '>', th: 0.05 },
 *     { key: 'btc_index_rsi_4hr', sym: '<', th: -0.2 },
 * ]
 *
 * let sid = genSid('btc', '4hr', 'long', conds)
 * console.log(sid)
 * // => 'long ║ p_ma_1day>0.05 ║ i_rsi_4hr<-0.2'
 *
 */
let genSid = (coin, interval, mode, conds) => {
    let ss = map(conds, (cond) => {
        // key,
        // sym,
        // th,
        return `${cond.key}${cond.sym}${cond.th}`
    })
    let sid = join([mode, ...ss], cont.dlmSeps)
    sid = sid.replaceAll(`${coin}_`, '')
    sid = sid.replaceAll(`${interval}_`, '')
    sid = sid.replaceAll(`price_`, 'p_')
    sid = sid.replaceAll(`index_`, 'i_')
    sid = sid.replaceAll(`Ohlc_`, 'o_')
    sid = sid.replaceAll(`Close_`, 'c_')
    sid = sid.replaceAll(`Volumn_`, 'v_')
    // console.log('sid', sid)
    return sid
}


export default genSid
