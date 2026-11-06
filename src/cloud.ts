import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  acceptInvite, getSettings, handleAuthCallback, login, logout, oauthLogin,
  requestPasswordRecovery, updateUser,
} from '@netlify/identity';
import type { AuthProvider } from '@netlify/identity';
import { passcodeBoxes } from './passcode-boxes';

const API_ORIGIN = 'https://radiant-chebakia-ed8ab3.netlify.app';
// Native sessions stay in memory; browser sessions use a Secure HttpOnly cookie.
let passcodeSession = '';
type StaffUser = { id:string; email:string; role:'admin'|'staff' };
type Workspace = { state:any; revision:number; user:StaffUser; updatedAt:string };
type Adapter = {
  snapshot():any;
  applyState(state:any):void;
  signedOut():void;
  busy():boolean;
  status(text:string,kind?:string):void;
  download(name:string,text:string,type:string):Promise<void>;
};
class ApiError extends Error {
  constructor(message:string,public status:number){super(message)}
}

async function api(path:string,method='GET',data?:unknown):Promise<any> {
  let status:number, body:any;
  if(Capacitor.isNativePlatform()) {
    const response=await CapacitorHttp.request({
      url:API_ORIGIN+'/.netlify/functions/'+path,method,
      headers:{'Content-Type':'application/json',Origin:Capacitor.getPlatform()==='ios'?'capacitor://localhost':'https://localhost',...(passcodeSession?{Authorization:'Bearer '+passcodeSession}:{})},
      ...(data===undefined?{}:{data}),responseType:'json',connectTimeout:15000,readTimeout:30000,
    });
    status=response.status;body=response.data;
  } else {
    const response=await fetch('/.netlify/functions/'+path,{
      method,credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),
    });
    status=response.status;
    if(status===204)body=null;
    else try{body=await response.json()}catch{throw new ApiError('The church service is unavailable. Please retry shortly.',status)}
  }
  if(status<200||status>=300)throw new ApiError(body?.message||body?.error||'The church service could not complete this request.',status);
  return body;
}

export function createCloudController(adapter:Adapter) {
  const el=(id:string)=>document.getElementById(id)!;
  let user:StaffUser|null=null,revision=0,dirty=false,saving=false,version=0,conflict=false;
  let savedSnapshot='',timer:ReturnType<typeof setTimeout>|undefined;
  let pollTimer:ReturnType<typeof setInterval>|undefined;
  let callbackToken='',mode:'login'|'invite'|'recovery'='login';
  let legacyLogin=false, enrolling=false;
  let authenticating=false;
  const secretInput=el('auth-password') as HTMLInputElement;
  const boxes=passcodeBoxes(secretInput);
  const confirmInput=el('auth-confirm') as HTMLInputElement;
  const confirmBoxes=passcodeBoxes(confirmInput);
  const secretField=secretInput.closest('label')!;
  let setupStage=0;
  const setupBack=document.createElement('button');setupBack.type='button';setupBack.className='btn ghost';setupBack.textContent='Back';setupBack.hidden=true;
  el('auth-submit').before(setupBack);
  const setupProgress=document.createElement('p');setupProgress.hidden=true;setupProgress.setAttribute('role','status');setupProgress.setAttribute('aria-live','polite');setupProgress.textContent='Saving your passcode…';
  el('auth-submit').after(setupProgress);
  function creationStep(step:number){
    setupStage=step;secretField.hidden=step===2;
    el('auth-confirm-field').hidden=step!==2;confirmInput.required=step===2;
    setupBack.hidden=step!==2;
    el('auth-submit').hidden=true;
    if(step===1){confirmInput.value='';confirmBoxes.sync();el('auth-title').textContent='Create your staff passcode';secretInput.focus()}
    if(step===2){el('auth-title').textContent='Confirm your staff passcode';confirmInput.focus()}
  }
  setupBack.addEventListener('click',()=>{if(authenticating)return;error('');secretInput.value='';boxes.sync();creationStep(1)});
  function pinForm(setup=false){
    el('auth-email-field').hidden=true;(el('auth-email') as HTMLInputElement).required=false;
    const password=el('auth-password') as HTMLInputElement;
    password.type='password';password.inputMode='numeric';password.pattern='[0-9]{6}';password.minLength=6;password.maxLength=6;
    password.autocomplete=setup?'new-password':'off';password.value='';
    boxes.show(true);boxes.sync();
    confirmInput.value='';confirmBoxes.show(true);confirmBoxes.sync();
    el('auth-secret-label').textContent=setup?'Create your 6-digit passcode':'6-digit passcode';
    el('auth-confirm-field').hidden=!setup;(el('auth-confirm') as HTMLInputElement).required=setup;
    el('auth-title').textContent=setup?'Create your staff passcode':'Staff sign-in';
    el('auth-submit').textContent=setup?'Save passcode and continue':'Sign in';
    el('auth-submit').hidden=!setup;
    el('auth-legacy').hidden=setup;el('auth-forgot').hidden=setup;
    if(setup)creationStep(1);
    else{setupStage=0;secretField.hidden=false;setupBack.hidden=true}
  }
  const error=(text:string)=>{el('auth-error').textContent=text};
  const setStatus=(text:string,kind='')=>{
    adapter.status(text,kind);el('cloud-status').textContent=text;
    el('cloud-status').dataset.kind=kind;
  };
  function showAuth(){
    document.body.dataset.cloudReady='false';
    el('auth-screen').hidden=false;el('cloud-blocker').hidden=true;
  }
  function resetLoginForm(){
    mode='login';callbackToken='';el('auth-title').textContent='Staff sign-in';
    el('auth-email-field').hidden=false;(el('auth-email') as HTMLInputElement).required=true;
    (el('auth-password') as HTMLInputElement).minLength=0;
    (el('auth-password') as HTMLInputElement).autocomplete='current-password';
    legacyLogin=false;enrolling=false;pinForm(false);
  }
  function ready(){
    document.body.dataset.cloudReady='true';el('auth-screen').hidden=true;
    el('cloud-user').textContent=user?.email||'';
    document.body.dataset.staffRole=user?.role||'';
    
  }
  function showBlocker(title:string,message:string,isConflict=false){
    conflict=isConflict;
    el('block-title').textContent=title;el('block-message').textContent=message;
    el('block-retry').hidden=isConflict;el('block-latest').hidden=!isConflict;
    el('cloud-blocker').hidden=false;
    document.querySelector('.app')?.setAttribute('inert','');
    document.querySelector('.bnav')?.setAttribute('inert','');
    el('block-draft').focus();
  }
  function hideBlocker(){
    el('cloud-blocker').hidden=true;
    document.querySelector('.app')?.removeAttribute('inert');document.querySelector('.bnav')?.removeAttribute('inert');
  }
  async function load(initial=false,force=false){
    const response:Workspace=await api('records');
    if(!initial&&!force&&(adapter.busy()||dirty||saving)){setStatus('New records are available; finish your current work, then refresh');return}
    user=response.user;revision=response.revision;
    savedSnapshot=JSON.stringify(response.state);dirty=false;conflict=false;
    adapter.applyState(response.state);ready();hideBlocker();setStatus('Shared records up to date');
    if(initial)error('');
  }
  async function flush(){
    if(!user||saving||!dirty||conflict)return;
    const snapshot=adapter.snapshot(),serialized=JSON.stringify(snapshot);
    if(serialized===savedSnapshot){dirty=false;setStatus('Shared records up to date');return}
    if(new TextEncoder().encode(serialized).length>3_900_000){
      setStatus('Not saved: workspace exceeds upload limit','err');
      showBlocker('Workspace is too large','Save your draft backup. This workspace exceeds the current upload limit; reduce member photos before retrying.');return;
    }
    const sentVersion=version;saving=true;setStatus('Saving shared records…','busy');
    try{
      const result:Workspace=await api('records','PUT',{state:snapshot,baseRevision:revision});
      revision=result.revision;savedSnapshot=JSON.stringify(result.state);
      if(sentVersion===version)dirty=false;
      hideBlocker();setStatus(dirty?'Saving latest changes…':'Shared records saved',dirty?'busy':'');
    }catch(cause){
      const failure=cause as ApiError;
      setStatus('Changes have not synced','err');
      if(failure.status===409)showBlocker('Another staff member saved changes','Your draft has not overwritten their work. Save a draft backup, then load the latest church records and reapply your changes.',true);
      else if(failure.status===401)showBlocker('Your session needs sign-in','Save a draft backup before reopening the app and signing in again.');
      else showBlocker('Changes have not synced',failure.status===403?'Your account does not have access to save these church records. Save a draft and contact your administrator.':'Check your internet connection, then retry. Your unsaved draft is held in this open app; save a backup before closing it.');
    }finally{saving=false;if(dirty&&!conflict&&el('cloud-blocker').hidden)timer=setTimeout(()=>void flush(),350)}
  }
  function persist(){
    if(!user)return;
    dirty=true;version++;clearTimeout(timer);setStatus('Waiting to sync…','busy');timer=setTimeout(()=>void flush(),350);
  }
  async function doLogin(event:SubmitEvent){
    event.preventDefault();const form=event.currentTarget as HTMLFormElement;
    if(authenticating)return;
    if(setupStage===1){if(/^\d{6}$/.test(secretInput.value))creationStep(2);return}
    if(!form.reportValidity())return;
    const fields=new FormData(form),email=String(fields.get('email')||'').trim(),password=String(fields.get('password')||'');
    const submit=el('auth-submit') as HTMLButtonElement,setupMode=mode!=='login';submit.disabled=true;error('');
    authenticating=true;
    secretInput.blur();confirmInput.blur();
    setupProgress.textContent=setupStage===2?'Saving your passcode…':'Signing in…';
    setupProgress.hidden=false;setupProgress.classList.add('auth-submitting');
    const buttonLabel=submit.textContent;
    submit.textContent=setupStage===2?'Saving…':'Signing in…';submit.classList.add('auth-submitting');submit.setAttribute('aria-busy','true');
    form.setAttribute('aria-busy','true');secretInput.readOnly=true;confirmInput.readOnly=true;setupBack.disabled=true;
    try{
      if(!legacyLogin){
        if(setupMode||enrolling){
          if(password!==(el('auth-confirm') as HTMLInputElement).value)throw new Error('The passcodes do not match.');
          if(!enrolling){
            // Identity invitation/recovery establishes verified account ownership.
            // The generated Identity password is never the six-digit passcode.
            const randomPassword=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
            const account=mode==='invite'?await acceptInvite(callbackToken,randomPassword):await updateUser({password:randomPassword});
            if(!account.email)throw new Error('The invitation could not identify your staff account.');
            await login(account.email,randomPassword);
            callbackToken='';enrolling=true;
          }
          const result=await api('passcode','POST',{action:'enroll',code:password});
          passcodeSession=result.token||'';
          if(!Capacitor.isNativePlatform())await logout();
        }else{
          const result=await api('passcode','POST',{code:password});passcodeSession=result.token||'';
        }
        await load(true);resetLoginForm();(el('auth-confirm') as HTMLInputElement).value='';return;
      }
      if(Capacitor.isNativePlatform())await api('session','POST',{email,password});
      else await login(email,password);
      // Existing staff can enroll after one final email/password verification.
      enrolling=true;legacyLogin=false;mode='login';pinForm(true);return;
    }catch(cause){
      const message=(cause as Error).message||'Please try again.';
      const incorrect=!legacyLogin&&!setupMode&&!enrolling&&(cause as ApiError).status===401;
      error(incorrect?'Passcode is incorrect.':message);
      if(setupStage===2){confirmInput.value='';confirmBoxes.sync();confirmInput.blur()}
      if(incorrect){secretInput.value='';boxes.sync();secretInput.blur()}
    }
    finally{
      submit.disabled=false;authenticating=false;submit.classList.remove('auth-submitting');submit.removeAttribute('aria-busy');form.removeAttribute('aria-busy');
      secretInput.readOnly=false;confirmInput.readOnly=false;setupBack.disabled=false;
      setupProgress.hidden=true;setupProgress.classList.remove('auth-submitting');
      if(submit.textContent==='Saving…'||submit.textContent==='Signing in…')submit.textContent=buttonLabel;
    }
  }
  let refreshing=false;
  async function refresh(){
    if(!user||refreshing||conflict)return;
    if(dirty||saving){setStatus('Wait for your changes to sync before refreshing');return}
    if(adapter.busy()){setStatus('Finish the open form or attendance before refreshing');return}
    refreshing=true;
    try{setStatus('Refreshing shared records…','busy');await load()}
    catch{setStatus('Unable to refresh. Check your connection.','err')}
    finally{refreshing=false}
  }
  let signingOut=false;
  async function signOut(){
      if(signingOut)return;
      if(dirty||saving||refreshing){setStatus('Wait for your changes to sync before signing out','err');return}
      signingOut=true;
      const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-act="staffSignout"]'));
      for(const button of buttons){button.disabled=true;button.textContent='Signing out…';button.classList.add('auth-submitting');button.setAttribute('aria-busy','true')}
      setStatus('Signing out…','busy');
      try{
        await api('passcode','DELETE');passcodeSession='';
        if(Capacitor.isNativePlatform())await api('session','DELETE');else await logout();
        user=null;adapter.signedOut();resetLoginForm();showAuth();
      }catch{setStatus('Sign-out failed. Check your connection and retry.','err')}
      finally{
        signingOut=false;
        for(const button of buttons){button.disabled=false;button.textContent='Sign out';button.classList.remove('auth-submitting');button.removeAttribute('aria-busy')}
      }
  }

  async function start(){
    showAuth();startPolling();resetLoginForm();
    el('auth-form').addEventListener('submit',event=>void doLogin(event as SubmitEvent));
    confirmInput.addEventListener('input',()=>{
      if(authenticating)return;
      error('');
      if(setupStage===2&&/^\d{6}$/.test(confirmInput.value))
        (el('auth-form') as HTMLFormElement).requestSubmit();
    });
    secretInput.addEventListener('input',()=>{
      error('');
      if(setupStage===1&&/^\d{6}$/.test(secretInput.value)){creationStep(2);return}
      if(!legacyLogin&&!enrolling&&mode==='login'&&/^\d{6}$/.test(secretInput.value)&&!authenticating)
        (el('auth-form') as HTMLFormElement).requestSubmit();
    });
    el('auth-legacy').addEventListener('click',()=>{
      legacyLogin=true;el('auth-email-field').hidden=false;(el('auth-email') as HTMLInputElement).required=true;
      const password=el('auth-password') as HTMLInputElement;
      boxes.show(false);el('auth-submit').hidden=false;
      password.removeAttribute('pattern');password.inputMode='text';password.minLength=0;password.maxLength=1024;password.autocomplete='current-password';
      el('auth-secret-label').textContent='Existing password';el('auth-title').textContent='Set up a passcode';
      el('auth-submit').textContent='Verify account and continue';el('auth-legacy').hidden=true;
    });

    el('block-retry').addEventListener('click',()=>{hideBlocker();void flush()});
    el('block-draft').addEventListener('click',()=>void adapter.download('tfgbc-unsynced-draft.json',JSON.stringify(adapter.snapshot()),'application/json').catch(()=>setStatus('Draft sharing was not completed','err')));
    el('block-latest').addEventListener('click',()=>{
      if(!confirm('Load the latest shared records? Any unsaved changes in this app will be discarded. Save your draft backup first.'))return;
      void load(false,true).catch(()=>setStatus('Unable to load the latest records','err'));
    });
    el('auth-forgot').addEventListener('click',async()=>{
      el('auth-email-field').hidden=false;
      const email=(el('auth-email') as HTMLInputElement).value.trim();
      if(!email){error('Enter your email address first.');return}
      if(Capacitor.isNativePlatform()){
        error('Reset your passcode on the church website, then return to this app.');
        try{await Browser.open({url:API_ORIGIN})}catch{error('Open '+API_ORIGIN+' in your browser to reset your password.')}
        return;
      }
      try{await requestPasswordRecovery(email);error('If the account exists, a recovery email will arrive shortly.')}catch{error('Unable to send a recovery email. Please try again.')}
    });
    addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}});
    try{
      if(!Capacitor.isNativePlatform()){
        const result=await handleAuthCallback();
        if(result?.type==='invite'){
          mode='invite';callbackToken=result.token||'';pinForm(true);return;
        }
        if(result?.type==='recovery'){
          mode='recovery';pinForm(true);return;
        }
      }
      const settings=Capacitor.isNativePlatform()?(await api('session?settings=1')).settings:await getSettings();
      // Resume setup after an invitation was accepted but enrollment was interrupted.
      try{
        const setup=await api('passcode?setup=1');
        if(setup.needsSetup){enrolling=true;pinForm(true);return}
      }catch(cause){if((cause as ApiError).status!==401)throw cause}
      if(!Capacitor.isNativePlatform()){
        for(const [provider,enabled] of Object.entries(settings.providers||{})){
          if(!enabled||provider==='email')continue;
          const button=document.createElement('button');button.className='btn ghost';button.type='button';
          button.textContent='Continue with '+provider[0].toUpperCase()+provider.slice(1);
          button.addEventListener('click',()=>oauthLogin(provider as AuthProvider));el('auth-providers').append(button);
        }
      }
      try{await load(true)}catch(cause){
        const failure=cause as ApiError;
        if(failure.status===403)error('This account is not authorized for TFGBC records. Contact the church administrator.');
        else if(failure.status!==401)error('Connect to the internet to access shared church records.');
      }
    }catch{error('Staff sign-in is not ready yet. Please contact the church administrator.')}
  }
  function startPolling(){
    if(pollTimer)return;
    pollTimer=setInterval(()=>{
      if(!user||dirty||saving||conflict||adapter.busy()||document.hidden)return;
      void api('records').then((result:Workspace)=>{
        if(dirty||saving||adapter.busy())return;
        if(result.revision!==revision){revision=result.revision;savedSnapshot=JSON.stringify(result.state);adapter.applyState(result.state);setStatus('Updated from another staff device')}
      }).catch(()=>setStatus('Unable to check for updates','err'));
    },15000);
  }
  return {start,persist,refresh,signOut,canPullRefresh:()=>!!user&&!dirty&&!saving&&!conflict&&!adapter.busy(),isAdmin:()=>user?.role==='admin'};
}
