const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)], video=$('#video'), canvas=$('#canvas'), ctx=canvas.getContext('2d');
const makeup=$('#makeup'),makeupCtx=makeup.getContext('2d'),frameBuffer=document.createElement('canvas'),frameCtx=frameBuffer.getContext('2d');let faceLandmarker=null,faceLoopStarted=false,lastDetection=0,lastVideoTime=-1,lastFaces=[],lipsAvailable=true;
const filters=[['Tự nhiên','none'],['Nắng ấm','sepia(.2) saturate(1.2) brightness(1.07)'],['Trong trẻo','contrast(.92) saturate(.8) brightness(1.13)'],['Cổ điển','grayscale(1) contrast(1.08)']];
const frames=[
 {name:'Hoa ép',bg:'#fff2e9',ink:'#98736d',type:'paper',paper:0,label:'LA VIE EN ROSE'},
 {name:'Nơ hồng',bg:'#f9dce1',ink:'#a66e7c',type:'paper',paper:1,label:'SEALED WITH LOVE'},
 {name:'Cherry ngọt',bg:'#fff3e3',ink:'#a5615d',type:'paper',paper:2,label:'CHERRY SWEET CLUB'},
 {name:'Mơ tím',bg:'#e6dded',ink:'#827194',type:'paper',paper:3,label:'A LITTLE DAYDREAM'},
 {name:'Daisy day',bg:'#dcead9',ink:'#68866b',type:'paper',paper:0,sheet:1,label:'HAVE A LOVELY DAY'},
 {name:'Vintage film',bg:'#e6d9c9',ink:'#806a5b',type:'paper',paper:1,sheet:1,label:'MEMORIES ON FILM'},
 {name:'Cloud nine',bg:'#e4edf2',ink:'#7297aa',type:'paper',paper:2,sheet:1,label:'HEAD IN THE CLOUDS'},
 {name:'Minimal',bg:'#fffaf4',ink:'#886f65',type:'paper',paper:3,sheet:1,label:'LITTLE MOMENTS'}
];
let filter=0,frame=0,timer=3,count=4,layout=0,mirrored=true,sound=true,stream=null,photos=[],busy=false,audio,renderVersion=0;
// photos: [{lips:dataURL có son, plain:dataURL không son}] — chụp từ cùng một khung hình.
let resultVersion=0,retakeIndex=null,lipsOn=true,cameraReady=false,preparing=false,doneTimer=null;
try{const saved=localStorage.getItem('cola-lips');if(saved!==null)lipsOn=saved==='1'}catch(e){}
const mobileMQ=matchMedia('(max-width:1023px)'),reduceMQ=matchMedia('(prefers-reduced-motion: reduce)');
const behavior=()=>reduceMQ.matches?'auto':'smooth';
const photoUrls=()=>photos.map(p=>lipsOn?p.lips:p.plain);
const layoutNames=n=>n===1?['Polaroid','Bưu thiếp','Chân dung','Điện ảnh']:n===2?['Dải đôi','Cặp đôi','Nhật ký','Phim đôi']:n===3?['Dải ba','Tạp chí','Câu chuyện','Bộ ba']:['Dải bốn','Ô kỷ niệm','Trang nhật ký','Cuộn phim'];
const isDone=()=>photos.length===count&&retakeIndex===null;
// Ô sẽ chụp tiếp theo (dùng cho guide, chấm tiến độ, viền nhấp nháy).
const nextIndex=()=>retakeIndex!==null?retakeIndex:photos.length<count?photos.length:-1;
const guideIndex=()=>{const i=nextIndex();return i<0?0:i};

$('#filters').innerHTML=filters.map((f,i)=>`<button type="button" class="filter" data-filter="${i}" aria-pressed="${i===filter}"><span class="filter-art" style="filter:${f[1]}" aria-hidden="true">✿</span>${f[0]}</button>`).join('');
const frameCard=(f,i,attr)=>`<button type="button" class="frame-card" data-index="${i}" aria-label="Khung ${f.name}" aria-pressed="${i===frame}"><canvas width="180" height="240" ${attr}="${i}"></canvas><span>${f.name}</span></button>`;
$('#frames').innerHTML=frames.map((f,i)=>frameCard(f,i,'data-preview')).join('');
$('#resultFrames').innerHTML=frames.map((f,i)=>frameCard(f,i,'data-rpreview')).join('');

function tone(freq,duration=.09){if(!sound)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.09,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch(e){}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- Lựa chọn ---------- */
function syncChoices(){
  $$('.filter').forEach(b=>{const on=+b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on)});
  $$('.frame-card').forEach(b=>{const on=+b.dataset.index===frame;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on)});
  $('#frameName').textContent=frames[frame].name;
  $$('[data-timer]').forEach(b=>{const on=+b.dataset.timer===timer;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on)});
  $('#timerChip').textContent=`⏱ ${timer}s`;$('#timerChip').setAttribute('aria-label',`Hẹn giờ ${timer} giây, bấm để đổi`);
  $$('.lips-switch').forEach(b=>b.setAttribute('aria-checked',lipsOn));
}
function controls(){
  $('#counts').innerHTML=[1,2,3,4].map(n=>`<button type="button" data-count="${n}" class="${n===count?'active':''}" aria-pressed="${n===count}" ${retakeIndex!==null?'disabled':''}>${n} ảnh</button>`).join('');
  const names=layoutNames(count);
  const html=names.map((n,i)=>{const geo=geometry(count,i);const mini=geo.boxes.map(([x,y,w,h])=>`<i style="left:${x/geo.w*100}%;top:${y/geo.h*100}%;width:${w/geo.w*100}%;height:${h/geo.h*100}%"></i>`).join('');return `<button type="button" data-layout="${i}" class="${i===layout?'active':''}" aria-pressed="${i===layout}"><span class="layout-icon" aria-hidden="true">${mini}</span><span>${n}</span></button>`}).join('');
  $('#layouts').innerHTML=html;$('#resultLayouts').innerHTML=html;
  $('#layoutName').textContent=names[layout];$('#lipsCount').textContent=count;
}
$('#sound').onclick=()=>{sound=!sound;$('#sound b').textContent=sound?'ON':'OFF';$('#sound').setAttribute('aria-pressed',sound);if(sound)tone(660)};
$('#filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b||busy)return;filter=+b.dataset.filter;syncChoices();video.style.filter=photoFilter();tone(600)};
function onFrame(e){const b=e.target.closest('[data-index]');if(!b||busy)return;frame=+b.dataset.index;syncChoices();renderAll();tone(600)}
$('#frames').onclick=onFrame;$('#resultFrames').onclick=onFrame;
$('#counts').onclick=e=>{const b=e.target.closest('[data-count]');if(!b||busy||retakeIndex!==null)return;const n=+b.dataset.count;if(n!==count){count=n;layout=0;photos=[];hideDone()}controls();renderAll();updateUI();tone(600)};
function onLayout(e){const b=e.target.closest('[data-layout]');if(!b||busy)return;layout=+b.dataset.layout;controls();renderAll();updateUI();tone(600)}
$('#layouts').onclick=onLayout;$('#resultLayouts').onclick=onLayout;
$$('[data-timer]').forEach(b=>b.onclick=()=>{if(busy)return;timer=+b.dataset.timer;syncChoices();tone(600)});
$('#timerChip').onclick=()=>{if(busy)return;const order=[3,5,10];timer=order[(order.indexOf(timer)+1)%order.length];syncChoices();tone(600)};
$$('.mirror-btn').forEach(b=>b.onclick=()=>{if(busy)return;mirrored=!mirrored;video.style.transform=mirrored?'scaleX(-1)':'none';makeup.style.transform=video.style.transform;tone(600)});
$$('.lips-switch').forEach(b=>b.onclick=()=>{if(b.disabled)return;lipsOn=!lipsOn;try{localStorage.setItem('cola-lips',lipsOn?'1':'0')}catch(e){}syncChoices();renderAll();tone(600)});
$$('.mobile-tabs [data-tab]').forEach(b=>b.onclick=()=>{$('#options').dataset.tab=b.dataset.tab;$$('.mobile-tabs [data-tab]').forEach(x=>x.setAttribute('aria-selected',x===b))});
$('#layoutToggle').onclick=()=>{const g=$('.r-layout'),open=!g.classList.contains('open');g.classList.toggle('open',open);$('#layoutToggle').setAttribute('aria-expanded',open)};

/* ---------- Trạng thái giao diện ---------- */
function updateUI(){
  const n=count,i=guideIndex(),shooting=busy;
  // Dòng hướng dẫn
  let hint;
  if(shooting)hint=retakeIndex!==null?`Chụp lại tấm ${i+1} — giữ dáng nhé!`:`Tấm ${i+1} / ${n} — giữ dáng nhé!`;
  else if(preparing)hint='Đang chuẩn bị hiệu ứng…';
  else if(retakeIndex!==null)hint=`Chụp lại tấm ${i+1} — canh mặt vào ô sáng nhé`;
  else hint=mobileMQ.matches?'Canh mặt vào ô sáng nhé':'Canh mặt vào ô sáng — đó là phần sẽ lên ảnh';
  $('#hint').textContent=hint;
  // Nút chụp
  const label=shooting?(retakeIndex!==null?`Đang chụp lại tấm ${i+1}…`:`Đang chụp ${i+1}/${n}…`):retakeIndex!==null?`Chụp lại tấm ${i+1}`:`Chụp ${n} tấm`;
  $('#shootText').textContent=label;$('#shoot').setAttribute('aria-label',label);
  $('#shoot').disabled=!cameraReady||shooting;
  $('#cancelRetake').hidden=retakeIndex===null||shooting;
  document.body.classList.toggle('is-busy',shooting);
  // Chấm tiến độ và dải mini
  const next=nextIndex(),urls=photoUrls();
  const state=k=>k===next?'next':(retakeIndex!==null||k<photos.length)?'done':'';
  $('#dots').innerHTML=Array.from({length:n},(_,k)=>`<i class="${state(k)}"></i>`).join('');
  $('#miniStrip').innerHTML=Array.from({length:n},(_,k)=>`<i class="${k===next?'next':''}" ${urls[k]&&k!==next?`style="background-image:url(${urls[k]})"`:''}></i>`).join('');
  const shot=retakeIndex!==null?count-1:photos.length;
  $('#miniCount').textContent=`${Math.min(shot,n)}/${n}`;
  updateGuide();
}
function updateGuide(){
  const g=$('#guide');g.hidden=!stream;
  const geo=geometry(count,layout),i=guideIndex(),[, ,w,h]=geo.boxes[i],r=w/h;
  let gw=1,gh=1;if(r<1.5)gw=r/1.5;else gh=1.5/r;
  g.style.width=gw*100+'%';g.style.height=gh*100+'%';
  const ow=Math.min(.2/gw,.9),oh=Math.min(.46/gh,.9),oval=$('#faceOval');
  oval.style.width=ow*100+'%';oval.style.height=oh*100+'%';oval.style.top=(46-oh*50)+'%';
  const shape=Math.abs(r-1)<.12?'ô vuông':r>1?'ô ngang':'ô dọc';
  $('#guideLabel').textContent=`Tấm ${i+1}/${count} · ${shape}`;
}
mobileMQ.addEventListener('change',()=>updateUI());

/* ---------- Máy ảnh ---------- */
function revealStudio(){
  if(!document.body.classList.contains('view-studio'))return;
  if(!mobileMQ.matches){const s=$('#studio'),hh=$('.site-header').offsetHeight;if(Math.abs(s.getBoundingClientRect().top-hh)>2)s.scrollIntoView({block:'start',behavior:behavior()})}
  else{const r=$('#camera').getBoundingClientRect(),top=$('.site-header').offsetHeight,bottom=innerHeight-$('.dock').offsetHeight;if(r.top<top||r.bottom>bottom)$('#camera').scrollIntoView({block:'center',behavior:behavior()})}
}
$('#startCamera').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw Error();revealStudio();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});video.srcObject=stream;await video.play();video.style.display='block';video.style.visibility='hidden';$('#placeholder').style.display='none';video.style.filter=photoFilter();makeup.style.display='block';if(!faceLoopStarted){faceLoopStarted=true;requestAnimationFrame(renderMakeup)}preparing=true;updateUI();await Promise.race([initMakeup(),wait(20000)]);if(!faceLandmarker)setLipsAvailable(false);preparing=false;cameraReady=true;updateUI();tone(700)}catch(e){preparing=false;$('#placeholder p').textContent='Không thể bật máy ảnh. Hãy cho phép quyền truy cập camera trong trình duyệt rồi thử lại nhé.';updateUI()}};
// Hai bản từ CÙNG một khung hình: cùng cách cắt 3:2, cùng lật gương; một bản có son, một bản không.
function capture(){
  const useFrame=frameBuffer.width>0&&frameBuffer.height>0&&makeup.width>0;
  const W=useFrame?frameBuffer.width:video.videoWidth,H=useFrame?frameBuffer.height:video.videoHeight;
  const src=document.createElement('canvas');src.width=W;src.height=H;const s=src.getContext('2d');
  s.filter=photoFilter();s.drawImage(useFrame?frameBuffer:video,0,0,W,H);s.filter='none';
  const crop=()=>{canvas.width=960;canvas.height=640;ctx.save();if(mirrored){ctx.translate(canvas.width,0);ctx.scale(-1,1)}const ratio=canvas.width/canvas.height;let sw=W,sh=H;if(W/H>ratio)sw=H*ratio;else sh=W/ratio;ctx.drawImage(src,(W-sw)/2,(H-sh)/2,sw,sh,0,0,canvas.width,canvas.height);ctx.restore();return canvas.toDataURL('image/jpeg',.92)};
  const plain=crop();
  s.globalCompositeOperation='multiply';for(const face of (useFrame?lastFaces:[]))paintLips(s,face,W,H);s.globalCompositeOperation='source-over';
  return {lips:crop(),plain};
}
function showCount(n){const el=$('#countdown');el.className='countdown';el.textContent=n;void el.offsetWidth;el.classList.add('pop')}
async function shoot(){
  if(!stream||busy||!cameraReady)return;
  const single=retakeIndex!==null;
  busy=true;hideDone();revealStudio();
  if(!single)photos=[];
  renderAll();updateUI();
  const total=single?1:count;
  for(let k=0;k<total;k++){
    for(let n=timer;n>0;n--){showCount(n);tone(500);await wait(1000)}
    $('#countdown').textContent='';$('#countdown').className='';
    const shot=capture();
    if(single)photos[retakeIndex]=shot;else photos.push(shot);
    $('#flash').className='flash';tone(950,.2);await wait(400);$('#flash').className='';
    if(!single){renderAll();updateUI()}
  }
  busy=false;
  if(single){retakeIndex=null;controls();renderAll();updateUI();showView('result');return}
  updateUI();showDone();
}
$('#shoot').onclick=shoot;
$('#cancelRetake').onclick=()=>{retakeIndex=null;controls();renderAll();updateUI();showView('result')};
function showDone(){$('#doneCount').textContent=count;$('#done').hidden=false;clearTimeout(doneTimer);doneTimer=setTimeout(()=>{if(!$('#done').hidden)showView('result')},1000)}
function hideDone(){clearTimeout(doneTimer);$('#done').hidden=true}
$('#seeResult').onclick=()=>showView('result');
document.addEventListener('keydown',e=>{
  if(e.code!=='Space'&&e.key!==' ')return;
  const t=e.target;if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]'))return;
  if(!document.body.classList.contains('view-studio')||!stream||busy||!cameraReady)return;
  e.preventDefault();if(e.repeat)return;
  if(document.activeElement&&document.activeElement!==document.body)document.activeElement.blur();
  shoot();
});

/* ---------- Hai view: studio và thành quả ---------- */
function showView(v,push=true){
  if(v==='result'&&photos.length!==count)v='studio';
  hideDone();hideAsk();
  if(v==='result')retakeIndex=null;
  document.body.classList.toggle('view-studio',v==='studio');document.body.classList.toggle('view-result',v==='result');
  if(push&&history.state?.view!==v)history.pushState({view:v},'');
  window.scrollTo({top:0,behavior:'auto'});
  controls();syncChoices();updateUI();renderAll();
}
addEventListener('popstate',e=>showView(e.state?.view||'studio',false));
$('#backStudio').onclick=()=>showView('studio');
$('#brandLink').onclick=e=>{e.preventDefault();if(document.body.classList.contains('view-result'))showView('studio');else window.scrollTo({top:0,behavior:behavior()})};
function startRetake(i){if(photos.length!==count)return;showView('studio');retakeIndex=i;controls();renderAll();updateUI();requestAnimationFrame(revealStudio);tone(600)}
$('#shots').onclick=e=>{const b=e.target.closest('[data-retake]');if(b)startRetake(+b.dataset.retake)};
$('#newSession').onclick=()=>{photos=[];retakeIndex=null;showView('studio');tone(600)};
// Chạm vào một ô trên dải ảnh để chụp lại tấm đó.
$('#resultImg').onclick=e=>{const img=e.currentTarget,geo=geometry(count,layout),x=e.offsetX/img.offsetWidth*geo.w,y=e.offsetY/img.offsetHeight*geo.h;const i=geo.boxes.findIndex(([bx,by,bw,bh])=>x>=bx-6&&x<=bx+bw+6&&y>=by-6&&y<=by+bh+6);if(i>=0)askRetake(i)};
let askIndex=null;
function askRetake(i){askIndex=i;$('#askText').textContent=`Chụp lại tấm ${i+1}?`;$('#retakeAsk').hidden=false;$('#askYes').focus()}
function hideAsk(){$('#retakeAsk').hidden=true;askIndex=null}
$('#askNo').onclick=hideAsk;$('#askYes').onclick=()=>{const i=askIndex;hideAsk();if(i!==null)startRetake(i)};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#retakeAsk').hidden)hideAsk()});
$('#download').onclick=async()=>{if(photos.length!==count)return;const out=document.createElement('canvas');await drawDesign(out,frame,count,layout,photoUrls());const a=document.createElement('a');a.download='cola-photobooth.png';a.href=out.toDataURL('image/png');a.click();tone(750,.2)};

/* ---------- Vẽ ---------- */
// A single canvas renderer powers frame previews, the result, and the downloaded image.
function geometry(n,style){const w=900,p=100,g=35,ph=460;let boxes=[],h;if(style===0){for(let i=0;i<n;i++)boxes.push([p,150+i*(ph+g),w-p*2,ph]);h=150+n*(ph+g)+280}else if(style===1){if(n===1){h=1050;boxes=[[95,170,710,500]]}else if(n===2){h=1130;boxes=[[95,175,335,605],[470,175,335,605]]}else if(n===3){h=1270;boxes=[[95,160,710,420],[95,620,335,300],[470,620,335,300]]}else{h=1350;boxes=[[95,160,335,360],[470,160,335,360],[95,560,335,360],[470,560,335,360]]}}else if(style===2){if(n===1){h=1230;boxes=[[175,155,550,700]]}else if(n===2){h=1250;boxes=[[105,170,690,360],[105,575,690,360]]}else if(n===3){h=1350;boxes=[[95,160,435,730],[570,160,235,345],[570,545,235,345]]}else{h=1480;boxes=[[95,150,710,410],[95,600,220,480],[340,600,220,480],[585,600,220,480]]}}else{if(n===1){h=1000;boxes=[[75,190,750,420]]}else if(n===2){h=1150;boxes=[[95,155,710,380],[95,575,710,280]]}else if(n===3){h=1300;boxes=[[95,160,220,780],[340,160,220,780],[585,160,220,780]]}else{h=1450;boxes=[[95,150,335,510],[470,150,335,240],[470,425,335,235],[95,700,710,360]]}}return{w,h,boxes}}
function flower(c,x,y,r,color,center){c.save();c.translate(x,y);c.fillStyle=color;for(let i=0;i<5;i++){c.rotate(Math.PI*2/5);c.beginPath();c.ellipse(0,-r*.5,r*.25,r*.52,0,0,Math.PI*2);c.fill()}c.fillStyle=center;c.beginPath();c.arc(0,0,r*.22,0,7);c.fill();c.restore()}
function heart(c,x,y,s,color){c.save();c.translate(x,y);c.scale(s,s);c.fillStyle=color;c.beginPath();c.moveTo(0,.35);c.bezierCurveTo(-1,-.3,-.5,-.95,0,-.45);c.bezierCurveTo(.5,-.95,1,-.3,0,.35);c.fill();c.restore()}
function sparkle(c,x,y,r,color){c.save();c.fillStyle=color;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,rad=i%2?r*.22:r;c.lineTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad)}c.closePath();c.fill();c.restore()}
function cherry(c,x,y,s){c.save();c.strokeStyle='#789370';c.lineWidth=s*.08;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+s*.15,y-s*.8,x+s*.55,y-s);c.moveTo(x+s*.5,y+s*.05);c.quadraticCurveTo(x+s*.45,y-s*.6,x+s*.55,y-s);c.stroke();c.fillStyle='#c84b5b';for(const dx of [0,.5]){c.beginPath();c.arc(x+s*dx,y,s*.23,0,7);c.fill()}c.fillStyle='#789370';c.beginPath();c.ellipse(x+s*.72,y-s*.85,s*.25,s*.1,-.5,0,7);c.fill();c.restore()}
function decorations(c,f,w,h){const t=f.type;c.save();c.strokeStyle=f.ink;c.globalAlpha=.75;c.lineWidth=3;c.strokeRect(22,22,w-44,h-44);c.globalAlpha=1; if(t==='film'){c.fillStyle=f.ink;for(let y=60;y<h-70;y+=75){c.fillRect(8,y,25,36);c.fillRect(w-33,y,25,36)}}else if(t==='love'){for(let y=70;y<h-90;y+=150){heart(c,40,y,22,f.ink);heart(c,w-40,y+60,15,f.ink)}c.strokeStyle='#bd8190';c.lineWidth=3;c.beginPath();c.moveTo(65,h-175);c.lineTo(150,h-110);c.lineTo(235,h-175);c.stroke()}else if(t==='star'){for(let y=65;y<h-100;y+=120){sparkle(c,42,y,18,f.ink);sparkle(c,w-42,y+45,12,f.ink)}c.globalAlpha=.7;for(let i=0;i<38;i++){let x=(i*137)%w,y=(i*211)%h;c.beginPath();c.arc(x,y,3,0,7);c.fillStyle=f.ink;c.fill()}c.globalAlpha=1}else if(t==='cherry'){for(let y=90;y<h-130;y+=210){cherry(c,40,y,42);cherry(c,w-65,y+80,35)}}else if(t==='flower'||t==='daisy'){let petal=t==='flower'?'#efb6b5':'#fffaf0',center=t==='flower'?'#d27f87':'#e6bd65';for(let y=80;y<h-100;y+=160){flower(c,40,y,26,petal,center);flower(c,w-40,y+70,21,petal,center)}flower(c,95,h-140,56,petal,center);flower(c,w-95,h-145,44,petal,center)}else if(t==='cloud'){c.fillStyle='#fff9';for(let y=80;y<h-100;y+=190){for(const x of [35,w-35]){c.beginPath();c.arc(x,y,15,0,7);c.arc(x+12,y+2,11,0,7);c.arc(x-12,y+4,10,0,7);c.fill()}}}else{sparkle(c,55,h-125,22,f.ink);sparkle(c,w-55,h-125,22,f.ink)}c.restore()}
function cover(c,img,x,y,w,h){const scale=Math.max(w/img.width,h/img.height),sw=w/scale,sh=h/scale;c.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h)}
const paperImages=['assets/scrapbook-paper-v1.png','assets/scrapbook-paper-v2.png'].map(src=>{const image=new Image();image.src=src;return image});const paperReady=paperImages.map(image=>new Promise(resolve=>{if(image.complete&&image.naturalWidth)resolve(true);else{image.onload=()=>resolve(true);image.onerror=()=>resolve(false)}}));
async function drawDesign(target,fIndex,n,style,photoUrls,thumbnail=false,highlightIndex=-1){const f=frames[fIndex],geo=geometry(n,style);target.width=geo.w;target.height=geo.h;const c=target.getContext('2d');c.fillStyle=f.bg;c.fillRect(0,0,geo.w,geo.h);if(f.type==='paper'&&await paperReady[f.sheet||0]){const paperImage=paperImages[f.sheet||0],sw=paperImage.naturalWidth/2,split=paperImage.naturalHeight*(f.sheet===1?596/1254:.5),top=f.paper<2,sy=top?0:split,sh=top?split:paperImage.naturalHeight-split;c.drawImage(paperImage,(f.paper%2)*sw,sy,sw,sh,0,0,geo.w,geo.h)}else if(f.type!=='paper')decorations(c,f,geo.w,geo.h);c.fillStyle=f.ink;c.textAlign='center';c.font='bold 24px sans-serif';c.letterSpacing='4px';c.fillText(f.label,450,73);c.letterSpacing='0px';const imgs=await Promise.all(photoUrls.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})));geo.boxes.forEach((b,i)=>{const [x,y,w,h]=b;c.save();c.shadowColor='#493a3428';c.shadowBlur=14;c.shadowOffsetY=6;c.fillStyle='#fff';c.fillRect(x-6,y-6,w+12,h+12);c.restore();if(imgs[i])cover(c,imgs[i],x,y,w,h);else{c.fillStyle=thumbnail?'#d9c5bd':'#e9dbd3';c.fillRect(x,y,w,h);c.fillStyle='#ffffffa0';c.font=`${Math.min(w,h)*.2}px Georgia`;c.textAlign='center';c.fillText(thumbnail?'♡':'✧',x+w/2,y+h*.58)}});if(highlightIndex>=0&&geo.boxes[highlightIndex]){const [hx,hy,hw,hh]=geo.boxes[highlightIndex];c.save();c.setLineDash([22,14]);c.lineWidth=8;c.strokeStyle='#c97b79';c.strokeRect(hx-14,hy-14,hw+28,hh+28);c.restore()}c.fillStyle=f.ink;c.textAlign='center';c.font='bold 58px Georgia';c.fillText('Cola',450,geo.h-130);c.font='24px sans-serif';c.letterSpacing='3px';c.fillText('PHOTOBOOTH  ·  MADE WITH LOVE',450,geo.h-80);c.letterSpacing='0px';return target}
function renderAll(){renderStrip();if(document.body.classList.contains('view-result'))renderResult()}
async function renderStrip(){const id=++renderVersion;const target=document.createElement('canvas');const hi=nextIndex();await drawDesign(target,frame,count,layout,photoUrls(),false,hi);if(id!==renderVersion)return;const strip=$('#strip');strip.innerHTML='';target.className='strip-canvas';target.setAttribute('role','img');target.setAttribute('aria-label',photos.length?'Dải ảnh của bạn':'Xem trước bố cục và khung ảnh');strip.appendChild(target);if(hi>=0){const geo=geometry(count,layout),[x,y,w,h]=geo.boxes[hi],p=document.createElement('span');p.className='next-pulse';p.style.left=(x-14)/geo.w*100+'%';p.style.top=(y-14)/geo.h*100+'%';p.style.width=(w+28)/geo.w*100+'%';p.style.height=(h+28)/geo.h*100+'%';strip.appendChild(p)}}
async function renderResult(){if(photos.length!==count)return;const id=++resultVersion;const urls=photoUrls();$('#shots').style.gridTemplateColumns=`repeat(${count},minmax(0,1fr))`;$('#shots').innerHTML=urls.map((u,i)=>`<figure class="shot"><img src="${u}" alt="Tấm ${i+1}"><button type="button" class="ghost" data-retake="${i}">↻ Chụp lại tấm ${i+1}</button></figure>`).join('');const out=document.createElement('canvas');await drawDesign(out,frame,count,layout,urls);if(id!==resultVersion)return;$('#resultImg').src=out.toDataURL('image/png')}

history.replaceState({view:'studio'},'');
controls();syncChoices();updateUI();renderStrip();
document.querySelectorAll('[data-preview]').forEach(el=>drawDesign(el,+el.dataset.preview,1,0,[],true).then(()=>{const r=document.querySelector(`[data-rpreview="${el.dataset.preview}"]`);r.width=el.width;r.height=el.height;r.getContext('2d').drawImage(el,0,0)}));

// Hiệu ứng làm sáng và màu môi áp dụng mặc định cho cả bốn bộ lọc.
function photoFilter(){const base=filters[filter][1];return (base==='none'?'':base+' ')+'brightness(1.06) saturate(1.035)'}
async function initMakeup(){try{const {FilesetResolver,FaceLandmarker}=await import('./assets/vision/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks('./assets/vision/wasm');const options={baseOptions:{modelAssetPath:'./assets/vision/face_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55};try{faceLandmarker=await FaceLandmarker.createFromOptions(files,options)}catch(e){options.baseOptions.delegate='CPU';faceLandmarker=await FaceLandmarker.createFromOptions(files,options)}setLipsAvailable(true);if(!faceLoopStarted){faceLoopStarted=true;requestAnimationFrame(renderMakeup)}}catch(e){console.warn('Không thể tải hiệu ứng son:',e);setLipsAvailable(false)}}
// MediaPipe không tải được (hoặc quá 20 giây): khoá công tắc son kèm tooltip; tải xong muộn thì mở lại.
function setLipsAvailable(on){lipsAvailable=on;$$('.lips-switch').forEach(b=>b.disabled=!on);$$('.switch-wrap').forEach(w=>{if(on){w.removeAttribute('data-tip');w.removeAttribute('title')}else{w.dataset.tip='Không tải được hiệu ứng son';w.title='Không tải được hiệu ứng son'}})}
function renderMakeup(now){
  if(!stream){faceLoopStarted=false;return}
  if(video.readyState>=2&&video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;
    if(makeup.width!==video.videoWidth||makeup.height!==video.videoHeight){makeup.width=video.videoWidth;makeup.height=video.videoHeight}
    // Snapshot first: both detection and rendering use these exact pixels.
    const frame=frameBuffer;if(frame.width!==makeup.width||frame.height!==makeup.height){frame.width=makeup.width;frame.height=makeup.height}frameCtx.drawImage(video,0,0,frame.width,frame.height);
    let faces=[];if(faceLandmarker){try{faces=faceLandmarker.detectForVideo(frame,now).faceLandmarks}catch(e){faces=[]}}
    lastFaces=faces;
    makeupCtx.clearRect(0,0,makeup.width,makeup.height);makeupCtx.filter=photoFilter();makeupCtx.drawImage(frame,0,0);makeupCtx.filter='none';
    if(lipsOn){makeupCtx.globalCompositeOperation='multiply';for(const face of faces)paintLips(makeupCtx,face,makeup.width,makeup.height);makeupCtx.globalCompositeOperation='source-over'}
  }
  requestAnimationFrame(renderMakeup);
}
function paintLips(c,points,w,h){
  const outer=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  const inner=[78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
  if(!points[61]||!points[291]||!points[0]||!points[17])return;
  const lipWidth=Math.hypot((points[291].x-points[61].x)*w,(points[291].y-points[61].y)*h);
  if(lipWidth<8)return;
  function pathRing(indices){const pts=indices.map(i=>({x:points[i].x*w,y:points[i].y*h}));const last=pts[pts.length-1];c.moveTo((last.x+pts[0].x)/2,(last.y+pts[0].y)/2);for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];c.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2)}c.closePath()}
  const top=points[0].y*h,bottom=points[17].y*h,cy=(top+bottom)/2;
  c.save();c.beginPath();pathRing(outer);pathRing(inner);
  const gradient=c.createLinearGradient(0,Math.min(top,bottom),0,Math.max(top,bottom)+1);
  gradient.addColorStop(0,'rgba(244,105,112,.27)');gradient.addColorStop(.48,'rgba(238,82,99,.38)');gradient.addColorStop(1,'rgba(248,120,116,.28)');
  c.fillStyle=gradient;c.shadowColor='rgba(230,95,105,.15)';c.shadowBlur=Math.max(.6,lipWidth*.018);c.fill('evenodd');c.restore();
}
