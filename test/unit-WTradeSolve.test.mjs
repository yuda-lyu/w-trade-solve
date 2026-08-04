import assert from 'assert'
import WTradeSolve from '../src/WTradeSolve.mjs'
import estimFinder from '../src/estimFinder.mjs'
import estimComps from '../src/estimComps.mjs'
import estimPicks from '../src/estimPicks.mjs'
import estimKeys from '../src/estimKeys.mjs'
import readStrategies from '../src/readStrategies.mjs'
import genTid from '../src/genTid.mjs'
import genSid from '../src/genSid.mjs'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import calcLevelNumTrade from '../src/calcLevelNumTrade.mjs'
import calcFitness from '../src/calcFitness.mjs'
import cont from '../src/cont.mjs'


//規格來源: src/WTradeSolve.mjs
//  套件對外匯出之集合, 內部工具p2r與供測試使用之ott不列入


describe('WTradeSolve', function() {

    it('匯出項目與順序符合定義', function() {
        assert.deepStrictEqual(Object.keys(WTradeSolve), [
            'estimFinder',
            'estimComps',
            'estimPicks',
            'estimKeys',
            'readStrategies',
            'genTid',
            'genSid',
            'genStrategyFileName',
            'calcLevelNumTrade',
            'calcFitness',
            'cont',
        ])
    })

    it('各匯出項目即各模組之default', function() {
        assert.strictEqual(WTradeSolve.estimFinder, estimFinder)
        assert.strictEqual(WTradeSolve.estimComps, estimComps)
        assert.strictEqual(WTradeSolve.estimPicks, estimPicks)
        assert.strictEqual(WTradeSolve.estimKeys, estimKeys)
        assert.strictEqual(WTradeSolve.readStrategies, readStrategies)
        assert.strictEqual(WTradeSolve.genTid, genTid)
        assert.strictEqual(WTradeSolve.genSid, genSid)
        assert.strictEqual(WTradeSolve.genStrategyFileName, genStrategyFileName)
        assert.strictEqual(WTradeSolve.calcLevelNumTrade, calcLevelNumTrade)
        assert.strictEqual(WTradeSolve.calcFitness, calcFitness)
        assert.strictEqual(WTradeSolve.cont, cont)
    })

    it('estim系列為async函數, gen與calc系列為同步函數', function() {
        assert.strictEqual(WTradeSolve.estimFinder.constructor.name, 'AsyncFunction')
        assert.strictEqual(WTradeSolve.estimComps.constructor.name, 'AsyncFunction')
        assert.strictEqual(WTradeSolve.estimPicks.constructor.name, 'AsyncFunction')
        assert.strictEqual(WTradeSolve.estimKeys.constructor.name, 'AsyncFunction')
        assert.strictEqual(WTradeSolve.genTid.constructor.name, 'Function')
        assert.strictEqual(WTradeSolve.genSid.constructor.name, 'Function')
        assert.strictEqual(WTradeSolve.genStrategyFileName.constructor.name, 'Function')
        assert.strictEqual(WTradeSolve.calcLevelNumTrade.constructor.name, 'Function')
        assert.strictEqual(WTradeSolve.calcFitness.constructor.name, 'Function')
        assert.strictEqual(WTradeSolve.readStrategies.constructor.name, 'Function')
    })

    it('cont提供tid與檔名所用之兩種分隔字串', function() {
        assert.strictEqual(typeof WTradeSolve.cont.dlmSeps, 'string')
        assert.strictEqual(typeof WTradeSolve.cont.dlmPkgs, 'string')
        assert.notStrictEqual(WTradeSolve.cont.dlmSeps, WTradeSolve.cont.dlmPkgs)
    })

    it('cont之分隔字串不含檔名不可用字元, 使策略檔名可寫出', function() {
        //Windows與POSIX共同之檔名不可用字元
        let bad = /[<>:"/\\|?*]/
        assert.doesNotMatch(WTradeSolve.cont.dlmSeps, bad)
        assert.doesNotMatch(WTradeSolve.cont.dlmPkgs, bad)
    })

    it('內部工具p2r與供測試使用之ott不列入匯出', function() {
        assert.strictEqual(WTradeSolve.p2r, undefined)
        assert.strictEqual(WTradeSolve.ott, undefined)
    })

})
