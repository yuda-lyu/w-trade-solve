import drop from 'lodash-es/drop.js'
import each from 'lodash-es/each.js'
import filter from 'lodash-es/filter.js'
import get from 'lodash-es/get.js'
import size from 'lodash-es/size.js'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsReadJson from 'wsemi/src/fsReadJson.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import replace from 'wsemi/src/replace.mjs'
import sep from 'wsemi/src/sep.mjs'
import cont from './cont.mjs'


/**
 * 讀取儲存策略資料夾內各策略檔資訊
 *
 * 僅列舉fd第1層之檔案，資料夾不列入，fd非資料夾或無任何檔案時回傳空陣列
 * 各檔以主檔名(剔除'.json')依cont.dlmPkgs切段，依序為tid、levelNumTrade與rEquivalentCumuProfitOrLossFinalNormYear，即genStrategyFileName所產生之檔名，切不出tid者予以略過
 * tid再依cont.dlmSeps切段，首段為mode，其餘為各key所組成之ps
 * tkid為`${tid}:${levelNumTrade}`，與estimKeys內用於判斷同組keys與同交易次數級距之組合方式一致
 *
 * Unit Test: {@link https://github.com/yuda-lyu/w-trade-solve/blob/master/test/unit-readStrategies.test.mjs Github}
 * @function
 * @param {String} fd 輸入儲存策略資料夾字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Boolean} [opt.readContent=false] 輸入是否讀取策略檔內容布林值，為true時各元素額外提供data欄位，內容非合法json時data為null，預設false
 * @returns {Array} 回傳策略資訊陣列，各元素為{path,name,tkid,tid,levelNumTrade,rEquivalentCumuProfitOrLossFinalNormYear,mode,ps}，opt.readContent為true時額外提供data
 * @example
 *
 * import fs from 'fs'
 * import cont from './src/cont.mjs'
 *
 * let fd = './tmp/data-strategy'
 * fs.mkdirSync(fd, { recursive: true })
 *
 * //以genStrategyFileName之檔名規則儲存策略檔
 * let fn = `long${cont.dlmSeps}ma_1day${cont.dlmPkgs}12${cont.dlmPkgs}31.25%.json`
 * fs.writeFileSync(`${fd}/${fn}`, JSON.stringify({ mode: 'long' }), 'utf8')
 *
 * console.log(readStrategies(fd))
 * // => [
 * //   {
 * //     path: './tmp/data-strategy/long ║ ma_1day ⊙ 12 ⊙ 31.25%.json',
 * //     name: 'long ║ ma_1day ⊙ 12 ⊙ 31.25%.json',
 * //     tkid: 'long ║ ma_1day:12',
 * //     tid: 'long ║ ma_1day',
 * //     levelNumTrade: '12',
 * //     rEquivalentCumuProfitOrLossFinalNormYear: '31.25%',
 * //     mode: 'long',
 * //     ps: [ 'ma_1day' ]
 * //   }
 * // ]
 *
 */
let readStrategies = (fd, opt = {}) => {

    //readContent
    let readContent = get(opt, 'readContent', false)

    //check
    if (!fsIsFolder(fd)) {
        console.log(`invalid fd[${fd}]`)
        return []
    }

    //vfps
    let vfps = fsTreeFolder(fd)
    vfps = filter(vfps, { isFolder: false })
    // console.log('vfps', vfps)

    //check
    if (size(vfps) === 0) {
        console.log(`fd[${fd}] no files`)
        return []
    }

    //ss
    let ss = []
    each(vfps, (v) => {

        //qs
        let name = replace(v.name, '.json', '')
        let qs = sep(name, cont.dlmPkgs)

        //tid
        let tid = get(qs, 0, '')

        //check
        if (!isestr(tid)) {
            return true //跳出換下一個
        }

        //levelNumTrade, rEquivalentCumuProfitOrLossFinalNormYear, ps, mode
        let levelNumTrade = get(qs, 1, '')
        let rEquivalentCumuProfitOrLossFinalNormYear = get(qs, 2, '')
        let ps = sep(tid, cont.dlmSeps)
        let mode = get(ps, 0, '')
        ps = drop(ps)

        //tkid
        let tkid = `${tid}:${levelNumTrade}`

        //s
        let s = {
            path: v.path,
            name: v.name,
            tkid,
            tid,
            levelNumTrade,
            rEquivalentCumuProfitOrLossFinalNormYear,
            mode,
            ps,
        }

        //readContent
        if (readContent) {
            let d = fsReadJson(v.path) //回傳{success}或{error}, 讀取或解析失敗時data為null
            s.data = get(d, 'success', null)
        }

        //push
        ss.push(s)

    })

    return ss
}


export default readStrategies
