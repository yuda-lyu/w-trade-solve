/**
 * 共用常數
 *
 * dlmSeps為tid與sid內各段(mode與各key或各cond)之分隔字串
 * dlmPkgs為舊版策略檔名內各段(tid、levelNumTrade、rEquivalentCumuProfitOrLossFinalNormYear)之分隔字串，自genStrategyFileName改採雜湊檔名後僅供readStrategies解析舊格式檔名使用
 *
 * @name cont
 * @const
 * @type {Object}
 * @example
 *
 * console.log(cont)
 * // => { dlmSeps: ' ║ ', dlmPkgs: ' ⊙ ' }
 *
 */
let r = {
    dlmSeps: ' ║ ',
    dlmPkgs: ' ⊙ ',
}


export default r
