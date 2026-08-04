import isnum from 'wsemi/src/isnum.mjs'
import cint from 'wsemi/src/cint.mjs'


/**
 * 計算交易次數所屬級距代碼levelNumTrade
 *
 * 交易次數過少之策略統計意義不足，過多則屬高頻，故以級距分群，使不同交易次數規模之策略各自保留最佳者
 * 級距對應為: <=0為0，1-5為1，6-9為2，10-24為11，25-49為12，50-74為13，75-99為14，100-249為101，250-499為102，500-749為103，750-999為104，1000-1999為1001，2000-2999為1002，3000-3999為1003，4000-4999為1004，>=5000為100
 * numTrade非數值時throw
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-calcLevelNumTrade.test.mjs Github}
 * @function
 * @param {Number} numTrade 輸入交易次數數值
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
 */
let calcLevelNumTrade = (numTrade) => {

    if (!isnum(numTrade)) {
        throw new Error(`numTrade[${numTrade}] is not a number`)
    }
    numTrade = cint(numTrade)

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
