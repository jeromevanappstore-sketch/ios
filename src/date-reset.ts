// Bundled release marker: TFGBC-date-selector-v2.
// The iOS date picker's Reset is outside the DOM. Own these date controls.
export function localToday(now=new Date()){
 return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
}
export function resetDateToToday(input:HTMLInputElement,now=new Date()){
 input.value=localToday(now);
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
}
export function installDateReset(container:HTMLElement){
 const supported=new Set(['birth','joined','date']);
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const doc=container.ownerDocument;
 const scope=doc.body;
 if(!doc.getElementById('tfgbc-date-selector-style')){
  const style=doc.createElement('style');style.id='tfgbc-date-selector-style';
  style.textContent=`
   .date-field{display:grid;gap:5px;font-size:13px;font-weight:600;color:var(--muted,#b5c5e8)}
   .date-reset-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;min-width:0;max-width:100%}
   .date-reset-row .date-display{text-align:left;justify-content:space-between;white-space:normal;min-width:0;width:100%;min-height:46px;font-size:16px;box-shadow:none}
   .date-selector{grid-column:1/-1;display:block;min-width:0;padding:12px;border:1px solid var(--line,#33436b);border-radius:12px;background:var(--surface2,#15224b)}
   .date-selector[hidden]{display:none!important}
   .date-reset-row>.btn{grid-column:auto}
   .date-selector-parts{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) minmax(0,1.15fr);gap:8px;min-width:0}
   .date-selector-part{display:grid;gap:5px;min-width:0;font-size:12px;color:var(--muted,#b5c5e8)}
   .date-selector-part select{width:100%;min-width:0;max-width:100%;min-height:44px;font-size:16px;padding:8px 4px}
   .date-selector-actions{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:12px}
   .date-reset-row .date-selector-note{grid-column:1/-1;font-size:12px;font-weight:400;color:var(--muted,#b5c5e8)}
   @media(max-width:600px){
    .attbar>.date-field{grid-column:1/-1;width:100%}
    .date-selector-parts{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.2fr);gap:8px}
    .date-selector-part select{padding:8px 4px;min-height:44px}
    .date-reset-row .date-selector-actions>.btn{grid-column:auto;flex:0 1 auto}
   }
  `;doc.head.append(style);
 }
 let serial=0;
 function enhance(){
  for(const input of scope.querySelectorAll<HTMLInputElement>('input[type="date"]')){
   const attendance=input.id==='aDate';
   if(!attendance&&!supported.has(input.name))continue;
   if(!input.parentElement?.classList.contains('date-reset-row')){
    const holder=doc.createElement('span');holder.className='date-reset-row';input.replaceWith(holder);holder.append(input);
    const reset=doc.createElement('button');reset.type='button';reset.className='btn ghost sm';reset.dataset.resetDate='';reset.textContent='Reset';holder.append(reset);
   }
   const row=input.parentElement!;
   // A label may only contain one labelable control. The selector has several.
   const wrapper=row.parentElement;
   if(wrapper?.tagName==='LABEL'){
    const group=doc.createElement('div');group.className=wrapper.className+' date-field';
    group.append(...wrapper.childNodes);wrapper.replaceWith(group);
   }
   const name=input.getAttribute('aria-label')||(attendance?'Attendance date':({birth:'Birthday',joined:'Date joined',date:'Giving date'}[input.name])!);
   row.querySelector('[data-reset-date]')?.setAttribute('aria-label','Reset '+name+' to today');
   const display=doc.createElement('button');display.type='button';display.className='btn ghost date-display';
   display.dataset.dateSelectorVersion='TFGBC-date-selector-v2';
   const panel=doc.createElement('span');panel.className='date-selector';panel.hidden=true;panel.id='tfgbc-date-'+(++serial);
   panel.setAttribute('role','group');panel.setAttribute('aria-label',name+' selector');
   display.setAttribute('aria-controls',panel.id);display.setAttribute('aria-expanded','false');
   const parts=doc.createElement('span');parts.className='date-selector-parts';
   function part(label:string){
    const wrapper=doc.createElement('span');wrapper.className='date-selector-part';
    const caption=doc.createElement('span');caption.textContent=label;
    const select=doc.createElement('select');select.setAttribute('aria-label',name+' '+label.toLowerCase());
    wrapper.append(caption,select);parts.append(wrapper);return select;
   }
   const month=part('Month'),day=part('Day'),year=part('Year');
   function option(select:HTMLSelectElement,value:number,text=String(value)){
    const item=doc.createElement('option');item.value=String(value);item.textContent=text;select.append(item);
   }
   months.forEach((text,index)=>option(month,index+1,text));
   function days(selected:number){
    const maximum=new Date(Number(year.value),Number(month.value),0).getDate();
    day.replaceChildren();for(let n=1;n<=maximum;n++)option(day,n);
    day.value=String(Math.min(Math.max(selected,1),maximum));
   }
   function sync(){
    const value=/^\d{4}-\d{2}-\d{2}$/.test(input.value)?input.value:localToday();
    const [y,m,d]=value.split('-').map(Number),current=new Date().getFullYear();
    year.replaceChildren();for(let n=Math.max(current+5,y);n>=Math.min(1900,y);n--)option(year,n);
    year.value=String(y);month.value=String(m);days(d);
    display.textContent=input.value?months[m-1]+' '+d+', '+y:'Select date';
    display.setAttribute('aria-label',name+': '+display.textContent);
   }
   function commit(notify=true){
    note.textContent='';
    input.value=year.value+'-'+month.value.padStart(2,'0')+'-'+day.value.padStart(2,'0');
    // Attendance redraws the whole page on change. Commit it once on Done.
    if(notify){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
   }
   const actions=doc.createElement('span');actions.className='date-selector-actions';
   const reset=doc.createElement('button');reset.type='button';reset.className='btn ghost sm';reset.textContent='Reset to today';reset.setAttribute('aria-label','Reset '+name+' to today inside selector');
   const done=doc.createElement('button');done.type='button';done.className='btn sm';done.textContent='Done';
   actions.append(reset,done);panel.append(parts,actions);
   const note=doc.createElement('span');note.className='date-selector-note';note.setAttribute('role','status');
   // Preserve the ISO form value and name; replace only the system control.
   input.type='hidden';input.insertAdjacentElement('afterend',display);row.append(panel,note);
   function close(){panel.hidden=true;display.setAttribute('aria-expanded','false')}
   display.addEventListener('click',event=>{event.preventDefault();const opening=panel.hidden;sync();panel.hidden=!opening;display.setAttribute('aria-expanded',String(opening))});
   for(const select of [month,year])select.addEventListener('change',()=>{days(Number(day.value));commit(!attendance)});
   day.addEventListener('change',()=>commit(!attendance));
   function today(event:Event){event.preventDefault();resetDateToToday(input);sync();note.textContent='Set to today: '+display.textContent}
   reset.addEventListener('click',today);
   row.querySelector<HTMLButtonElement>('[data-reset-date]')?.addEventListener('click',today);
   done.addEventListener('click',event=>{event.preventDefault();commit();close();display.focus()});
   input.addEventListener('input',sync);input.addEventListener('change',sync);
   sync();
  }
 }
 enhance();
 const observer=new MutationObserver(enhance);observer.observe(scope,{childList:true,subtree:true});
 return ()=>observer.disconnect();
}