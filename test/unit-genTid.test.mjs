import assert from 'assert'
import genTid from '../src/genTid.mjs'
import cont from '../src/cont.mjs'


//規格來源: src/genTid.mjs
//  genTid(coin, interval, mode, keys): 以cont.dlmSeps串接mode與各key, 再進行縮寫替換
//    縮寫替換依序為: 剔除`${coin}_`、剔除`${interval}_`、'price_'轉'p_'、'index_'轉'i_'、
//      'Ohlc_'轉'o_'、'Close_'轉'c_'、'Volumn_'轉'v_'
//    tid僅由mode與keys決定, 未含門檻


let d = cont.dlmSeps


describe('genTid', function() {

    it('以dlmSeps串接mode與各key', function() {
        //無任何可替換樣式時, 僅單純串接
        let tid = genTid('btc', '4hr', 'long', ['aa', 'bb'])
        assert.strictEqual(tid, `long${d}aa${d}bb`)
    })

    it('剔除key內之coin前綴與interval前綴(各帶底線)', function() {
        let tid = genTid('btc', '4hr', 'long', ['btc_ma', '4hr_rsi'])
        assert.strictEqual(tid, `long${d}ma${d}rsi`)
    })

    it('price_轉p_, index_轉i_', function() {
        let tid = genTid('btc', '4hr', 'long', ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr'])
        assert.strictEqual(tid, `long${d}p_ma_1day${d}i_rsi_4hr`)
    })

    it('Ohlc_轉o_, Close_轉c_, Volumn_轉v_', function() {
        let tid = genTid('btc', '4hr', 'long', ['Ohlc_a', 'Close_b', 'Volumn_c'])
        assert.strictEqual(tid, `long${d}o_a${d}c_b${d}v_c`)
    })

    it('mode為short時開頭為short', function() {
        let tid = genTid('btc', '4hr', 'short', ['btc_index_rsi_4hr'])
        assert.strictEqual(tid, `short${d}i_rsi_4hr`)
    })

    it('keys為空陣列時僅回傳mode', function() {
        let tid = genTid('btc', '4hr', 'long', [])
        assert.strictEqual(tid, 'long')
    })

    it('同組keys不論順序以外之任何門檻皆對應同一tid, 故tid可代表策略種類', function() {
        //genTid未取用門檻, 故僅keys相同即同tid
        let keys = ['btc_price_4hr_ma_1day']
        assert.strictEqual(genTid('btc', '4hr', 'long', keys), genTid('btc', '4hr', 'long', keys))
    })

    it('keys順序不同時tid不同', function() {
        let a = genTid('btc', '4hr', 'long', ['btc_ma', 'btc_rsi'])
        let b = genTid('btc', '4hr', 'long', ['btc_rsi', 'btc_ma'])
        assert.notStrictEqual(a, b)
    })

    it('coin為空字串時替換樣式退化為底線, 將剔除全部底線', function() {
        //替換樣式為`${coin}_`, coin為''時樣式即'_'
        let tid = genTid('', '4hr', 'long', ['btc_ma_1day'])
        assert.strictEqual(tid, `long${d}btcma1day`)
    })

    it('key未含coin前綴時不受剔除影響', function() {
        let tid = genTid('eth', '1hr', 'long', ['btc_ma'])
        assert.strictEqual(tid, `long${d}btc_ma`)
    })

})
