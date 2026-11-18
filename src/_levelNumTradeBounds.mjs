import iseint from 'wsemi/src/iseint.mjs'
import cint from 'wsemi/src/cint.mjs'


//LEVEL_BOUNDS_MAX, 級距下界之個數上限(下界記於每個策略檔之tkid與solve, 故設上限)
let LEVEL_BOUNDS_MAX = 101


//parseLevelNumTradeBounds(內部用, 不入文件): 交易次數級距之邊界(各級距之下界)之檢測與轉換
//  null或undefined回傳null(採預設級距, 同既有)
//  給予者須為非空陣列且至多LEVEL_BOUNDS_MAX個, 各元素為正整數(數字或整數字串, 以iseint判定且>=1), 轉為數值後須嚴格遞增; 各元素只讀取一次(檢測之值即使用之值),
//  通過即回傳轉為數值之新陣列(不改呼叫端之陣列); 無效即throw `invalid ${name}: must be a non-empty array of at most 101 strictly increasing positive integers`(不含輸入值)
let parseLevelNumTradeBounds = (v, name) => {

    if (v === null || v === undefined) {
        return null
    }

    let msg = `invalid ${name}: must be a non-empty array of at most ${LEVEL_BOUNDS_MAX} strictly increasing positive integers`
    if (!Array.isArray(v) || v.length === 0 || v.length > LEVEL_BOUNDS_MAX) {
        throw new Error(msg)
    }

    let bs = []
    for (let i = 0; i < v.length; i++) {
        let b = v[i]
        if (!iseint(b, { min: 1 })) {
            throw new Error(msg)
        }
        b = cint(b)
        if (i > 0 && b <= bs[i - 1]) {
            throw new Error(msg)
        }
        bs.push(b)
    }

    return bs
}


//tagLevelNumTrade(內部用, 不入文件): tkid與檔名雜湊之級距段
//  未給邊界(預設級距)時為級距代碼本身(同既有); 給邊界時為級距代碼後接`@`與以逗號串接之邊界, 使不同級距設定之tkid與檔名互不相同(同一資料夾混用時互不覆寫)
let tagLevelNumTrade = (levelNumTrade, bounds) => {
    if (bounds === null) {
        return `${levelNumTrade}`
    }
    return `${levelNumTrade}@${bounds.join(',')}`
}


export {
    parseLevelNumTradeBounds,
    tagLevelNumTrade,
}
