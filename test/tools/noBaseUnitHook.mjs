//模組解析鉤子(測試用, 經module.register載入): 回測套件以外之模組取用w-trade-backtest/src/之buildBaseUnitNotional.mjs或calcBaseUnitQuantity.mjs時
//  register之data.mode為'missing'(預設): 解析失敗, 模擬相依之w-trade-backtest為不含兩檔之舊版
//  register之data.mode為'nodefault': buildBaseUnitNotional.mjs改解析為無預設匯出之模組, 模擬該檔存在而預設匯出不是函數
//  register之data.mode為'stub': buildBaseUnitNotional.mjs改解析為替身(檢測同真實, 但回傳之unit(轉型後之選項)改為固定之另一組值), 用於驗「落地之unit取自buildBaseUnitNotional之回傳」(WS-BU-02)
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
    if (mode === 'stub' && specifier === 'w-trade-backtest/src/buildBaseUnitNotional.mjs') {
        //只攔截以裸名之取用; 替身以檔案網址取用真實之檔(非裸名, 不再被此鉤子攔截, 否則自我遞迴), 回傳之unit換成固定之另一組值(與任何輸入之轉型結果皆不同)
        let code = `import real from ${JSON.stringify(r.url)}\nexport default (unit, name) => {\n    let r = real(unit, name)\n    return { ...r, unit: { rule: { stepSize: 0.01, minQty: 0.02, minNotional: 30 }, buffer: 0.25, units: 3 } }\n}\n`
        return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true }
    }
    if (mode === 'nodefault' &&/\/w-trade-backtest\/src\/buildBaseUnitNotional\.mjs$/.test(r.url)) {
        return { url: 'data:text/javascript,export const notDefault = 1', shortCircuit: true }
    }
    if (mode === 'missing' && /\/w-trade-backtest\/src\/(buildBaseUnitNotional|calcBaseUnitQuantity)\.mjs$/.test(r.url)) {
        let err = new Error(`Cannot find module '${specifier}' (simulated by test hook)`)
        err.code = 'ERR_MODULE_NOT_FOUND'
        throw err
    }
    return r
}
