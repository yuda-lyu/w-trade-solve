import fs from 'fs'
import path from 'path'


//共用fixtures與工具, 各unit-*.test.mjs引用
//  本檔不帶.test.中綴, 不會被mocha當測試檔抓取


//buildFdTmp: 暫存根資料夾, 各測試檔獨立使用./test/tmp-unit-{函數名}, 結束時整夾刪除,
//  各檔不共用父層, 故平行測試(mocha --parallel)時互不干擾
let buildFdTmp = (name) => path.resolve(`./test/tmp-unit-${name}`)


//st: estim系列所需之設定物件, 以keySettings為鍵取用
let keySettings = 'btc4hr'
let buildSt = () => {
    return {
        [keySettings]: {
            name: 'btc',
            symbol: 'BTCUSDT',
            interval: '4hr',
        },
    }
}


//keyOhlc: 依estimKeys內`${name}_price_${interval}`規則組出之K線序列key
let keyOhlc = 'btc_price_4hr'


//tBase, tStep: 基準起始時間2020-01-01T00:00:00, 每根K線間隔4小時
let tBase = Date.UTC(2020, 0, 1)
let tStep = 4 * 3600 * 1000


//genTimes: 產生n根K線之時間字串序列, 格式'2020-01-01T00:00:00'
let genTimes = (n, opt = {}) => {
    let base = opt.base !== undefined ? opt.base : tBase
    let ts = []
    for (let i = 0; i < n; i++) {
        ts.push(new Date(base + i * tStep).toISOString().slice(0, 19))
    }
    return ts
}


//genArrOhlc: 以sin/cos合成之確定性K線(不用Math.random以確保可重現)
//  Open為前一根Close, High/Low各外擴1, 故止盈止損皆有機會觸發
let genArrOhlc = (n, opt = {}) => {
    let ts = genTimes(n, opt)
    let c = opt.start !== undefined ? opt.start : 100
    let arr = []
    for (let i = 0; i < n; i++) {
        let o = c
        c = Math.max(1, c + Math.sin(i * 0.31) * 2 + Math.cos(i * 0.11) * 1.5)
        arr.push({
            time: ts[i],
            Open: o,
            High: Math.max(o, c) + 1,
            Low: Math.min(o, c) - 1,
            Close: c,
        })
    }
    return arr
}


//genArrParam: 以sin合成之確定性指標序列, 值域[-1,1]落於estimKeys門檻範圍[-2,2]內
let genArrParam = (n, opt = {}) => {
    let ts = genTimes(n, opt)
    let phase = opt.phase !== undefined ? opt.phase : 0
    let arr = []
    for (let i = 0; i < n; i++) {
        arr.push({
            time: ts[i],
            param: Math.sin(i * 0.17 + phase),
        })
    }
    return arr
}


//buildFdData: 於fdTmp/fd內建立data-ohlc(keyOhlc.json)與data-param(各keysParam一檔)與data-strategy
//  keysParam為[{key, phase}]或[key]
let buildFdData = (fdTmp, fd, keysParam, opt = {}) => {
    let n = opt.n !== undefined ? opt.n : 30

    let fdOhlc = path.resolve(fdTmp, fd, 'data-ohlc')
    let fdParam = path.resolve(fdTmp, fd, 'data-param')
    let fdData = path.resolve(fdTmp, fd, 'data-strategy')
    fs.mkdirSync(fdOhlc, { recursive: true })
    fs.mkdirSync(fdParam, { recursive: true })

    let arrOhlc = genArrOhlc(n, opt)
    fs.writeFileSync(path.resolve(fdOhlc, `${keyOhlc}.json`), JSON.stringify(arrOhlc), 'utf8')

    keysParam.forEach((v, i) => {
        let key = typeof v === 'string' ? v : v.key
        let arrParam = genArrParam(n, { ...opt, phase: i * 0.5 })
        fs.writeFileSync(path.resolve(fdParam, `${key}.json`), JSON.stringify(arrParam), 'utf8')
    })

    let timeStart = arrOhlc[0].time
    let timeEnd = arrOhlc[n - 1].time

    return { fdOhlc, fdParam, fdData, timeStart, timeEnd, arrOhlc }
}


export {
    buildFdTmp,
    keySettings,
    buildSt,
    keyOhlc,
    genTimes,
    genArrOhlc,
    genArrParam,
    buildFdData
}
