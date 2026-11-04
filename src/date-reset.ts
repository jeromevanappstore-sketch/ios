export function localToday(now=new Date()){
 return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
}
export function resetDateToToday(input:HTMLInputElement,now=new Date()){
 input.value=localToday(now)
 if(typeof input.dispatchEvent==='function'&&typeof Event==='function'){
  input.dispatchEvent(new Event('input',{bubbles:true}))
  input.dispatchEvent(new Event('change',{bubbles:true}))
 }
}
export function installDateReset(container:HTMLElement){
 const supported=new Set(['birth','joined','date']);
 container.addEventListener('click',event=>{
  const button=(event.target as Element|null)?.closest('[data-reset-date]');if(!button)return;
  const label=typeof (button as any).closest==='function'?(button as any).closest('label'):button.parentElement;
  const input=label?.querySelector('input[type="date"]') as HTMLInputElement|null;
  if(input&&supported.has(input.name)){event.preventDefault();resetDateToToday(input)}
 });
 container.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input?.type==='date'&&supported.has(input.name)&&!input.value)resetDateToToday(input)});
}
