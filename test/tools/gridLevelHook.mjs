//模組解析鉤子(測試用, 經module.register載入), 依register之data.mode:
//  'omlOk'、'omlBad': 本套件取用w-optimization/src/omlPSO.mjs時改解析為替身最佳化函數(只評估一次; omlOk送入各設計變數之第1個可用值, omlBad另把最後一個設計變數改為非可用值123456.789), 用於驗「解值非可用值時拋invalid x」
//  'omlAll': 同上之取用改解析為另一替身(最後一個設計變數依序取其全部可用值各評估一次), 用於驗「每個可用值之還原(符號與門檻)」與「各key之可用值陣列各一份副本」
//  w-optimization與回測套件內部之相對取用不受影響
let mode = ''
export async function initialize(data) {
    mode = (data && data.mode) || ''
}

let stubOml = (bad) => {
    let code = [
        'export const isStub = true',
        'export default async function (dps, fun) {',
        '    let xs = dps.map((dp) => dp.values[0])',
        bad ? '    xs[xs.length - 1] = 123456.789' : '',
        '    let fitness = await fun(xs)',
        '    return { bestSolution: { ps: xs.map((value) => ({ ind: 0, value })), fitness }, stopMode: \'stub\', stopIteration: 0, stopExecutions: 1 }',
        '}',
    ].join('\n')
    return `data:text/javascript,${encodeURIComponent(code)}`
}

//stubOmlAll: 替身最佳化函數, 其餘設計變數取第1個可用值, 最後一個設計變數依序取其全部可用值各評估一次(供驗每個可用值之還原: 符號與門檻),
//  並把各key設計變數之可用值陣列是否為同一物件(各key應各一份副本)記於globalThis.__omlInfo
let stubOmlAll = () => {
    let code = [
        'export const isStub = true',
        'export default async function (dps, fun) {',
        '    let last = dps[dps.length - 1]',
        '    let base = dps.map((dp) => dp.values[0])',
        '    globalThis.__omlInfo = { shared: dps.length >= 4 ? dps[2].values === dps[3].values : null, nValues: last.values.length, n: last.n }',
        '    let best = null',
        '    for (let j = 0; j < last.values.length; j++) {',
        '        let xs = base.slice()',
        '        xs[xs.length - 1] = last.values[j]',
        '        let fitness = await fun(xs)',
        '        if (best === null || fitness < best.fitness) {',
        '            best = { xs, fitness }',
        '        }',
        '    }',
        '    return { bestSolution: { ps: best.xs.map((value) => ({ ind: 0, value })), fitness: best.fitness }, stopMode: \'stub\', stopIteration: 0, stopExecutions: last.values.length }',
        '}',
    ].join('\n')
    return `data:text/javascript,${encodeURIComponent(code)}`
}

export async function resolve(specifier, context, nextResolve) {
    let parent = String(context.parentURL || '').replace(/\\/g, '/')
    if ((mode === 'omlOk' || mode === 'omlBad') && specifier === 'w-optimization/src/omlPSO.mjs' && !/\/node_modules\/w-optimization\//.test(parent)) {
        return { url: stubOml(mode === 'omlBad'), shortCircuit: true }
    }
    if (mode === 'omlAll' && specifier === 'w-optimization/src/omlPSO.mjs' && !/\/node_modules\/w-optimization\//.test(parent)) {
        return { url: stubOmlAll(), shortCircuit: true }
    }
    return nextResolve(specifier, context)
}
