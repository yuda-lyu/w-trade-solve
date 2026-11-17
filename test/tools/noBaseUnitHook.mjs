//模組解析鉤子(測試用, 經module.register載入): 回測套件以外之模組取用w-trade-backtest/src/之buildBaseUnitNotional.mjs或calcBaseUnitQuantity.mjs時
//  register之data.mode為'missing'(預設): 解析失敗, 模擬相依之w-trade-backtest為不含兩檔之舊版
//  register之data.mode為'nodefault': buildBaseUnitNotional.mjs改解析為無預設匯出之模組, 模擬該檔存在而預設匯出不是函數
//  回測套件內部之相對取用不受影響
let mode = 'missing'
export async function initialize(data) {
    mode = (data && data.mode) || 'missing'
}
export async function resolve(specifier, context, nextResolve) {
    let r = await nextResolve(specifier, context)
    let parent = String(context.parentURL || '').replace(/\\/g, '/')
    if (/\/node_modules\/w-trade-backtest\//.test(parent)) {
        return r
    }
    if (mode === 'nodefault' && /\/w-trade-backtest\/src\/buildBaseUnitNotional\.mjs$/.test(r.url)) {
        return { url: 'data:text/javascript,export const notDefault = 1', shortCircuit: true }
    }
    if (mode === 'missing' && /\/w-trade-backtest\/src\/(buildBaseUnitNotional|calcBaseUnitQuantity)\.mjs$/.test(r.url)) {
        let err = new Error(`Cannot find module '${specifier}' (simulated by test hook)`)
        err.code = 'ERR_MODULE_NOT_FOUND'
        throw err
    }
    return r
}
