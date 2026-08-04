import assert from 'assert'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import genTid from '../src/genTid.mjs'
import calcLevelNumTrade from '../src/calcLevelNumTrade.mjs'
import cont from '../src/cont.mjs'


//規格來源: src/genStrategyFileName.mjs
//  genStrategyFileName(coin, interval, mode, keys, settings, summary):
//    檔名為`${tid}${cont.dlmPkgs}${levelNumTrade}${cont.dlmPkgs}${rEquivalentCumuProfitOrLossFinalNormYear}.json`
//    tid由genTid(coin, interval, mode, keys)產生
//    levelNumTrade由calcLevelNumTrade(cint(summary.numTrade))產生
//    rEquivalentCumuProfitOrLossFinalNormYear直接取自summary, 未經轉換
//    settings未參與檔名組成


let p = cont.dlmPkgs


let settings = { uIni: 1000, uTrade: 1, rTakeProfit: 0.05, rStopLoss: 0.03, rFee: 0.0005 }


describe('genStrategyFileName', function() {

    it('檔名由tid、級距與等效年化盈虧以dlmPkgs串接並附.json', function() {
        let keys = ['btc_price_4hr_ma_1day']
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '31.25%' }
        let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
        assert.strictEqual(fn, `long${cont.dlmSeps}p_ma_1day${p}12${p}31.25%.json`)
    })

    it('tid段與genTid之輸出一致', function() {
        let keys = ['btc_index_rsi_4hr', 'btc_price_4hr_ma_1day']
        let summary = { numTrade: 8, rEquivalentCumuProfitOrLossFinalNormYear: '5%' }
        let fn = genStrategyFileName('btc', '4hr', 'short', keys, settings, summary)
        assert.strictEqual(fn.split(p)[0], genTid('btc', '4hr', 'short', keys))
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

    it('等效年化盈虧原樣帶入, 含負值與%符號', function() {
        let keys = ['aa']
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '-71.17%' }
        let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
        assert.strictEqual(fn, `long${cont.dlmSeps}aa${p}12${p}-71.17%.json`)
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
        assert.strictEqual(a.split(p)[0], b.split(p)[0]) //tid相同
    })

    it('檔名恰可由dlmPkgs切為3段', function() {
        let keys = ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr']
        let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '31.25%' }
        let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
        assert.strictEqual(fn.split(p).length, 3)
    })

    it('summary.numTrade非數值時先經cint轉為0, 級距為0', function() {
        //cint('abc')為0, 故不throw而落於<=0之級距
        let fn = genStrategyFileName('btc', '4hr', 'long', ['aa'], settings, { numTrade: 'abc', rEquivalentCumuProfitOrLossFinalNormYear: '1%' })
        assert.strictEqual(fn.split(p)[1], '0')
    })

})
