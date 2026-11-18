import get from 'lodash-es/get.js'
import isnum from 'wsemi/src/isnum.mjs'
import cint from 'wsemi/src/cint.mjs'
import { parseLevelNumTradeBounds } from './_levelNumTradeBounds.mjs'


/**
 * 計算交易次數所屬級距代碼levelNumTrade
 *
 * 交易次數過少之策略統計意義不足，過多則屬高頻，故以級距分群，使不同交易次數規模之策略各自保留最佳者
 * 未給opt.levelNumTradeBounds時採預設級距(與K線週期無關，依4hr策略庫之交易次數規模所訂)，對應為: <=0為0，1-5為1，6-9為2，10-24為11，25-49為12，50-74為13，75-99為14，100-249為101，250-499為102，500-749為103，750-999為104，1000-1999為1001，2000-2999為1002，3000-3999為1003，4000-4999為1004，>=5000為100
 * 給opt.levelNumTradeBounds(各級距之下界，嚴格遞增之正整數陣列，例如[1,3,6,10,20,40])時，級距代碼為不大於交易次數之最大下界，交易次數小於首個下界(含<=0)者為0，大於等於末個下界者為末個下界(末級距不設上限)；例如下界[1,3,6]時0為0，1-2為1，3-5為3，>=6為6
 * 第2參數為設定物件(與genStrategyFileName之opt同形)，非物件者(例如作為陣列map之回呼時所收之索引)取不到opt.levelNumTradeBounds即視為未給，故[3,30].map(calcLevelNumTrade)照舊可用
 * numTrade非數值時throw；opt.levelNumTradeBounds給予而無效時throw(訊息為`invalid opt.levelNumTradeBounds: must be a non-empty array of at most 101 strictly increasing positive integers`，不含輸入值)
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-calcLevelNumTrade.test.mjs Github}
 * @function
 * @param {Number} numTrade 輸入交易次數數值
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Array} [opt.levelNumTradeBounds=null] 輸入各級距下界之正整數陣列(數字或整數字串，轉為數值後須嚴格遞增，至多101個)，null或未給為採預設級距，預設null
 * @returns {Number} 回傳級距代碼數值
 * @example
 *
 * console.log(calcLevelNumTrade(0))
 * // => 0
 *
 * console.log(calcLevelNumTrade(3))
 * // => 1
 *
 * console.log(calcLevelNumTrade(30))
 * // => 12
 *
 * console.log(calcLevelNumTrade(8000))
 * // => 100
 *
 * //自訂級距之下界, 代碼為不大於交易次數之最大下界
 * let opt = { levelNumTradeBounds: [1, 3, 6] }
 * console.log(calcLevelNumTrade(0, opt), calcLevelNumTrade(2, opt), calcLevelNumTrade(5, opt), calcLevelNumTrade(40, opt))
 * // => 0 1 3 6
 *
 */
let calcLevelNumTrade = (numTrade, opt = {}) => {

    if (!isnum(numTrade)) {
        throw new Error(`numTrade[${numTrade}] is not a number`)
    }
    numTrade = cint(numTrade)

    //bounds, 自訂級距之下界(給予時檢測並轉為數值), 未給(含opt非物件)為null採預設級距
    let bounds = parseLevelNumTradeBounds(get(opt, 'levelNumTradeBounds', null), 'opt.levelNumTradeBounds')
    if (bounds !== null) {
        let level = 0
        for (let i = 0; i < bounds.length; i++) {
            if (numTrade >= bounds[i]) {
                level = bounds[i]
            }
            else {
                break
            }
        }
        return level
    }

    let levelNumTrade = 0
    if (numTrade <= 0) {
        levelNumTrade = 0
    }
    else if (numTrade <= 5) {
        levelNumTrade = 1
    }
    else if (numTrade <= 10 - 1) {
        levelNumTrade = 2
    }
    else if (numTrade <= 25 - 1) {
        levelNumTrade = 11
    }
    else if (numTrade <= 50 - 1) {
        levelNumTrade = 12
    }
    else if (numTrade <= 75 - 1) {
        levelNumTrade = 13
    }
    else if (numTrade <= 100 - 1) {
        levelNumTrade = 14
    }
    else if (numTrade <= 250 - 1) {
        levelNumTrade = 101
    }
    else if (numTrade <= 500 - 1) {
        levelNumTrade = 102
    }
    else if (numTrade <= 750 - 1) {
        levelNumTrade = 103
    }
    else if (numTrade <= 1000 - 1) {
        levelNumTrade = 104
    }
    else if (numTrade <= 2000 - 1) {
        levelNumTrade = 1001
    }
    else if (numTrade <= 3000 - 1) {
        levelNumTrade = 1002
    }
    else if (numTrade <= 4000 - 1) {
        levelNumTrade = 1003
    }
    else if (numTrade <= 5000 - 1) {
        levelNumTrade = 1004
    }
    else {
        levelNumTrade = 100
    }

    return levelNumTrade
}


export default calcLevelNumTrade
