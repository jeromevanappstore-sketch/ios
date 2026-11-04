import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function run(command,args,cwd=root,shell=false){return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,stdio:'inherit',shell});
  child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Android build step failed with code '+code)));
})}
await run(process.execPath,['scripts/build.mjs']);
await run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','android']);
await run(process.execPath,['scripts/postprocess-platforms.mjs']);
await run(process.platform==='win32'?'gradlew.bat':'./gradlew',['assembleDebug','--no-daemon','--console=plain'],path.join(root,'android'),process.platform==='win32');
await fs.mkdir(path.join(root,'downloads'),{recursive:true});
await fs.copyFile(path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk'),path.join(root,'downloads/TFGBC-android-test.apk'));
await fs.mkdir(path.join(root,'site/downloads'),{recursive:true});
await fs.copyFile(path.join(root,'downloads/TFGBC-android-test.apk'),path.join(root,'site/downloads/TFGBC-android-test.apk'));
console.log('Android test installer is ready in downloads/TFGBC-android-test.apk.');
