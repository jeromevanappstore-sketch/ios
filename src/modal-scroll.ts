/** Stop iOS elastic drags at a dialog boundary without blocking scrolling through its fields. */
export function installModalScrollGuard(container:HTMLElement){
 let x=0,y=0,active=false;
 function start(event:TouchEvent){active=event.touches.length===1;if(active){x=event.touches[0].clientX;y=event.touches[0].clientY}}
 function move(event:TouchEvent){
  if(!active||event.touches.length!==1)return;
  const point=event.touches[0],dx=point.clientX-x,dy=point.clientY-y;
  x=point.clientX;y=point.clientY;
  const target=event.target as HTMLElement|null,body=target?.closest('.mb') as HTMLElement|null;
  if(!event.cancelable)return;
  if(!body){event.preventDefault();return}
  // Inputs keep horizontal text-selection gestures and their native controls.
  if(Math.abs(dx)>Math.abs(dy)){
   if(!target?.closest('input,textarea,[contenteditable="true"]'))event.preventDefault();return;
  }
  let scroller=body;
  for(let node:HTMLElement|null=target;node&&node!==body;node=node.parentElement){
   if(node.scrollHeight>node.clientHeight+1&&/auto|scroll/.test(getComputedStyle(node).overflowY)){scroller=node;break}
  }
  const maximum=scroller.scrollHeight-scroller.clientHeight;
  if(maximum<=1||(dy>0&&scroller.scrollTop<=0)||(dy<0&&scroller.scrollTop>=maximum-1))event.preventDefault();
 }
 function end(){active=false}
 container.addEventListener('touchstart',start,{passive:true});
 container.addEventListener('touchmove',move,{passive:false});
 container.addEventListener('touchend',end,{passive:true});
 container.addEventListener('touchcancel',end,{passive:true});
 return ()=>{container.removeEventListener('touchstart',start);container.removeEventListener('touchmove',move);container.removeEventListener('touchend',end);container.removeEventListener('touchcancel',end)};
}
