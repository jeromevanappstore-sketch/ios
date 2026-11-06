type Options={scroller:HTMLElement;indicator:HTMLElement;canStart:()=>boolean;refresh:()=>Promise<void>};
/** Only the records pane participates; navigation, forms and nested scrollers keep their gestures. */
export function installPullRefresh({scroller,indicator,canStart,refresh}:Options){
  const label=indicator.querySelector('.pull-refresh-label')!;
  const threshold=72;
  let startX=0,startY=0,distance=0,tracking=false,locked=false,loading=false;
  function paint(height:number,text:string,state:string){
    indicator.style.height=height+'px';indicator.dataset.state=state;label.textContent=text;
    indicator.setAttribute('aria-hidden',height?'false':'true');
  }
  function reset(){tracking=false;locked=false;distance=0;if(!loading)paint(0,'','idle')}
  function start(event:TouchEvent){
    reset();
    if(loading||event.touches.length!==1||scroller.scrollTop>0||!canStart())return;
    const target=event.target as HTMLElement|null;
    if(!target||target.closest('input,textarea,select,button,a,[contenteditable="true"],.tw'))return;
    for(let node:HTMLElement|null=target;node&&node!==scroller;node=node.parentElement){
      if(node.scrollHeight>node.clientHeight+1&&/auto|scroll/.test(getComputedStyle(node).overflowY))return;
    }
    startX=event.touches[0].clientX;startY=event.touches[0].clientY;tracking=true;
  }
  function move(event:TouchEvent){
    if(!tracking)return;
    if(event.touches.length!==1||scroller.scrollTop>0||!canStart()){reset();return}
    const dx=event.touches[0].clientX-startX,dy=event.touches[0].clientY-startY;
    if(!locked){
      if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
      if(dy<=0||Math.abs(dx)>dy){reset();return}
      locked=true;
    }
    if(!event.cancelable){reset();return}
    event.preventDefault();distance=Math.min(104,Math.max(0,dy*.5));
    paint(distance,distance>=threshold?'Release to refresh':'Pull down to refresh',distance>=threshold?'armed':'pulling');
  }
  async function end(){
    const run=tracking&&distance>=threshold&&canStart();tracking=false;locked=false;distance=0;
    if(!run){reset();return}
    loading=true;paint(44,'Refreshing…','loading');
    try{await refresh()}catch{ /* Controller reports connection failures in the account status. */ }
    finally{loading=false;reset()}
  }
  scroller.addEventListener('touchstart',start,{passive:true});
  scroller.addEventListener('touchmove',move,{passive:false});
  scroller.addEventListener('touchend',end,{passive:true});
  scroller.addEventListener('touchcancel',reset,{passive:true});
  reset();
  return ()=>{scroller.removeEventListener('touchstart',start);scroller.removeEventListener('touchmove',move);scroller.removeEventListener('touchend',end);scroller.removeEventListener('touchcancel',reset);reset()};
}
