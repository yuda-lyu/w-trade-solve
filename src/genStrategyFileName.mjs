import cint from 'wsemi/src/cint.mjs'
import cont from './cont.mjs'
import genTid from './genTid.mjs'
import calcLevelNumTrade from './calcLevelNumTrade.mjs'


/**
 * 產生策略儲存檔名
 *
 * 檔名為`${tid}${cont.dlmPkgs}${levelNumTrade}${cont.dlmPkgs}${rEquivalentCumuProfitOrLossFinalNormYear}.json`
 * tid由genTid以coin、interval、mode與keys產生，levelNumTrade由calcLevelNumTrade以summary.numTrade產生
 * 因tid與levelNumTrade皆入檔名，故可由檔名反解出同組keys與同交易次數級距之既有策略，供readStrategies列舉比較
 * settings目前未參與檔名組成
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-genStrategyFileName.test.mjs Github}
 * @function
 * @param {String} coin 輸入幣種名稱字串，例如'btc'
 * @param {String} interval 輸入K線週期字串，例如'4hr'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {Array} keys 輸入指標key字串陣列
 * @param {Object} settings 輸入策略設定物件
 * @param {Object} summary 輸入回測統計摘要物件，需含numTrade(交易次數)與rEquivalentCumuProfitOrLossFinalNormYear(最終等效年化盈虧百分比字串)欄位
 * @returns {String} 回傳策略儲存檔名字串
 * @example
 *
 * let keys = ['btc_price_4hr_ma_1day']
 *
 * let settings = { uIni: 1000, uTrade: 1, rTakeProfit: 0.05, rStopLoss: 0.03, rFee: 0.0005 }
 *
 * let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '31.25%' }
 *
 * let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
 * console.log(fn)
 * // => 'long ║ p_ma_1day ⊙ 12 ⊙ 31.25%.json'
 *
 */
let genStrategyFileName = (coin, interval, mode, keys, settings, summary) => {

    //tid
    let tid = genTid(coin, interval, mode, keys)
    // console.log('tid', tid)

    //numTrade
    let numTrade = cint(summary.numTrade)

    //levelNumTrade
    let levelNumTrade = calcLevelNumTrade(numTrade)

    //rEquivalentCumuProfitOrLossFinalNormYear
    let rEquivalentCumuProfitOrLossFinalNormYear = summary.rEquivalentCumuProfitOrLossFinalNormYear

    //fnStrategy
    let fnStrategy = `${tid}${cont.dlmPkgs}${levelNumTrade}${cont.dlmPkgs}${rEquivalentCumuProfitOrLossFinalNormYear}.json`

    return fnStrategy
}


export default genStrategyFileName
