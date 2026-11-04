import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=path.resolve(root,'../../outputs/tfgbc-church-management');
const source=path.join(root,'source');
await fs.mkdir(source,{recursive:true});
// Retain a portable source snapshot; future builds don't depend on this chat's workspace.
try{await fs.access(path.join(source,'index.html'))}catch{
  for(const name of ['index.html','favicon.svg'])await fs.copyFile(path.join(original,name),path.join(source,name));
}
let html=await fs.readFile(path.join(source,'index.html'),'utf8');
let app=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!app)throw new Error('Church application script missing.');
app=app.split('/* ========== Boot ========== */')[0];
function change(before,after){if(!app.includes(before))throw new Error('Source adapter needs review: '+before.slice(0,70));app=app.replace(before,after)}
change('function download(name,text,type){','async function download(name,text,type){if(window.TFGBCNative){await window.TFGBCNative.download(name,text,type);return}');
for(const name of ['csvMembers','csvGiving','csvAtt','backup'])change(name+'(){', 'async '+name+'(){');
app=app.replaceAll('download(slug()', 'await download(slug()');
change("String(v??'').replace(/\"/g,'\"\"')", "String(typeof v==='number'?v:/^[\\s\\u0000-\\u001f]*[=+@-]/.test(String(v??''))?\"'\"+String(v):v??'').replace(/\"/g,'\"\"')");
change("print(){sfx('tap');window.print()}","async print(){sfx('tap');if(window.TFGBCNative){await window.TFGBCNative.print(printableReport());toast('Report ready to share')}else window.print()}");
change('A[a.dataset.act](a,e)',"Promise.resolve(A[a.dataset.act](a,e)).catch(error=>toast(error.message||'Action was not completed'))");
app=app.replace('<button class="btn ghost sm" data-act="demo">Load sample data</button>','');
app=app.replaceAll('Your records are stored in this browser on this device. Download a backup every week and keep it on a flash drive or Google Drive.','Church records are shared with authorized staff. Export a regular backup for safekeeping. To move records from the previous device-only version, download its backup and restore that file here.');
app=app.replaceAll('will be erased from this device.','will be erased from the shared church workspace.');
app=app.replaceAll('or load sample data in Settings to try the app.','or restore your previous backup in Settings.');
change("</nav></section></div>`;","<button type=\"button\" class=\"btn ghost\" data-act=\"staffSignout\">Sign out</button></nav></section></div>`;");
change("$('#nav').innerHTML=b;","$('#nav').innerHTML=b+'<button data-act=\"moreNav\">More</button>';");
change("<input type=\"date\" name=\"birth\" value=\"${m.birth||''}\">","<span class=\"date-reset-row\"><input aria-label=\"Birthday\" type=\"date\" name=\"birth\" value=\"${m.birth||''}\"><button type=\"button\" class=\"btn ghost sm\" data-reset-date aria-label=\"Reset Birthday to today\">Reset</button></span>");
change("<input type=\"date\" name=\"joined\" value=\"${m.joined||''}\">","<span class=\"date-reset-row\"><input aria-label=\"Date joined\" type=\"date\" name=\"joined\" value=\"${m.joined||''}\"><button type=\"button\" class=\"btn ghost sm\" data-reset-date aria-label=\"Reset Date joined to today\">Reset</button></span>");
change("<input type=\"date\" name=\"date\" value=\"${g.date}\" required>","<span class=\"date-reset-row\"><input aria-label=\"Giving date\" type=\"date\" name=\"date\" value=\"${g.date}\" required><button type=\"button\" class=\"btn ghost sm\" data-reset-date aria-label=\"Reset Giving date to today\">Reset</button></span>");
const adaptation=`
function printableReport(){
  const original=document.querySelector('#root'),copy=original.cloneNode(true);
  const originalCanvases=[...original.querySelectorAll('canvas')];
  [...copy.querySelectorAll('canvas')].forEach((canvas,index)=>{const image=document.createElement('img');image.src=originalCanvases[index].toDataURL('image/png');image.alt='Church report chart';image.style.cssText='max-width:100%;height:auto';canvas.replaceWith(image)});
  copy.querySelectorAll('button,script,.acts,.noprint').forEach(element=>element.remove());
  const css=[...document.querySelectorAll('style')].map(style=>style.textContent).join('\\n');
  return '<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>TFGBC report</title><style>'+css+' :root{--bg:#fff;--surface:#fff;--surface2:#f5f5f5;--ink:#17143D;--muted:#555;--line:#ddd}body{padding:24px;background:white;color:#17143D}.panel{box-shadow:none}.view{animation:none}</style></head><body>'+copy.innerHTML+'</body></html>';
}
let localSound=true;
try{localSound=localStorage.getItem('tfgbc-staff-sound')!=='false'}catch{}
const cloud=createCloudController({
  snapshot(){const snapshot=structuredClone(state);snapshot.settings.sound=true;return validateBackup(snapshot)},
  applyState(next){state=next;state.settings.sound=localSound;ui.att=null;render()},
  signedOut(){state=null;ui.att=null;document.querySelector('#root').innerHTML='';closeModal()},
  busy(){return !!document.querySelector('#mform')||ui.view==='attendance'},
  status(text,kind){setSave(text,kind)},download,
});
installModalScrollGuard(document.querySelector('#modalRoot'));
installDateReset(document.querySelector('#modalRoot'));
A.staffSignout=()=>cloud.signOut();
installPullRefresh({scroller:document.querySelector('#root'),indicator:document.querySelector('#pull-refresh'),canStart:cloud.canPullRefresh,refresh:cloud.refresh});
const originalAfter=after;after=()=>{originalAfter();if(!cloud.isAdmin())document.querySelectorAll('[data-set]').forEach(input=>input.disabled=true);if(window.TFGBCNative)document.querySelectorAll('[data-act="print"]').forEach(button=>button.innerHTML=I.dl+' Share report')};
persist=()=>{if(!state)return;localSound=state.settings.sound;try{localStorage.setItem('tfgbc-staff-sound',String(localSound))}catch{}cloud.persist()};
const originalRestore=A.restore,originalWipe=A.wipe;
A.restore=()=>{if(!cloud.isAdmin()){toast('Only an administrator can restore a church backup');return}originalRestore()};
A.wipe=()=>{if(!cloud.isAdmin()){toast('Only an administrator can erase the shared workspace');return}originalWipe()};
window.addEventListener('tfgbc:native-back',event=>{if(document.querySelector('#mform')){closeModal();event.preventDefault()}else if(state&&ui.view!=='dashboard'){go('dashboard');event.preventDefault()}});
await installNativeBridge({minimizeOnRootBack:true});
await cloud.start();
if(document.fonts)document.fonts.ready.then(drawCharts);
`;
const generated=path.join(root,'generated');await fs.mkdir(generated,{recursive:true});
await fs.writeFile(path.join(generated,'app.js'),"import {createCloudController} from '../src/cloud';\nimport {installPullRefresh} from '../src/pull-refresh';\nimport {installModalScrollGuard} from '../src/modal-scroll';\nimport {installDateReset} from '../src/date-reset';\nimport {installNativeBridge} from '../native';\n"+app+adaptation);
const auth=`<section id="auth-screen" class="auth-screen"><div class="panel auth-card">
<div class="auth-brand"><img src="./church-logo.png" alt="Tuliao First Grace Baptist Church logo"><div><strong>Tuliao First Grace Baptist Church</strong><small>Church Management</small></div></div>
<h1 id="auth-title">Staff sign-in</h1><p>One church workspace for members, attendance, giving, and ministry groups.</p>
<form id="auth-form"><label class="f" id="auth-email-field">Email address<input id="auth-email" name="email" type="email" autocomplete="username" required></label>
<label class="f">Password<input id="auth-password" name="password" type="password" autocomplete="current-password" required></label>
<button class="btn gold" id="auth-submit" type="submit">Sign in</button></form>
<div id="auth-providers" class="auth-providers"></div><button id="auth-forgot" class="text-button" type="button">Forgot password?</button>
<p id="auth-error" role="status" class="auth-message"></p><div class="auth-foot">Access is for authorized church staff. An internet connection is required.</div>
</div></section>
<section id="cloud-blocker" class="cloud-blocker" role="dialog" aria-modal="true" aria-labelledby="block-title" hidden><div class="panel"><h2 id="block-title"></h2><p id="block-message"></p><button id="block-draft" class="btn gold">Save my draft backup</button><button id="block-retry" class="btn">Retry sync</button><button id="block-latest" class="btn ghost" hidden>Load latest church records</button></div></section>`;
html=html.replace(/<script>[\s\S]*?<\/script>/,'<script type="module" src="./mobile.js"></script>');
html=html.replace('<body>','<body data-cloud-ready="false">'+auth);
html=html.replace('<main><div class="wrap" id="root"></div></main>','<main><header class="account-header"><div class="wrap cloudbar"><div><small id="cloud-user"></small><small id="cloud-status" role="status">Connecting…</small></div></div><div id="pull-refresh" class="pull-refresh" role="status" aria-live="polite"><span class="pull-refresh-icon" aria-hidden="true">↻</span><span class="pull-refresh-label"></span></div></header><div class="wrap" id="root"></div></main>');
html=html.replace('</style>',await fs.readFile(path.join(root,'src/mobile.css'),'utf8')+'\n</style>');
for(const directory of ['www','site']){
  const target=path.join(root,directory);await fs.mkdir(target,{recursive:true});
  await fs.copyFile(path.join(root,'assets/church-logo.png'),path.join(target,'church-logo.png'));await fs.writeFile(path.join(target,'index.html'),html);await fs.copyFile(path.join(source,'favicon.svg'),path.join(target,'favicon.svg'));
}
await build({entryPoints:[path.join(generated,'app.js')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(root,'www/mobile.js'),minify:true});
await fs.copyFile(path.join(root,'www/mobile.js'),path.join(root,'site/mobile.js'));
await fs.mkdir(path.join(root,'site/device'),{recursive:true});await fs.copyFile(path.join(source,'index.html'),path.join(root,'site/device/index.html'));
await fs.writeFile(path.join(root,'site/_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n/\n  Cache-Control: no-cache\n/device/*\n  X-Robots-Tag: noindex\n/downloads/*\n  Content-Type: application/vnd.android.package-archive\n  Content-Disposition: attachment\n  Cache-Control: no-cache\n  X-Robots-Tag: noindex\n/downloads/*.ipa\n  Content-Type: application/octet-stream\n  Content-Disposition: attachment\n');
try{await fs.cp(path.join(root,'downloads'),path.join(root,'site/downloads'),{recursive:true})}catch(error){if(error.code!=='ENOENT')throw error}
console.log('Built bundled native UI and shared staff website.');
