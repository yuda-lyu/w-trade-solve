import assert from 'assert'
import genSid from '../src/genSid.mjs'
import genTid from '../src/genTid.mjs'
import cont from '../src/cont.mjs'


//規格來源: src/genSid.mjs
//  genSid(coin, interval, mode, conds): 各cond先組為`${key}${sym}${th}`,
//    再以cont.dlmSeps串接mode與各cond, 最後進行與genTid相同之縮寫替換
//    sid已含門檻, 故同組keys之不同門檻對應不同sid


let d = cont.dlmSeps


describe('genSid', function() {

    it('各cond組為 key + sym + th 後以dlmSeps串接', function() {
        let conds = [
            { key: 'aa', sym: '>', th: 0.05 },
            { key: 'bb', sym: '<', th: -0.2 },
        ]
        let sid = genSid('btc', '4hr', 'long', conds)
        assert.strictEqual(sid, `long${d}aa>0.05${d}bb<-0.2`)
    })

    it('縮寫替換與genTid一致', function() {
        let conds = [
            { key: 'btc_price_4hr_ma_1day', sym: '>', th: 0.05 },
            { key: 'btc_index_rsi_4hr', sym: '<', th: -0.2 },
        ]
        let sid = genSid('btc', '4hr', 'long', conds)
        assert.strictEqual(sid, `long${d}p_ma_1day>0.05${d}i_rsi_4hr<-0.2`)
    })

    it('Ohlc_轉o_, Close_轉c_, Volumn_轉v_', function() {
        let conds = [
            { key: 'Ohlc_a', sym: '>', th: 1 },
            { key: 'Close_b', sym: '>', th: 2 },
            { key: 'Volumn_c', sym: '<', th: 3 },
        ]
        let sid = genSid('btc', '4hr', 'long', conds)
        assert.strictEqual(sid, `long${d}o_a>1${d}c_b>2${d}v_c<3`)
    })

    it('conds為空陣列時僅回傳mode', function() {
        assert.strictEqual(genSid('btc', '4hr', 'long', []), 'long')
    })

    it('門檻不同時sid不同, 但對應之tid相同', function() {
        //sid區別門檻, tid區別keys, 兩者為策略之不同層級識別
        let keys = ['btc_price_4hr_ma_1day']
        let condsA = [{ key: keys[0], sym: '>', th: 0.05 }]
        let condsB = [{ key: keys[0], sym: '>', th: 0.35 }]
        assert.notStrictEqual(genSid('btc', '4hr', 'long', condsA), genSid('btc', '4hr', 'long', condsB))
        assert.strictEqual(genTid('btc', '4hr', 'long', keys), genTid('btc', '4hr', 'long', keys))
    })

    it('sym不同時sid不同', function() {
        let condsU = [{ key: 'aa', sym: '>', th: 0.5 }]
        let condsL = [{ key: 'aa', sym: '<', th: 0.5 }]
        assert.notStrictEqual(genSid('btc', '4hr', 'long', condsU), genSid('btc', '4hr', 'long', condsL))
    })

    it('mode為short時開頭為short', function() {
        let conds = [{ key: 'aa', sym: '>', th: 1 }]
        assert.strictEqual(genSid('btc', '4hr', 'short', conds), `short${d}aa>1`)
    })

    it('coin為空字串時替換樣式退化為底線, 將剔除全部底線', function() {
        let conds = [{ key: 'btc_ma_1day', sym: '>', th: 1 }]
        assert.strictEqual(genSid('', '4hr', 'long', conds), `long${d}btcma1day>1`)
    })

})
