import assert from 'assert'
import calcLevelNumTrade from '../src/calcLevelNumTrade.mjs'


//規格來源: src/calcLevelNumTrade.mjs
//  calcLevelNumTrade(numTrade): 交易次數轉為級距代碼
//    numTrade非wsemi isnum判定之數值時throw, 通過後先經wsemi cint轉整數(四捨五入)
//    級距: <=0→0, 1-5→1, 6-9→2, 10-24→11, 25-49→12, 50-74→13, 75-99→14,
//          100-249→101, 250-499→102, 500-749→103, 750-999→104,
//          1000-1999→1001, 2000-2999→1002, 3000-3999→1003, 4000-4999→1004, >=5000→100


describe('calcLevelNumTrade', function() {

    it('各級距之下界與上界皆對應規格代碼', function() {
        let kp = [
            [0, 0],
            [1, 1], [5, 1],
            [6, 2], [9, 2],
            [10, 11], [24, 11],
            [25, 12], [49, 12],
            [50, 13], [74, 13],
            [75, 14], [99, 14],
            [100, 101], [249, 101],
            [250, 102], [499, 102],
            [500, 103], [749, 103],
            [750, 104], [999, 104],
            [1000, 1001], [1999, 1001],
            [2000, 1002], [2999, 1002],
            [3000, 1003], [3999, 1003],
            [4000, 1004], [4999, 1004],
            [5000, 100],
        ]
        kp.forEach(([numTrade, level]) => {
            assert.strictEqual(calcLevelNumTrade(numTrade), level, `numTrade[${numTrade}]`)
        })
    })

    it('負數交易次數視同0, 級距為0', function() {
        assert.strictEqual(calcLevelNumTrade(-1), 0)
        assert.strictEqual(calcLevelNumTrade(-100), 0)
    })

    it('超過5000之交易次數皆為級距100', function() {
        assert.strictEqual(calcLevelNumTrade(8000), 100)
        assert.strictEqual(calcLevelNumTrade(1000000), 100)
    })

    it('非整數先經cint四捨五入後再判級距', function() {
        //cint(5.6)=6 落於6-9區間, cint(5.4)=5 落於1-5區間
        assert.strictEqual(calcLevelNumTrade(5.6), 2)
        assert.strictEqual(calcLevelNumTrade(5.4), 1)
    })

    it('可解析之數字字串亦為isnum認可之數值', function() {
        assert.strictEqual(calcLevelNumTrade('30'), 12)
    })

    it('非數值時throw', function() {
        assert.throws(() => {
            calcLevelNumTrade('abc')
        }, /is not a number/)
        assert.throws(() => {
            calcLevelNumTrade(null)
        }, /is not a number/)
        assert.throws(() => {
            calcLevelNumTrade(undefined)
        }, /is not a number/)
        assert.throws(() => {
            calcLevelNumTrade(NaN)
        }, /is not a number/)
    })

    it('級距代碼非單調遞增, 但同級距內恆為同一代碼', function() {
        //10-24與25-49皆對應11與12, 代碼僅為分群標記
        assert.strictEqual(calcLevelNumTrade(10), calcLevelNumTrade(24))
        assert.notStrictEqual(calcLevelNumTrade(24), calcLevelNumTrade(25))
    })

})
