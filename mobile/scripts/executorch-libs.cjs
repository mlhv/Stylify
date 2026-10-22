// Downloads the prebuilt ExecuTorch binaries that react-native-executorch needs.
// Bun does not run dependencies' postinstall scripts, so this runs the library's
// own script by hand, with INIT_CWD set so it reads the "react-native-executorch"
// block in mobile/package.json.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const pkg = require.resolve('react-native-executorch/package.json')
const script = path.join(path.dirname(pkg), 'scripts', 'download-libs.js')

const result = spawnSync('node', [script], {
  stdio: 'inherit',
  env: { ...process.env, INIT_CWD: path.resolve(__dirname, '..') },
})
process.exit(result.status ?? 1)
