import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  acceptInvite, getSettings, handleAuthCallback, login, logout, oauthLogin,
  requestPasswordRecovery, updateUser,
} from '@netlify/identity';
import type { AuthProvider } from '@netlify/identity';

const API_ORIGIN = 'https://tfgbc-church-management.netlify.app';
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
      headers:{'Content-Type':'application/json',Origin:Capacitor.getPlatform()==='ios'?'capacitor://localhost':'https://localhost'},
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
    try{body=await response.json()}catch{throw new ApiError('The church service is unavailable. Please retry shortly.',status)}
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
    el('auth-submit').textContent='Sign in';
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
    if(!form.reportValidity())return;
    const fields=new FormData(form),email=String(fields.get('email')||'').trim(),password=String(fields.get('password')||'');
    const submit=el('auth-submit') as HTMLButtonElement,setupMode=mode!=='login';submit.disabled=true;error('');
    try{
      if(mode==='invite'){
        const accepted=await acceptInvite(callbackToken,password);
        // SDK 2.0 accepts the invite without establishing the function cookies.
        // Complete the session through the public login API before loading records.
        if(!accepted.email)throw new Error('The invitation did not return an email address.');
        (el('auth-email') as HTMLInputElement).value=accepted.email;
        await login(accepted.email,password);
      }
      else if(mode==='recovery'){
        const updated=await updateUser({password});
        if(!updated.email)throw new Error('Password setup did not return an email address.');
        (el('auth-email') as HTMLInputElement).value=updated.email;
        await login(updated.email,password);
      }
      else if(Capacitor.isNativePlatform())await api('session','POST',{email,password});
      else await login(email,password);
      await load(true);(el('auth-password') as HTMLInputElement).value='';
      (el('auth-email') as HTMLInputElement).value=user?.email||email;resetLoginForm();
    }catch(cause){
      const message=(cause as Error).message||'Please try again.';
      if(setupMode){
        // Verification may already have consumed the one-time email link.
        // Always provide ordinary sign-in rather than trapping a used token.
        resetLoginForm();(el('auth-password') as HTMLInputElement).value='';
        error('Account setup could not finish: '+message+' Sign in if you already chose a password, or reopen your latest setup email to try again.');
      }else error(message);
    }
    finally{submit.disabled=false}
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
  async function signOut(){
      if(dirty||saving||refreshing){setStatus('Wait for your changes to sync before signing out','err');return}
      try{
        if(Capacitor.isNativePlatform())await api('session','DELETE');else await logout();
        user=null;adapter.signedOut();resetLoginForm();showAuth();
      }catch{setStatus('Sign-out failed. Check your connection and retry.','err')}
  }

  async function start(){
    showAuth();startPolling();
    el('auth-form').addEventListener('submit',event=>void doLogin(event as SubmitEvent));

    el('block-retry').addEventListener('click',()=>{hideBlocker();void flush()});
    el('block-draft').addEventListener('click',()=>void adapter.download('tfgbc-unsynced-draft.json',JSON.stringify(adapter.snapshot()),'application/json').catch(()=>setStatus('Draft sharing was not completed','err')));
    el('block-latest').addEventListener('click',()=>{
      if(!confirm('Load the latest shared records? Any unsaved changes in this app will be discarded. Save your draft backup first.'))return;
      void load(false,true).catch(()=>setStatus('Unable to load the latest records','err'));
    });
    el('auth-forgot').addEventListener('click',async()=>{
      const email=(el('auth-email') as HTMLInputElement).value.trim();
      if(!email){error('Enter your email address first.');return}
      if(Capacitor.isNativePlatform()){
        error('Reset your password on the church website, then return to this app.');
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
          mode='invite';callbackToken=result.token||'';el('auth-title').textContent='Set up your staff account';
          (el('auth-email') as HTMLInputElement).required=false;el('auth-email-field').hidden=true;
          (el('auth-password') as HTMLInputElement).minLength=12;
          (el('auth-password') as HTMLInputElement).autocomplete='new-password';
          el('auth-submit').textContent='Create password and continue';return;
        }
        if(result?.type==='recovery'){
          mode='recovery';el('auth-title').textContent='Choose a new password';
          (el('auth-email') as HTMLInputElement).required=false;el('auth-email-field').hidden=true;
          (el('auth-password') as HTMLInputElement).minLength=12;
          (el('auth-password') as HTMLInputElement).autocomplete='new-password';
          el('auth-submit').textContent='Save password and continue';return;
        }
      }
      const settings=Capacitor.isNativePlatform()?(await api('session?settings=1')).settings:await getSettings();
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
