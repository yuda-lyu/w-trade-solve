import assert from 'assert'
import crypto from 'crypto'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import genTid from '../src/genTid.mjs'
import calcLevelNumTrade from '../src/calcLevelNumTrade.mjs'


//規格來源: src/genStrategyFileName.mjs
//  genStrategyFileName(coin, interval, mode, keys, settings, summary):
//    檔名為`${mode}_${levelNumTrade}_${hash}.json`
//    hash為md5(`${coin}:${interval}:${tid}:${levelNumTrade}`)取前16碼(64bits)
//    tid由genTid(coin, interval, mode, keys)產生
//    levelNumTrade由calcLevelNumTrade(cint(summary.numTrade))產生
//    檔名為(coin,interval,tid,levelNumTrade)之純函數, 與求解結果(等效年化盈虧)無關, 故同tkid恆對應同一檔名
//    hash輸入含coin與interval, 使genTid剔除幣種與週期後相同之tid不致跨幣種/跨週期碰撞
//    settings未參與檔名組成


let p = '_'


let settings = { uIni: 1000, uTrade: 1, rTakeProfit: 0.05, rStopLoss: 0.03, rFee: 0.0005 }


//buildFn: 依規格自行組出預期檔名
let buildFn = (coin, interval, mode, keys, numTrade) => {
    let tid = genTid(coin, interval, mode, keys)
    let levelNumTrade = calcLevelNumTrade(numTrade)
    let hash = crypto.createHash('md5').update(`${coin}:${interval}:${tid}:${levelNumTrade}`, 'utf8').digest('hex').slice(0, 16)
    return `${mode}${p}${levelNumTrade}${p}${hash}.json`
}


describe('genStrategyFileName', function() {

    it('檔名為mode、級距與雜湊16碼以底線串接並附.json', function() {
        let keys = ['btc_price_4hr_ma_1day']
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '31.25%' }
        let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
        //tid為'long ║ p_ma_1day', 級距12, hash=md5('btc:4hr:long ║ p_ma_1day:12')前16碼
        assert.strictEqual(fn, 'long_12_9fce6961e8f56493.json')
    })

    it('檔名符合`${mode}_${levelNumTrade}_${hash16}.json`樣式', function() {
        let keys = ['btc_index_rsi_4hr', 'btc_price_4hr_ma_1day']
        let summary = { numTrade: 8, rEquivalentCumuProfitOrLossFinalNormYear: '5%' }
        let fn = genStrategyFileName('btc', '4hr', 'short', keys, settings, summary)
        assert.match(fn, /^short_2_[0-9a-f]{16}\.json$/)
    })

    it('雜湊段依規格為md5(`${coin}:${interval}:${tid}:${levelNumTrade}`)前16碼, 可由genTid與calcLevelNumTrade重組', function() {
        let keys = ['btc_index_rsi_4hr', 'btc_price_4hr_ma_1day']
        let nums = [0, 3, 30, 120, 3500, 9000]
        nums.forEach((numTrade) => {
            let summary = { numTrade, rEquivalentCumuProfitOrLossFinalNormYear: '1%' }
            let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
            assert.strictEqual(fn, buildFn('btc', '4hr', 'long', keys, numTrade), `numTrade[${numTrade}]`)
        })
    })

    it('級距段與calcLevelNumTrade之輸出一致', function() {
        let keys = ['aa']
        let nums = [0, 3, 30, 120, 3500, 9000]
        nums.forEach((numTrade) => {
            let summary = { numTrade, rEquivalentCumuProfitOrLossFinalNormYear: '1%' }
            let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
            assert.strictEqual(fn.split(p)[1], String(calcLevelNumTrade(numTrade)), `numTrade[${numTrade}]`)
        })
    })

    it('等效年化盈虧不影響檔名, 同tkid恆對應同一檔名', function() {
        //此為O(1)直查與原地覆寫之基礎: 同tkid之新舊策略檔名相同
        let keys = ['aa']
        let a = genStrategyFileName('btc', '4hr', 'long', keys, settings, { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' })
        let b = genStrategyFileName('btc', '4hr', 'long', keys, settings, { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '-71.17%' })
        assert.strictEqual(a, b)
    })

    it('settings不影響檔名', function() {
        let keys = ['aa']
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' }
        let a = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
        let b = genStrategyFileName('btc', '4hr', 'long', keys, { uIni: 99999 }, summary)
        assert.strictEqual(a, b)
    })

    it('同tid但交易次數落於不同級距時, 檔名不同, 故可各自保留最佳策略', function() {
        let keys = ['aa']
        let a = genStrategyFileName('btc', '4hr', 'long', keys, settings, { numTrade: 20, rEquivalentCumuProfitOrLossFinalNormYear: '10%' })
        let b = genStrategyFileName('btc', '4hr', 'long', keys, settings, { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' })
        assert.notStrictEqual(a, b)
    })

    it('不同幣種或週期之同組keys檔名不同, 不因genTid剔除幣種與週期而碰撞', function() {
        //genTid('eth','4hr',...,['eth_price_4hr_ma_1day'])與genTid('btc','4hr',...,['btc_price_4hr_ma_1day'])同為'long ║ p_ma_1day',
        //  hash輸入含coin與interval, 故檔名仍不同
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' }
        let a = genStrategyFileName('eth', '4hr', 'long', ['eth_price_4hr_ma_1day'], settings, summary)
        let b = genStrategyFileName('btc', '4hr', 'long', ['btc_price_4hr_ma_1day'], settings, summary)
        let c = genStrategyFileName('btc', '1hr', 'long', ['btc_price_1hr_ma_1day'], settings, summary)
        assert.strictEqual(genTid('eth', '4hr', 'long', ['eth_price_4hr_ma_1day']), genTid('btc', '4hr', 'long', ['btc_price_4hr_ma_1day'])) //tid確實相同
        assert.notStrictEqual(a, b)
        assert.notStrictEqual(b, c)
    })

    it('keys個數多且名稱長時檔名長度仍固定, 不受NTFS單檔名段255字元上限影響', function() {
        //舊式檔名隨keys個數線性成長, 7因子已達約240字元; 雜湊檔名恆為`${mode}_${級距}_${16碼}.json`
        let keys = []
        for (let i = 0; i < 20; i++) {
            keys.push(`btc_price_4hr_someVeryLongIndicatorName${i}_15day`)
        }
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' }
        let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
        assert.match(fn, /^long_12_[0-9a-f]{16}\.json$/)
        assert.ok(fn.length <= 40, `檔名長度 ${fn.length} 須固定短`)
    })

    it('summary.numTrade非數值時先經cint轉為0, 級距為0', function() {
        //cint('abc')為0, 故不throw而落於<=0之級距
        let fn = genStrategyFileName('btc', '4hr', 'long', ['aa'], settings, { numTrade: 'abc', rEquivalentCumuProfitOrLossFinalNormYear: '1%' })
        assert.strictEqual(fn.split(p)[1], '0')
    })

})
