const {execFileSync}=require('node:child_process');
const path=require('node:path');
execFileSync(process.execPath,['tests/safe-update.browser.cjs'],{stdio:'inherit',env:{...process.env,UPDATE_ROOT:path.resolve('.')}});
