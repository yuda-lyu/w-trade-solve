import assert from 'assert'
import calcFitness from '../src/calcFitness.mjs'


//規格來源: src/calcFitness.mjs
//  calcFitness(settings, summary): 回傳適應值, 越小越佳
//    ratioWin = clamp(p2r(summary.rWin), 0, 1), 貢獻 2*(1-ratioWin)
//    rEqYear = clamp(p2r(summary.rEquivalentCumuProfitOrLossFinalNormYear), 0, 0.5)/0.5, 貢獻 1*(1-rEqYear)
//    故無懲罰時fitness落於[0,3]
//    summary.numTrade(經cint)為0時加1000000
//    summary.uEquityFinal - settings.uIni <= 0 時加1000000


let approx = (a, b, tol = 1e-9) => Math.abs(a - b) < tol


//buildSummary: 預設為有交易且有獲利, 故不觸發任何懲罰
let buildSummary = (opt = {}) => {
    return {
        numTrade: opt.numTrade !== undefined ? opt.numTrade : 30,
        uEquityFinal: opt.uEquityFinal !== undefined ? opt.uEquityFinal : 1200,
        rWin: opt.rWin !== undefined ? opt.rWin : '60%',
        rEquivalentCumuProfitOrLossFinalNormYear: opt.rEq !== undefined ? opt.rEq : '25%',
    }
}


let settings = { uIni: 1000 }


describe('calcFitness', function() {

    it('勝率與等效年化盈虧兩項加權求和: 2*(1-0.6) + 1*(1-0.25/0.5) = 1.3', function() {
        let fitness = calcFitness(settings, buildSummary())
        assert.ok(approx(fitness, 1.3), `實得 ${fitness}`)
    })

    it('勝率100%且等效年化盈虧達50%時fitness為下界0', function() {
        let fitness = calcFitness(settings, buildSummary({ rWin: '100%', rEq: '50%' }))
        assert.ok(approx(fitness, 0), `實得 ${fitness}`)
    })

    it('勝率0%且等效年化盈虧0%但仍有獲利時fitness為無懲罰之上界3', function() {
        //uEquityFinal > uIni 故不觸發懲罰
        let fitness = calcFitness(settings, buildSummary({ rWin: '0%', rEq: '0%' }))
        assert.ok(approx(fitness, 3), `實得 ${fitness}`)
    })

    it('等效年化盈虧超過50%時限縮至50%, 與50%同值', function() {
        let a = calcFitness(settings, buildSummary({ rEq: '80%' }))
        let b = calcFitness(settings, buildSummary({ rEq: '50%' }))
        assert.ok(approx(a, b), `${a} vs ${b}`)
    })

    it('等效年化盈虧為負時限縮至0, 與0%同值', function() {
        let a = calcFitness(settings, buildSummary({ rEq: '-30%' }))
        let b = calcFitness(settings, buildSummary({ rEq: '0%' }))
        assert.ok(approx(a, b), `${a} vs ${b}`)
    })

    it('勝率超過100%時限縮至100%, 為負時限縮至0%', function() {
        let hi = calcFitness(settings, buildSummary({ rWin: '150%' }))
        let hiRef = calcFitness(settings, buildSummary({ rWin: '100%' }))
        assert.ok(approx(hi, hiRef), `${hi} vs ${hiRef}`)

        let lo = calcFitness(settings, buildSummary({ rWin: '-20%' }))
        let loRef = calcFitness(settings, buildSummary({ rWin: '0%' }))
        assert.ok(approx(lo, loRef), `${lo} vs ${loRef}`)
    })

    it('勝率越高fitness越小, 等效年化盈虧越高fitness越小', function() {
        let a = calcFitness(settings, buildSummary({ rWin: '40%' }))
        let b = calcFitness(settings, buildSummary({ rWin: '80%' }))
        assert.ok(b < a, `勝率高者應較小: ${b} < ${a}`)

        let c = calcFitness(settings, buildSummary({ rEq: '10%' }))
        let e = calcFitness(settings, buildSummary({ rEq: '40%' }))
        assert.ok(e < c, `年化高者應較小: ${e} < ${c}`)
    })

    it('勝率之權重為等效年化盈虧之2倍', function() {
        //勝率自0%升至100%減少2, 年化自0%升至50%減少1
        let base = calcFitness(settings, buildSummary({ rWin: '0%', rEq: '0%' }))
        let byWin = calcFitness(settings, buildSummary({ rWin: '100%', rEq: '0%' }))
        let byEq = calcFitness(settings, buildSummary({ rWin: '0%', rEq: '50%' }))
        assert.ok(approx(base - byWin, 2), `勝率貢獻 ${base - byWin}`)
        assert.ok(approx(base - byEq, 1), `年化貢獻 ${base - byEq}`)
    })

    it('交易次數為0時加懲罰值1000000', function() {
        let withTrade = calcFitness(settings, buildSummary({ numTrade: 1 }))
        let noTrade = calcFitness(settings, buildSummary({ numTrade: 0 }))
        assert.ok(approx(noTrade - withTrade, 1000000), `差值 ${noTrade - withTrade}`)
    })

    it('最終累計盈虧小於等於0時加懲罰值1000000, 邊界(相等)亦觸發', function() {
        let profit = calcFitness(settings, buildSummary({ uEquityFinal: 1000.01 }))
        let flat = calcFitness(settings, buildSummary({ uEquityFinal: 1000 }))
        let loss = calcFitness(settings, buildSummary({ uEquityFinal: 900 }))
        assert.ok(approx(flat - profit, 1000000), `相等時差值 ${flat - profit}`)
        assert.ok(approx(loss - profit, 1000000), `虧損時差值 ${loss - profit}`)
    })

    it('無交易且無獲利時兩懲罰值皆觸發', function() {
        //rWin與rEq皆為空字串(w-trade-backtest於無交易時之值), p2r回0, 故基底為2*1+1*1=3
        let fitness = calcFitness(settings, {
            numTrade: 0,
            uEquityFinal: 1000,
            rWin: '',
            rEquivalentCumuProfitOrLossFinalNormYear: '',
        })
        assert.ok(approx(fitness, 2000003), `實得 ${fitness}`)
    })

    it('交易次數為可解析之數字字串時亦正確判斷懲罰', function() {
        let a = calcFitness(settings, buildSummary({ numTrade: '0' }))
        let b = calcFitness(settings, buildSummary({ numTrade: '5' }))
        assert.ok(approx(a - b, 1000000), `差值 ${a - b}`)
    })

})
