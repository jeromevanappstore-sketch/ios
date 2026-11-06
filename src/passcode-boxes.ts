// One accessible input keeps paste, numeric keyboards and autofill working.
// The six cells display its value without splitting keyboard focus.
export function passcodeBoxes(input:HTMLInputElement){
  let enabled=true;
  const wrap=document.createElement('span');wrap.className='passcode-boxes';
  input.before(wrap);wrap.append(input);
  const cells=Array.from({length:6},()=>{
    const cell=document.createElement('span');cell.className='passcode-cell';cell.setAttribute('aria-hidden','true');wrap.append(cell);return cell;
  });
  if(!document.getElementById('passcode-box-style')){
    const style=document.createElement('style');style.id='passcode-box-style';
    style.textContent=`.passcode-boxes{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(5px,2vw,10px);position:relative;width:100%;min-width:0}
      .passcode-boxes>input{position:absolute!important;inset:0;width:100%!important;height:100%!important;margin:0!important;opacity:0;z-index:1;cursor:text;font-size:20px!important}
      .passcode-cell{display:flex;align-items:center;justify-content:center;min-width:0;height:clamp(48px,12vw,62px);border:1px solid #7198e8;border-radius:7px;font-size:26px;font-weight:500;color:inherit;background:transparent;box-sizing:border-box}
      .passcode-boxes:focus-within .passcode-cell.active{outline:2px solid #5485ff;outline-offset:1px}
      .passcode-boxes:has(input:disabled){opacity:.65}.passcode-cell[hidden]{display:none}
      .auth-submitting:before{content:'';display:inline-block;width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;margin-right:9px;vertical-align:middle;animation:auth-spin .8s linear infinite}
      @keyframes auth-spin{to{transform:rotate(360deg)}}`;
    document.head.append(style);
  }
  function sync(){
    const active=Math.min(input.selectionStart??input.value.length,5);
    cells.forEach((cell,i)=>{cell.textContent=input.value[i]?'●':'';cell.classList.toggle('active',i===active)});
  }
  input.addEventListener('input',()=>{if(enabled)input.value=input.value.replace(/\D/g,'').slice(0,6);sync()});
  for(const event of ['focus','click','keyup','select'])input.addEventListener(event,sync);
  wrap.addEventListener('click',()=>{
    if(!enabled||input.disabled||input.readOnly)return;
    // A real tap must reacquire editable focus, including after iOS dismissed
    // the keyboard while the field was temporarily read-only during a request.
    input.blur();input.focus({preventScroll:true});
    input.setSelectionRange(input.value.length,input.value.length);sync();
  });
  return {sync,show(show:boolean){enabled=show;wrap.classList.toggle('passcode-enabled',enabled);cells.forEach(c=>c.hidden=!enabled);
    if(enabled){input.type='password';input.style.removeProperty('position');}
    else{input.type='password';wrap.classList.remove('passcode-boxes');}
    if(enabled)wrap.classList.add('passcode-boxes');sync();
  }};
}
