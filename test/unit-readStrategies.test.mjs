import assert from 'assert'
import fs from 'fs'
import path from 'path'
import readStrategies from '../src/readStrategies.mjs'
import genStrategyFileName from '../src/genStrategyFileName.mjs'
import genTid from '../src/genTid.mjs'
import calcLevelNumTrade from '../src/calcLevelNumTrade.mjs'
import cont from '../src/cont.mjs'
import { buildFdTmp } from './unit-setup.mjs'


//規格來源: src/readStrategies.mjs
//  readStrategies(fd, opt): 列舉fd第1層之檔案並解析策略資訊
//    fd非資料夾時回傳[], 資料夾內無檔案時回傳[]
//    僅列檔案, 資料夾不列入(fsTreeFolder預設levelLimit=1, 故子資料夾內檔案亦不列入)
//    opt.fromContent決定解析來源, 可選'filename'|'content'|'auto'(預設):
//      'filename': 主檔名以wsemi replace剔除全部'.json'後依cont.dlmPkgs切段, 依序為tid、levelNumTrade與
//        rEquivalentCumuProfitOrLossFinalNormYear, 三者皆為字串, 缺段者為空字串, 切不出tid者略過
//      'content': 讀檔內json之tid、tkid、levelNumTrade與summary.rEquivalentCumuProfitOrLossFinalNormYear,
//        levelNumTrade轉為字串, 無tkid欄位時由tid與levelNumTrade組出, 非合法json或無tid者略過
//      'auto': 檔名符合`^(long|short)_\d+_[0-9a-f]{16}\.json$`者走'content', 其餘走'filename'
//    tid再依cont.dlmSeps切段, 首段為mode, 其餘為ps
//    tkid為`${tid}:${levelNumTrade}`
//    opt.readContent為true時以data提供檔案內容


let fdTmp = buildFdTmp('readStrategies')


let settings = { uIni: 1000 }


//buildFd: 建立空資料夾並回傳路徑
let buildFd = (fd) => {
    let p = path.resolve(fdTmp, fd)
    fs.mkdirSync(p, { recursive: true })
    return p
}


//writeStrategyNew: 以genStrategyFileName之雜湊檔名規則寫出策略檔, 內容含識別欄位(同estimKeys所寫出者)
let writeStrategyNew = (fdData, keys, numTrade, rEq, extra = {}) => {
    let summary = {
        numTrade,
        rEquivalentCumuProfitOrLossFinalNormYear: rEq,
    }
    let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
    let tid = genTid('btc', '4hr', 'long', keys)
    let levelNumTrade = calcLevelNumTrade(numTrade)
    let content = {
        tid,
        tkid: `${tid}:${levelNumTrade}`,
        levelNumTrade,
        mode: 'long',
        summary,
        ...extra,
    }
    fs.writeFileSync(path.resolve(fdData, fn), JSON.stringify(content), 'utf8')
    return { fn, tid, levelNumTrade, content }
}


//writeStrategyLegacy: 以舊式`${tid} ⊙ ${levelNumTrade} ⊙ ${rEq}.json`檔名規則寫出策略檔
let writeStrategyLegacy = (fdData, keys, numTrade, rEq, content = {}) => {
    let tid = genTid('btc', '4hr', 'long', keys)
    let levelNumTrade = calcLevelNumTrade(numTrade)
    let fn = `${tid}${cont.dlmPkgs}${levelNumTrade}${cont.dlmPkgs}${rEq}.json`
    fs.writeFileSync(path.resolve(fdData, fn), JSON.stringify(content), 'utf8')
    return { fn, tid, levelNumTrade }
}


describe('readStrategies', function() {

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('新格式(雜湊檔名, auto走content)', function() {

        it('讀出genStrategyFileName所寫之策略檔, 各欄位取自檔內json', function() {
            let fd = buildFd('new-basic')
            let keys = ['btc_price_4hr_ma_1day']
            let { fn, tid } = writeStrategyNew(fd, keys, 30, '31.25%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].name, fn)
            assert.strictEqual(ss[0].tid, tid)
            assert.strictEqual(ss[0].levelNumTrade, '12')
            assert.strictEqual(ss[0].tkid, `${tid}:12`)
            assert.strictEqual(ss[0].rEquivalentCumuProfitOrLossFinalNormYear, '31.25%')
        })

        it('levelNumTrade與等效年化盈虧皆轉為與檔名反解一致之字串', function() {
            let fd = buildFd('new-str')
            writeStrategyNew(fd, ['aa'], 30, '31.25%')

            let ss = readStrategies(fd)
            assert.strictEqual(typeof ss[0].levelNumTrade, 'string')
            assert.strictEqual(typeof ss[0].rEquivalentCumuProfitOrLossFinalNormYear, 'string')
        })

        it('tid依dlmSeps拆為mode與ps', function() {
            let fd = buildFd('new-modeps')
            //keys經genTid縮寫後為p_ma_1day與i_rsi_4hr
            writeStrategyNew(fd, ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr'], 30, '10%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].mode, 'long')
            assert.deepStrictEqual(ss[0].ps, ['p_ma_1day', 'i_rsi_4hr'])
        })

        it('內容無tkid欄位時由tid與levelNumTrade組出', function() {
            let fd = buildFd('new-notkid')
            let keys = ['aa']
            let summary = { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' }
            let fn = genStrategyFileName('btc', '4hr', 'long', keys, settings, summary)
            let tid = genTid('btc', '4hr', 'long', keys)
            fs.writeFileSync(path.resolve(fd, fn), JSON.stringify({ tid, levelNumTrade: 12, summary }), 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].tkid, `${tid}:12`)
        })

        it('同tid不同級距之策略檔各自為一筆, tkid不同', function() {
            let fd = buildFd('new-levels')
            let keys = ['aa']
            writeStrategyNew(fd, keys, 20, '10%') //級距11
            writeStrategyNew(fd, keys, 30, '20%') //級距12

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 2)

            let tid = genTid('btc', '4hr', 'long', keys)
            let tkids = ss.map((v) => {
                return v.tkid
            }).sort()
            assert.deepStrictEqual(tkids, [`${tid}:11`, `${tid}:12`].sort())
        })

        it('雜湊檔名但內容非合法json者略過', function() {
            let fd = buildFd('new-badjson')
            writeStrategyNew(fd, ['aa'], 30, '10%')
            fs.writeFileSync(path.resolve(fd, 'long_12_0123456789abcdef.json'), 'not-a-json', 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
        })

        it('雜湊檔名但內容無tid欄位者略過', function() {
            let fd = buildFd('new-notid')
            fs.writeFileSync(path.resolve(fd, 'long_12_0123456789abcdef.json'), '{}', 'utf8')

            let ss = readStrategies(fd)
            assert.deepStrictEqual(ss, [])
        })

    })

    describe('舊格式(dlmPkgs檔名, auto走filename)', function() {

        it('讀出舊式檔名之策略檔, 各欄位可由檔名反解', function() {
            let fd = buildFd('legacy-basic')
            let keys = ['btc_price_4hr_ma_1day']
            let { fn, tid } = writeStrategyLegacy(fd, keys, 30, '31.25%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].name, fn)
            assert.strictEqual(ss[0].tid, tid)
            assert.strictEqual(ss[0].levelNumTrade, '12')
            assert.strictEqual(ss[0].tkid, `${tid}:12`)
            assert.strictEqual(ss[0].rEquivalentCumuProfitOrLossFinalNormYear, '31.25%')
        })

        it('等效年化盈虧為負值時亦可正確反解', function() {
            let fd = buildFd('legacy-neg')
            writeStrategyLegacy(fd, ['aa'], 30, '-71.17%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].rEquivalentCumuProfitOrLossFinalNormYear, '-71.17%')
        })

        it('path為絕對路徑, 即使fd以相對路徑給予', function() {
            let fd = buildFd('legacy-abs')
            let { fn } = writeStrategyLegacy(fd, ['aa'], 30, '10%')

            let fdRel = path.relative(process.cwd(), fd)
            let ss = readStrategies(fdRel)
            assert.strictEqual(ss[0].path, path.resolve(fd, fn))
            assert.ok(path.isAbsolute(ss[0].path))
        })

        it('與舊檔名規則可往返: 由讀回之欄位可重組原檔名', function() {
            let fd = buildFd('legacy-roundtrip')
            let keys = ['btc_price_4hr_ma_1day', 'btc_index_rsi_4hr']
            let { fn } = writeStrategyLegacy(fd, keys, 300, '8.5%')

            let ss = readStrategies(fd)
            let s = ss[0]
            let fnRebuild = `${s.tid}${cont.dlmPkgs}${s.levelNumTrade}${cont.dlmPkgs}${s.rEquivalentCumuProfitOrLossFinalNormYear}.json`
            assert.strictEqual(fnRebuild, fn)
        })

    })

    describe('新舊格式混存', function() {

        it('auto模式下新舊格式皆正確列舉', function() {
            let fd = buildFd('mixed')
            let { tid: tidNew } = writeStrategyNew(fd, ['btc_price_4hr_ma_1day'], 30, '10%')
            let { tid: tidLegacy } = writeStrategyLegacy(fd, ['btc_index_rsi_4hr'], 20, '20%')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 2)

            let tkids = ss.map((v) => {
                return v.tkid
            }).sort()
            assert.deepStrictEqual(tkids, [`${tidNew}:12`, `${tidLegacy}:11`].sort())
        })

    })

    describe('fromContent選項', function() {

        it("fromContent為'filename'時雜湊檔名不讀內容, 整個主檔名成為tid", function() {
            let fd = buildFd('fc-filename')
            let { fn } = writeStrategyNew(fd, ['aa'], 30, '10%')

            let ss = readStrategies(fd, { fromContent: 'filename' })
            assert.strictEqual(ss.length, 1)
            //雜湊檔名內無dlmPkgs, 故主檔名整段為tid, 其餘欄位為空字串
            assert.strictEqual(ss[0].tid, fn.slice(0, -5))
            assert.strictEqual(ss[0].levelNumTrade, '')
        })

        it("fromContent為'content'時舊式檔名亦讀內容, 內容具tid欄位者以內容為準", function() {
            let fd = buildFd('fc-content')
            let keys = ['btc_price_4hr_ma_1day']
            let tid = genTid('btc', '4hr', 'long', keys)
            writeStrategyLegacy(fd, keys, 30, '10%', {
                tid,
                tkid: `${tid}:12`,
                levelNumTrade: 12,
                summary: { numTrade: 30, rEquivalentCumuProfitOrLossFinalNormYear: '10%' },
            })

            let ss = readStrategies(fd, { fromContent: 'content' })
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].tid, tid)
            assert.strictEqual(ss[0].tkid, `${tid}:12`)
        })

        it("fromContent為'content'時內容無tid欄位者略過", function() {
            let fd = buildFd('fc-content-skip')
            writeStrategyLegacy(fd, ['aa'], 30, '10%', {}) //舊檔內容無識別欄位

            let ss = readStrategies(fd, { fromContent: 'content' })
            assert.deepStrictEqual(ss, [])
        })

        it("fromContent非三值之一時採'auto'", function() {
            let fd = buildFd('fc-fallback')
            let { tid } = writeStrategyNew(fd, ['aa'], 30, '10%')

            let ss = readStrategies(fd, { fromContent: 'xxx' })
            assert.strictEqual(ss.length, 1)
            assert.strictEqual(ss[0].tid, tid)
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
            writeStrategyNew(fd, ['aa'], 30, '10%')
            fs.writeFileSync(path.resolve(fd, '.json'), '{}', 'utf8')

            let ss = readStrategies(fd)
            assert.strictEqual(ss.length, 1)
            assert.notStrictEqual(ss[0].tid, '')
        })

    })

    describe('列舉範圍', function() {

        it('僅列第1層, 子資料夾與其內檔案皆不列入', function() {
            let fd = buildFd('nested')
            writeStrategyNew(fd, ['aa'], 30, '10%')
            let fdSub = path.resolve(fd, 'sub')
            fs.mkdirSync(fdSub, { recursive: true })
            writeStrategyNew(fdSub, ['bb'], 30, '10%')

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
            writeStrategyNew(fd, ['aa'], 30, '10%', { fitness: 1.5 })

            let ss = readStrategies(fd)
            assert.strictEqual(ss[0].data, undefined)
        })

        it('opt.readContent為true時以data提供檔案內容(新格式)', function() {
            let fd = buildFd('data-new')
            let { content } = writeStrategyNew(fd, ['aa'], 30, '10%', { fitness: 1.5 })

            let ss = readStrategies(fd, { readContent: true })
            assert.deepStrictEqual(ss[0].data, content)
        })

        it('opt.readContent為true時以data提供檔案內容(舊格式)', function() {
            let fd = buildFd('data-legacy')
            let content = { tid: 'x', fitness: 1.5, summary: { numTrade: 30 } }
            writeStrategyLegacy(fd, ['aa'], 30, '10%', content)

            let ss = readStrategies(fd, { readContent: true })
            assert.deepStrictEqual(ss[0].data, content)
        })

        it('舊式檔名內容非合法json時data為null', function() {
            let fd = buildFd('badjson')
            fs.writeFileSync(path.resolve(fd, 'bad.json'), 'not-a-json', 'utf8')

            let ss = readStrategies(fd, { readContent: true })
            assert.strictEqual(ss[0].data, null)
        })

    })

})
