// import path from 'path'
import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


async function rp() {

    await rollupFiles({ //rollupFiles預設會clean folder
        fns: 'WTradeSolve.mjs',
        fdSrc,
        fdTar,
        nameDistType: 'kebabCase',
        runin: 'nodejs', //本套件以fs讀寫策略檔與掃描資料夾, 僅能於nodejs執行
        // bNodePolyfill: true,
        // bMinify: false,
        globals: {
            path: 'path',
            fs: 'fs',
        },
        external: [
            'path',
            'fs',
        ],
    })
        .catch((err) => {
            console.log(err)
        })

}
rp()
    .catch((err) => {
        console.log(err)
    })

