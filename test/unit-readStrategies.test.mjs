import assert from 'assert'
import fs from 'fs'
import path from 'path'
import readStrategies from '../src/readStrategies.mjs'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import genTid from '../src/genTid.mjs'
import cont from '../src/cont.mjs'
import { buildFdTmp } from './unit-setup.mjs'


//規格來源: src/readStrategies.mjs
//  readStrategies(fd, opt): 列舉fd第1層之檔案並解析策略資訊
//    fd非資料夾時回傳[], 資料夾內無檔案時回傳[]
//    僅列檔案, 資料夾不列入(fsTreeFolder預設levelLimit=1, 故子資料夾內檔案亦不列入)
//    主檔名以wsemi replace剔除全部'.json'後, 依cont.dlmPkgs切段, 依序為tid、levelNumTrade與
//      rEquivalentCumuProfitOrLossFinalNormYear, 三者皆為字串, 缺段者為空字串
//    切不出tid(非wsemi isestr判定之有效字串)者略過
//    tid再依cont.dlmSeps切段, 首段為mode, 其餘為ps
//    tkid為`${tid}:${levelNumTrade}`
//    opt.readContent為true時以data提供檔案內容, 內容非合法json時data為null


let fdTmp = buildFdTmp('readStrategies')


let settings = { uIni: 1000 }


//buildFd: 建立空資料夾並回傳路徑
let buildFd = (fd) => {
    let p = path.resolve(fdTmp, fd)
    fs.mkdirSync(p, { recursive: true })
    return p
}


//writeStrategy: 以genStrategyFileName之規則寫出策略檔
let writeStrategy = (fdData, keys, numTrade, rEq, content = {}) => {
    let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, {
        numTrade,
        rEquivalentCumuProfitOrLossFinalNormYear: rEq,
    })
    fs.writeFileSync(path.resolve(fdData, fn), JSON.stringify(content), 'utf8')
    return fn
}


describe('readStrategies', function() {

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('檔名解析', function() {

        it('讀出genStrategyFileName所寫之策略檔, 各欄位可由檔名反解', function() {
            let fd = buildFd('basic')
            let keys = ['btc_price_4hr_ma_1day']
            let fn = writeStrategy(fd, keys, 30, '31.25%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)

            let tid = genTid('btc', '4hr', 'long', keys)
            assert.strictEqual(ss[0].name, fn)
            assert.strictEqual(ss[0].tid, tid)
            assert.strictEqual(ss[0].levelNumTrade, '12')
            assert.strictEqual(ss[0].tkid, `${tid}:12`)
            assert.strictEqual(ss[0].rEquivalentCumuProfitOrLossFinalNormYear, '31.25%')
        })

        it('levelNumTrade與等效年化盈虧皆為字串, 未轉型', function() {
            let fd = buildFd('str')
            writeStrategy(fd, ['aa'], 30, '31.25%')

            let ss = readStrategies(fd)
            assert.strictEqual(typeof ss[0].levelNumTrade, 'string')
            assert.strictEqual(typeof ss[0].rEquivalentCumuProfitOrLossFinalNormYear, 'string')
        })

        it('tid再依dlmSeps拆為mode與ps', function() {
            let fd = buildFd('modeps')
            //keys經genTid縮寫後為p_ma_1day與i_rsi_4hr
            writeStrategy(fd, ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr'], 30, '10%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].mode, 'long')
            assert.deepStrictEqual(ss[0].ps, ['p_ma_1day', 'i_rsi_4hr'])
        })

        it('單一key時ps僅一元素', function() {
            let fd = buildFd('ps1')
            writeStrategy(fd, ['btc_price_4hr_ma_1day'], 30, '10%')

            let ss = readStrategies(fd)
            assert.deepStrictEqual(ss[0].ps, ['p_ma_1day'])
        })

        it('等效年化盈虧為負值時亦可正確反解', function() {
            let fd = buildFd('neg')
            writeStrategy(fd, ['aa'], 30, '-71.17%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].rEquivalentCumuProfitOrLossFinalNormYear, '-71.17%')
        })

        it('path為絕對路徑, 即使fd以相對路徑給予', function() {
            let fd = buildFd('abs')
            let fn = writeStrategy(fd, ['aa'], 30, '10%')

            let fdRel = path.relative(process.cwd(), fd)
            let ss = readStrategies(fdRel)
            assert.strictEqual(ss[0].path, path.resolve(fd, fn))
            assert.ok(path.isAbsolute(ss[0].path))
        })

        it('同tid不同級距之策略檔各自為一筆, tkid不同', function() {
            let fd = buildFd('levels')
            let keys = ['aa']
            writeStrategy(fd, keys, 20, '10%') //級距11
            writeStrategy(fd, keys, 30, '20%') //級距12

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 2)

            let tid = genTid('btc', '4hr', 'long', keys)
            let tkids = ss.map((v) => {
                return v.tkid
            }).sort()
            assert.deepStrictEqual(tkids, [`${tid}:11`, `${tid}:12`].sort())
            assert.strictEqual(ss[0].tid, ss[1].tid)
        })

        it('與genStrategyFileName可往返: 由讀回之欄位可重組原檔名', function() {
            let fd = buildFd('roundtrip')
            let keys = ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr']
            let fn = writeStrategy(fd, keys, 300, '8.5%')

            let ss = readStrategies(fd)
            let s = ss[0]
            let fnRebuild = `${s.tid}${cont.dlmPkgs}${s.levelNumTrade}${cont.dlmPkgs}${s.rEquivalentCumuProfitOrLossFinalNormYear}.json`
            assert.strictEqual(fnRebuild, fn)
        })

    })

    describe('非策略檔名之處理', function() {

        it('不符檔名規則者仍列入, 缺少之段為空字串', function() {
            //僅要求切得出tid, 故單段檔名亦成立
            let fd = buildFd('loose')
            fs.writeFileSync(path.resolve(fd, 'plain.json'), '{}', 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].tid, 'plain')
            assert.strictEqual(ss[0].levelNumTrade, '')
            assert.strictEqual(ss[0].rEquivalentCumuProfitOrLossFinalNormYear, '')
            assert.strictEqual(ss[0].tkid, 'plain:')
        })

        it('非json副檔名之檔案亦列入, 主檔名未剔除副檔名', function() {
            //僅剔除'.json', 故'.txt'留在tid內
            let fd = buildFd('ext')
            fs.writeFileSync(path.resolve(fd, 'foo.txt'), 'x', 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].tid, 'foo.txt')
        })

        it('檔名內多處.json皆被剔除', function() {
            let fd = buildFd('multi')
            fs.writeFileSync(path.resolve(fd, 'a.jsonb.json'), '{}', 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].tid, 'ab')
        })

        it('主檔名剔除.json後為空字串者被略過', function() {
            let fd = buildFd('emptyname')
            writeStrategy(fd, ['aa'], 30, '10%')
            fs.writeFileSync(path.resolve(fd, '.json'), '{}', 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.notStrictEqual(ss[0].tid, '')
        })

    })

    describe('列舉範圍', function() {

        it('僅列第1層, 子資料夾與其內檔案皆不列入', function() {
            let fd = buildFd('nested')
            writeStrategy(fd, ['aa'], 30, '10%')
            let fdSub = path.resolve(fd, 'sub')
            fs.mkdirSync(fdSub, { recursive: true })
            writeStrategy(fdSub, ['bb'], 30, '10%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.deepStrictEqual(ss[0].ps, ['aa'])
        })

        it('空資料夾回傳空陣列', function() {
            let fd = buildFd('empty')
            assert.deepStrictEqual(readStrategies(fd), [])
        })

        it('僅含子資料夾而無檔案時回傳空陣列', function() {
            let fd = buildFd('onlysub')
            fs.mkdirSync(path.resolve(fd, 'sub'), { recursive: true })
            assert.deepStrictEqual(readStrategies(fd), [])
        })

        it('資料夾不存在時回傳空陣列', function() {
            assert.deepStrictEqual(readStrategies(path.resolve(fdTmp, 'not-exist-folder')), [])
        })

        it('fd非有效字串時回傳空陣列', function() {
            assert.deepStrictEqual(readStrategies(''), [])
            assert.deepStrictEqual(readStrategies(null), [])
            assert.deepStrictEqual(readStrategies(123), [])
        })

    })

    describe('讀取內容', function() {

        it('預設不讀取內容, 無data欄位', function() {
            let fd = buildFd('nodata')
            writeStrategy(fd, ['aa'], 30, '10%', { tid: 'x', fitness: 1.5 })

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].data, undefined)
        })

        it('opt.readContent為true時以data提供檔案內容', function() {
            let fd = buildFd('data')
            let content = { tid: 'x', fitness: 1.5, summary: { numTrade: 30 } }
            writeStrategy(fd, ['aa'], 30, '10%', content)

            let ss = readStrategies(fd, { readContent: true })
            assert.deepStrictEqual(ss[0].data, content)
        })

        it('內容非合法json時data為null', function() {
            let fd = buildFd('badjson')
            fs.writeFileSync(path.resolve(fd, 'bad.json'), 'not-a-json', 'utf8')

            let ss = readStrategies(fd, { readContent: true })
            assert.strictEqual(ss[0].data, null)
        })

    })

})
