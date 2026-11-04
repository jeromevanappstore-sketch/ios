export function localToday(now=new Date()){
 return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
}
export function resetDateToToday(input:HTMLInputElement,now=new Date()){input.value=localToday(now)}
export function installDateReset(container:HTMLElement){
 const supported=new Set(['birth','joined','date']);
 container.addEventListener('click',event=>{
  const button=(event.target as Element|null)?.closest('[data-reset-date]');if(!button)return;
  const input=button.parentElement?.querySelector('input[type="date"]') as HTMLInputElement|null;
  if(input&&supported.has(input.name)){event.preventDefault();resetDateToToday(input)}
 });
 // A native date picker's Clear/Reset commits an empty value on iOS.
 container.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input?.type==='date'&&supported.has(input.name)&&!input.value)resetDateToToday(input)});
}
