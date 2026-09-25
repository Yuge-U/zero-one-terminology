const initialDetail = document.getElementById('detail').innerHTML;
function resetCategoryView() {
 if (typeof Q !== 'undefined' && Q) { if (!Learning.finishQuiz(Q)) return false; Q=null; }
 document.getElementById('quizArea').style.display='none';
 document.getElementById('app').style.display='';
 selected=null; document.getElementById('app').classList.remove('show');
 document.getElementById('detail').innerHTML=initialDetail;
 document.getElementById('q').value=''; filters.favorites=false;filters.sentences=false;
 document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.remove('on');b.setAttribute('aria-pressed','false')});
 document.getElementById('terms').scrollTop=0;
 MotionDiagram.stop(); window.scrollTo(0,0);
}
function updateTermNavigation(){
 document.querySelector('.term-navigation')?.remove();
 const terms=visibleTerms(),index=terms.findIndex(t=>t.ID===selected);
 const nav=document.createElement('div');nav.className='term-navigation';nav.setAttribute('aria-label','用語の移動');
 for(const [delta,label,glyph] of [[-1,'前の用語','‹'],[1,'次の用語','›']]){
  const target=terms[index+delta],b=document.createElement('button');b.className=delta<0?'term-prev':'term-next';b.textContent=glyph;b.disabled=index<0||!target;b.setAttribute('aria-label',label+(target?'：'+target['正式/標準用語']:''));b.title=b.getAttribute('aria-label');b.onclick=()=>show(target.ID);nav.append(b);
 }
 document.getElementById('detail').append(nav);
}
