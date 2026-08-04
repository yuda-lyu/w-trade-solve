import cstr from 'wsemi/src/cstr.mjs'
import cdbl from 'wsemi/src/cdbl.mjs'


/**
 * 轉換百分比字串為比例數值
 *
 * 輸入須為含'%'之字串(例如w-trade-backtest之summary內各比例欄位)，剔除'%'後除以100為比例值
 * 未含'%'時回傳0，故無任何交易之空字串亦回傳0
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-p2r.test.mjs Github}
 * @function
 * @param {String} p 輸入百分比字串，例如'31.25%'
 * @returns {Number} 回傳比例數值
 * @example
 *
 * console.log(p2r('31.25%'))
 * // => 0.3125
 *
 * console.log(p2r('-5%'))
 * // => -0.05
 *
 * console.log(p2r(''))
 * // => 0
 *
 */
let p2r = (p) => {
    p = cstr(p)
    if (p.indexOf('%') < 0) {
        return 0 //未有任何交易時會傳入空字串
    }
    p = p.replace('%', '')
    p = cdbl(p)
    p /= 100
    return p
}


export default p2r
