import ot from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'


ot.extend(utc)
ot.extend(timezone)


let TZ = 'Asia/Taipei'


/**
 * 產生台北時區(Asia/Taipei)之dayjs時間物件
 *
 * 供estimKeys與w-trade-backtest之runStrategy等函數使用，使各處時間換算基準一致
 * 未給予input時回傳當下時間，給予input時以台北時區解析該時間
 *
 * @function
 * @param {String|Number|Date} [input=null] 輸入時間字串、時間數值或時間物件，未給予時代表當下時間，預設null
 * @returns {Object} 回傳台北時區之dayjs時間物件
 * @example
 *
 * console.log(ott('2020-01-01T00:00:00').format('YYYY-MM-DDTHH:mm:ssZ'))
 * // => '2020-01-01T00:00:00+08:00'
 *
 */
let ott = (input) => {
    if (input === undefined || input === null) {
        return ot().tz(TZ)
    }
    return ot.tz(input, TZ)
}


/**
 * 取得當下台北時間字串，格式'YYYY-MM-DDTHH:mm:ssZ'
 *
 * @function
 * @returns {String} 回傳當下台北時間字串
 * @example
 *
 * console.log(nowTpeStr())
 * // => '2026-08-04T22:08:31+08:00'
 *
 */
let nowTpeStr = () => ott().format('YYYY-MM-DDTHH:mm:ssZ')


/**
 * 取得當下台北時間字串，格式'YYYYMMDDHHmmss'
 *
 * @function
 * @returns {String} 回傳當下台北時間字串
 * @example
 *
 * console.log(nowTpeStrp())
 * // => '20260804220831'
 *
 */
let nowTpeStrp = () => ott().format('YYYYMMDDHHmmss')


export default ott
export { ott, nowTpeStr, nowTpeStrp }
