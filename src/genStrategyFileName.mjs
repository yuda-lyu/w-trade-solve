import crypto from 'crypto'
import cint from 'wsemi/src/cint.mjs'
import genTid from './genTid.mjs'
import calcLevelNumTrade from './calcLevelNumTrade.mjs'


/**
 * 產生策略儲存檔名
 *
 * 檔名為`${mode}_${levelNumTrade}_${hash}.json`，hash為md5(`${coin}:${interval}:${tid}:${levelNumTrade}`)取前16碼(64bits)
 * tid由genTid以coin、interval、mode與keys產生，levelNumTrade由calcLevelNumTrade以summary.numTrade產生
 * 檔名為(coin,interval,tid,levelNumTrade)之純函數且與求解結果(等效年化盈虧)無關，故同tkid恆對應同一檔名，
 * 存檔端可直接組出檔名以fsIsFile查詢既有策略(O(1))，不需列舉全庫，且更新為原地覆寫，結構上不會出現同tkid多檔
 * 因genTid會剔除`${coin}_`與`${interval}_`樣式，不同幣種或週期之同組keys會得到相同tid，故hash輸入需含coin與interval以避免跨幣種/跨週期碰撞
 * 採定長雜湊係因NTFS單一檔名段上限為255字元(UTF-16計，LongPathsEnabled無法放寬)，keys個數多時舊式`${tid} ⊙ ...`檔名會超限
 * settings目前未參與檔名組成
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-genStrategyFileName.test.mjs Github}
 * @function
 * @param {String} coin 輸入幣種名稱字串，例如'btc'
 * @param {String} interval 輸入K線週期字串，例如'4hr'
 * @param {String} mode 輸入交易方向字串，可選'long'或'short'
 * @param {Array} keys 輸入指標key字串陣列
 * @param {Object} settings 輸入策略設定物件
 * @param {Object} summary 輸入回測統計摘要物件，需含numTrade(交易次數)欄位
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
 * // => 'long_12_9fce6961e8f56493.json'
 * //tid為'long ║ p_ma_1day', 級距為12, hash為md5('btc:4hr:long ║ p_ma_1day:12')前16碼
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

    //hash, 含coin與interval避免跨幣種/跨週期之同名tid碰撞
    let hash = crypto.createHash('md5').update(`${coin}:${interval}:${tid}:${levelNumTrade}`, 'utf8').digest('hex').slice(0, 16)

    //fnStrategy
    let fnStrategy = `${mode}_${levelNumTrade}_${hash}.json`

    return fnStrategy
}


export default genStrategyFileName
