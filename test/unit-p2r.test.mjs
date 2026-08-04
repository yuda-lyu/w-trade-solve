import assert from 'assert'
import p2r from '../src/p2r.mjs'


//規格來源: src/p2r.mjs
//  p2r(p): 轉換百分比字串為比例數值
//    先經wsemi cstr轉字串, 未含'%'時回傳0(涵蓋無任何交易之空字串)
//    含'%'時剔除第1個'%'後經wsemi cdbl轉數值, 再除以100


describe('p2r', function() {

    it('百分比字串轉為比例數值', function() {
        assert.strictEqual(p2r('31.25%'), 0.3125)
        assert.strictEqual(p2r('100%'), 1)
        assert.strictEqual(p2r('0%'), 0)
    })

    it('負百分比字串轉為負比例數值', function() {
        assert.strictEqual(p2r('-5%'), -0.05)
        assert.strictEqual(p2r('-71.17%'), -0.7117)
    })

    it('未含%之字串回傳0', function() {
        //w-trade-backtest於無任何交易時各比例欄位為空字串
        assert.strictEqual(p2r(''), 0)
        assert.strictEqual(p2r('50'), 0)
        assert.strictEqual(p2r('abc'), 0)
    })

    it('非字串輸入先經cstr轉字串後判斷, 無%故回傳0', function() {
        assert.strictEqual(p2r(50), 0)
        assert.strictEqual(p2r(null), 0)
        assert.strictEqual(p2r(undefined), 0)
    })

    it('超過100%之字串可轉為大於1之比例', function() {
        assert.strictEqual(p2r('250%'), 2.5)
    })

    it('%前非數值時經cdbl轉為0', function() {
        assert.strictEqual(p2r('abc%'), 0)
    })

    it('與calcFitness之用法一致: 勝率百分比字串轉為[0,1]比例', function() {
        //calcFitness以p2r轉rWin後限縮至[0,1]
        assert.strictEqual(p2r('60%'), 0.6)
        assert.strictEqual(p2r('12.5%'), 0.125)
    })

})
