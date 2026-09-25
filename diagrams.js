/* Court illustrations are teaching examples, not a prescribed team playbook. */
window.MotionDiagram=(()=>{
 let timer=null,active=null,step=0;
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const court='<rect x="20" y="20" width="360" height="310" rx="2"/><path d="M142 20v138h116V20M65 20v65C65 265 335 265 335 85V20M142 158a58 58 0 0 0 116 0M180 39h40"/><circle cx="200" cy="49" r="10"/><path d="M168 49a32 32 0 0 0 64 0"/>';
 const p=(id,x,y,def=false,ball=false)=>({id,x,y,def,ball});
 const arrow=(x,y,X,Y,kind='move')=>({x,y,X,Y,kind});
 const frame=(title,caption,players=[],arrows=[],zones=[])=>({title,caption,players,arrows,zones});
 const circle=(x,y,r=23)=>({x,y,r});
 const rect=(x,y,w,h)=>({x,y,w,h});
 const zoneMap={Paint:[rect(142,20,116,138)],Nail:[circle(200,158,12)],Elbow:[circle(142,158,16),circle(258,158,16)],Slot:[circle(120,235),circle(280,235)],Wing:[circle(62,170),circle(338,170)],Corner:[circle(43,52,18),circle(357,52,18)],'Short corner':[circle(105,55,19),circle(295,55,19)],'Dunker spot':[circle(153,60,16),circle(247,60,16)],'Low post':[circle(135,95,20),circle(265,95,20)],'High post':[rect(136,137,128,40)],Top:[circle(200,250)],'Free throw line':[rect(142,155,116,6)],'Free throw line extended':[rect(20,155,360,6)],Baseline:[rect(20,20,360,5)],Sideline:[rect(20,20,5,310),rect(375,20,5,310)],Hoop:[circle(200,49,14)],'Split line':[rect(197,20,6,310)],'Passing lane':[]};
 const cuts={
 'Backdoor cut':[[75,185],[95,210],[185,75]],'Basket cut':[[75,185],[130,130],[185,75]],'45 cut':[[75,185],[130,130],[185,75]],'Curl cut':[[60,80],[110,155],[185,75]],'Flare cut':[[200,210],[280,200],[340,170]],'Flash cut':[[130,65],[160,110],[200,158]],'Flex cut':[[50,60],[130,85],[210,70]],'Iverson cut':[[50,180],[200,160],[350,180]],'Shuffle cut':[[75,210],[170,155],[230,70]],'UCLA cut':[[200,250],[150,158],[165,80]],'V-cut':[[60,185],[115,120],[65,215]],'L-cut':[[135,70],[135,190],[65,190]],'I-cut':[[70,185],[115,105],[70,185]],'Banana cut':[[65,215],[120,150],[190,75]],'Popout cut':[[140,90],[130,165],[90,220]],'Shallow cut':[[200,250],[110,190],[55,90]],Drift:[[335,170],[345,100],[345,50]],Lift:[[345,50],[340,155],[285,230]],Shake:[[345,50],[340,155],[285,230]],Fill:[[340,180],[290,230],[200,250]],Replace:[[340,180],[290,230],[200,250]],Relocate:[[70,180],[60,120],[45,55]],Zipper:[[140,75],[140,155],[140,240]],'Green cut':[[145,55],[200,65],[260,55]]};
 const spacing={
 '5-Out':[[200,250],[65,185],[335,185],[45,50],[355,50]],'4-Out 1-In':[[125,235],[275,235],[45,65],[355,65],[240,85]],'3-Out 2-In':[[200,250],[65,180],[335,180],[140,85],[260,85]],Horns:[[200,250],[142,158],[258,158],[45,50],[355,50]],'Box set':[[200,250],[142,158],[258,158],[142,75],[258,75]],Diamond:[[200,250],[200,160],[100,100],[300,100],[200,70]],'2-3':[[130,195],[270,195],[70,80],[200,70],[330,80]],'3-2':[[80,190],[200,210],[320,190],[130,75],[270,75]],'1-3-1':[[200,245],[80,165],[200,150],[320,165],[200,60]],'1-1-3':[[200,245],[200,175],[70,80],[200,65],[330,80]],'2-1-2':[[130,220],[270,220],[200,160],[110,70],[290,70]],'1-2-2':[[200,250],[100,180],[300,180],[100,70],[300,70]],'1-2-1-1':[[200,270],[90,200],[310,200],[200,135],[200,55]],'2-2-1':[[100,250],[300,250],[100,160],[300,160],[200,55]]};
 function plan(t){
  const name=t['正式/標準用語'],definition=t['定義']||'',n=name.toLowerCase();
  const result=(kind,frames,note='位置・距離・タイミングは説明用の一例です。')=>({kind,frames,note});
  if(zoneMap[name])return result('コートの位置',[frame(name,definition,[],[],zoneMap[name])],'色のついた部分が該当する位置です。エリアの呼び方には幅があります。');
  if(['Ball side','Strong side','Help side','Weak side'].includes(name)){
   const opposite=['Help side','Weak side'].includes(name);return result('ボールを基準に見る',[frame('ボールが右側',definition,[p('1',320,190,false,true)],[],[rect(opposite?20:200,20,180,280)]),frame('ボールが左側','ボールが移ると、左右の呼び方も入れ替わります。',[p('1',80,190,false,true)],[],[rect(opposite?200:20,20,180,280)])]);
  }
  if(['Backcourt','Frontcourt','Center circle'].includes(name))return {kind:'フルコートの位置',full:true,note:'攻撃方向を上にした図です。攻守が入れ替わると前後も変わります。',frames:[frame(name,definition,[],[],name==='Center circle'?[circle(200,175,30)]:[rect(20,name==='Frontcourt'?20:175,360,155)])]};
  const alignment=spacing[name]||spacing[name.replace(' zone','')];
  if(alignment){const defense=/zone|^\d-\d/.test(n)&&name!=='5-Out'&&name!=='4-Out 1-In'&&name!=='3-Out 2-In';return result('基本配置',[frame('配置を確認',definition,alignment.map(([x,y],i)=>p(String(i+1),x,y,defense,i===0&&!defense)))],'番号は説明用です。固定のポジション番号ではありません。ゾーンはボールに応じて動きます。');}
  if(cuts[name]){const a=cuts[name],screen=/Curl|Flex|Iverson|Shuffle|UCLA|Popout|Zipper/.test(name);return result('オフボールの移動',a.map(([x,y],i)=>frame(['準備','方向・角度を変える','受ける位置へ'][i],i===0?definition:i===1?'ボールと守備の位置を見て、動き出すタイミングを合わせます。':'移動先でパスを受けられる向きと間隔を作ります。',[p('1',300,220,false,true),p('2',x,y),...(screen?[p('5',145,155)]:[])],i?[arrow(...a[i-1],x,y)]:[])));}
  const coverage=['Drop','At the level','Hedge','Blitz','Switch','Under','Over','ICE','Show and recover'];
  if(coverage.includes(name)){
   const starts=[p('1',200,245,false,true),p('5',250,220),p('1',200,220,true),p('5',260,160,true)];
   let d1=[240,220],d5=[255,135],ex='ビッグが下がり、ボールとローラーの両方を見る。';
   if(name==='At the level'){d5=[270,210];ex='ビッグがスクリーンの高さへ上がって進路を抑える。';}
   if(name==='Hedge'||name==='Show and recover'){d5=[290,240];ex='ビッグが一時的に外へ出て、ボールの進路を変える。';}
   if(name==='Blitz'){d1=[260,215];d5=[300,215];ex='2人の守備でボール保持者を囲み、パスを出させる。';}
   if(name==='Switch'){d1=[235,150];d5=[280,205];ex='守備の1番と5番が担当を交換する。';}
   if(name==='Under'){d1=[230,185];ex='ボール担当がスクリーンのリング側を通る。';}
   if(name==='Over'){d1=[275,235];ex='ボール担当が保持者側を追い、後ろから戻る。';}
   if(name==='ICE'){return result('サイドPnRの守り',[frame('中央側を閉じる',definition,[p('1',325,180,false,true),p('5',275,190),p('1',300,185,true),p('5',300,95,true)]),frame('ベースライン側へ誘導','ボール担当が中央を閉じ、ビッグはリング側で侵入に備える。',[p('1',340,120,false,true),p('5',265,150),p('1',325,155,true),p('5',310,85,true)],[arrow(325,180,340,120,'dribble')])]);}
   return result('スクリーンへの守備',[frame('スクリーン前',definition,starts),frame('対応する',ex,[p('1',280,220,false,true),p('5',230,150),p('1',...d1,true),p('5',...d5,true)],[arrow(200,245,280,220,'dribble'),arrow(250,220,230,150),arrow(200,220,...d1,'defense'),arrow(260,160,...d5,'defense')]),frame('次の対応',name==='Blitz'?'残る守備がパス先をカバーする。':name==='Switch'?'交換後の担当とミスマッチを確認する。':name==='Hedge'||name==='Show and recover'?'ボール担当が戻り、ビッグはローラーへ戻る。':'ボール・ローラー・周囲へのパスを見て守備を続ける。',[p('1',285,185,false,true),p('5',220,90),p('1',name==='Switch'?220:285,name==='Switch'?115:205,true),p('5',name==='Switch'?270:235,name==='Switch'?165:115,true)])]);
  }
  if(['Pick and roll','Pick and pop','Ball screen','High ball screen','Roll','Roller','Pop','Popper','Short roll','Deep roll','Slip','Ghost screen','Screener','Ball handler'].includes(name)){
   const pop=/Pop|pop|Ghost/.test(name),slip=['Slip','Ghost screen'].includes(name),end=pop?[320,230]:name==='Short roll'?[220,150]:[220,80];
   return result('2人の連携',[frame('スクリーンの準備',definition,[p('1',180,240,false,true),p('5',240,215),p('1',185,215,true)]),frame(slip?'接触前に離れる':'スクリーンを利用',slip?'守備の反応を見て、スクリーナーが早く離れる。':'ボール保持者はスクリーンの近くを通って守備とのずれを作る。',[p('1',280,205,false,true),p('5',...end),p('1',220,230,true)],[arrow(180,240,280,205,'dribble'),arrow(240,215,...end)]),frame(pop?'外で受ける':'リング側で受ける',pop?'外へ開いてパスとシュートに備える。':'ボール保持者は自分の攻めと、ローラーへのパスを判断する。',[p('1',280,205),p('5',...end,false,true),p('1',255,215,true)],[arrow(280,205,...end,'pass')])]);
  }
  if(['DHO','Get action','Grenade action','Chase action','Give and go','High-Low','Post entry','Entry pass'].includes(name)){
   const give=name==='Give and go',post=['High-Low','Post entry','Entry pass'].includes(name);
   const a=post?[200,170]:[100,220],b=post?[230,80]:[200,190],c=give?[190,75]:[220,150];
   return result('パスと移動',[frame('準備',definition,[p('1',...a,false,give||post),p('5',...b,false,!give&&!post)]),frame(give||post?'パスを通す':'ボールへ近づく',post?'受け手が守備との位置関係を作り、パスを受ける。':give?'パスした選手は止まらずリングへ切る。':'受け手は保持者の近くを通り、短い距離でボールを受け取る。',[p('1',...(post?a:c),false,!post&&!give),p('5',...b,false,post||give)],[give||post?arrow(...a,...b,'pass'):arrow(...b,...c,'pass'),...(!post?[arrow(...a,...c)]:[])]),frame('次のプレー',give?'カットした選手へリターンパス。':post?'キャッチ後はシュート・パス・ポストプレーを読む。':'受け取った選手がドリブルで攻める。',[p('1',...c,false,!post),p('5',...b,false,post)],give?[arrow(...b,...c,'pass')]:[])]);
  }
  if(/pass$/i.test(name)&&!['Pass fake'].includes(name)){
   const kick=/kick-out/i.test(name),skip=/skip|baseball|advance|kick-ahead|outlet/i.test(name),a=kick?[210,105]:[100,230],b=kick?[345,160]:skip?[320,90]:[270,170];
   return result('ボールの移動',[frame('出し手と受け手',definition,[p('1',...a,false,true),p('2',...b)]),frame('パスを送る','点線はボールの移動です。手の使い方や高さは下の説明と合わせて確認してください。',[p('1',...a),p('2',...b,false,true)],[arrow(...a,...b,'pass')])],'上から見たパスの方向です。リリースやバウンドの高さは表していません。');
  }
  if(['Closeout','Full closing out','Smart closing out','Help','Help and recover','Stunt','Nail help','Low man','Tag','Gap','X-out','X-out switch','Box out'].includes(name)){
   const close=/clos/i.test(name),box=name==='Box out',xout=/X-out/.test(name),start=close?[210,100]:[300,150],end=close?[315,175]:box?[200,100]:[210,130];
   return result('守備の位置と移動',[frame('状況を確認',definition,[p('1',330,190,false,true),p('2',200,90),p('1',...start,true),...(xout?[p('2',190,90,true)]:[])]),frame(box?'相手とリングの間を取る':close?'距離を詰める':'ヘルプへ動く',box?'相手の位置を確認し、リバウンドに入る空間を確保する。':close?'近づくほど減速し、シュートとドライブへ反応できる姿勢を保つ。':'ボールと担当選手を見ながら、必要な距離だけ動く。',[p('1',330,190,false,true),p('2',200,75),p('1',...end,true),...(xout?[p('2',330,180,true)]:[])],[arrow(...start,...end,'defense'),...(xout?[arrow(190,90,330,180,'defense')]:[])]),frame('次の役割へ','守ったあとも、ボールと担当の位置を確認して次のプレーに備える。',[p('1',330,190,false,true),p('1',...(name==='Help and recover'||name==='Stunt'?start:end),true)])]);
  }
  const extended=window.MotionExamples?.plan(t,{p,arrow,frame,circle,rect,result});if(extended)return extended;
  // Abstract rules, statistics and technique details need explanation, not invented court movements.
  return {kind:'意味と使い方を整理',concept:true,name,definition,use:t['NBA/欧州での使用例']||'',english:qEnglishSafe(t),note:'この用語は、下の説明で動作・役割・判断のポイントを確認してください。'};
 }
 function qEnglishSafe(t){return typeof ENGLISH!=='undefined'?ENGLISH[t['正式/標準用語']]:null}
 function svg(f,full){if(f.art)return '<svg viewBox="0 0 400 350" role="img" aria-label="'+E(f.title+'。'+f.caption)+'">'+f.art+'</svg>';return '<svg viewBox="0 0 400 350" role="img" aria-label="'+E(f.title+'。'+f.caption)+'"><defs><marker id="motion-tip" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="context-stroke"/></marker></defs><g class="diagram-court">'+(full?'<rect x="20" y="20" width="360" height="310"/><path d="M20 175h360M142 20v65h116V20M142 330v-65h116v65"/><circle cx="200" cy="175" r="30"/><circle cx="200" cy="40" r="9"/><circle cx="200" cy="310" r="9"/>':court)+'</g>'+f.zones.map(z=>z.r?'<circle class="diagram-zone" cx="'+z.x+'" cy="'+z.y+'" r="'+z.r+'"/>':'<rect class="diagram-zone" x="'+z.x+'" y="'+z.y+'" width="'+z.w+'" height="'+z.h+'"/>').join('')+f.arrows.map(a=>'<path class="diagram-route '+a.kind+'" d="M'+a.x+' '+a.y+' L'+a.X+' '+a.Y+'" marker-end="url(#motion-tip)"/>').join('')+f.players.map(p=>'<g class="diagram-player '+(p.def?'defender':'attacker')+'" transform="translate('+p.x+' '+p.y+')">'+(p.def?'<rect x="-13" y="-13" width="26" height="26" rx="6"/>':'<circle r="14"/>')+'<text text-anchor="middle" y="5">'+E(p.id)+'</text>'+(p.ball?'<circle class="diagram-ball" cx="14" cy="-13" r="6"/>':'')+'</g>').join('')+'<text x="200" y="345" text-anchor="middle" class="diagram-orientation">'+(full?'↑ 攻撃方向':'↑ 攻めるリング')+'</text></svg>'}
 function stop(){clearInterval(timer);timer=null;const b=document.querySelector('[data-motion-play]');if(b){b.textContent='▶ 手順を再生';b.setAttribute('aria-pressed','false')}}
 function draw(){const el=document.getElementById('motionDiagram');if(!el||!active)return;const f=active.frames[step];el.querySelector('.diagram-stage').innerHTML=svg(f,active.full);el.querySelector('.diagram-caption').innerHTML='<b>'+E(f.title)+'</b><p>'+E(f.caption)+'</p>';el.querySelectorAll('[data-motion-step]').forEach((b,i)=>{b.classList.toggle('on',i===step);b.setAttribute('aria-pressed',String(i===step))})}
 function mount(t){stop();step=0;active=plan(t);const el=document.getElementById('motionDiagram');if(!el)return;
  const heading=el.closest('.section')?.querySelector('h3');if(heading)heading.textContent=active.concept?'SEE｜ポイントを整理':'SEE｜動きで見る';
  if(active.concept){el.innerHTML='<div class="concept-board"><div class="diagram-kicker">CONCEPT GUIDE</div><h4>'+E(active.name)+'</h4><div class="concept-block"><span>01 意味・動作のポイント</span><p>'+E(active.definition)+'</p></div><div class="concept-block"><span>02 使われる場面</span><p>'+E(active.use||'用語の意味と、実際のプレーの状況を合わせて確認します。')+'</p></div>'+(active.english?'<div class="concept-block"><span>03 コートでの言葉</span><p>'+E(active.english[0])+'<br><small>'+E(active.english[1])+'</small></p></div>':'')+'</div>';return;}
  el.innerHTML='<div class="diagram-board"><div class="diagram-kicker">'+E(active.kind)+'</div><div class="diagram-stage"></div><div class="diagram-legend"><span>● 攻撃</span><span>■ 守備</span><span>🟠 ボール</span><span>→ 移動</span><span>青の点線：ドリブル</span><span>黄の破線：パス</span></div><div class="diagram-steps">'+active.frames.map((f,i)=>'<button data-motion-step="'+i+'" aria-pressed="false">'+(i+1)+' '+E(f.title)+'</button>').join('')+'</div><div class="diagram-caption" aria-live="polite"></div>'+(active.frames.length>1?'<button class="diagram-play" data-motion-play aria-pressed="false">▶ 手順を再生</button>':'')+'<p class="diagram-note">'+E(active.note)+'</p></div>';
  el.querySelectorAll('[data-motion-step]').forEach(b=>b.onclick=()=>{stop();step=+b.dataset.motionStep;draw()});const play=el.querySelector('[data-motion-play]');if(play)play.onclick=()=>{if(timer){stop();return}step=0;draw();play.textContent='Ⅱ 一時停止';play.setAttribute('aria-pressed','true');timer=setInterval(()=>{if(!document.getElementById('motionDiagram')||step===active.frames.length-1){stop();return}step++;draw()},1800)};if(active.frames[0].art)el.querySelector('.diagram-legend').textContent=active.kind.includes('足')?'青：左足　橙：右足　円：軸の位置':'青：選手　橙：ボールとシュートの軌道';draw();
 }
 return {mount,stop,plan};
})();
