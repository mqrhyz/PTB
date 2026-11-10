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
// photos: [{lips, plain, clip?, clipMs?}] — lips/plain là dataURL 1920×1280 chụp từ CÙNG một khung hình; clip là Blob video ~2,5 giây.
let resultVersion=0,retakeIndex=null,lipsOn=true,lightOn=false,cameraReady=false,preparing=false,doneTimer=null,photosRev=0,resultMode='still',lastLum=1,lastFaceCheck=0,lastLumCheck=0;
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
if(store.get('cola-lips')!==null)lipsOn=store.get('cola-lips')==='1';
lightOn=store.get('cola-light')==='1';
const mobileMQ=matchMedia('(max-width:1023px)'),reduceMQ=matchMedia('(prefers-reduced-motion: reduce)');
const behavior=()=>reduceMQ.matches?'auto':'smooth';
const photoUrls=()=>photos.map(p=>lipsOn?p.lips:p.plain);
const layoutNames=n=>n===1?['Polaroid','Bưu thiếp','Chân dung','Điện ảnh']:n===2?['Dải đôi','Cặp đôi','Nhật ký','Phim đôi']:n===3?['Dải ba','Tạp chí','Câu chuyện','Bộ ba']:['Dải bốn','Ô kỷ niệm','Trang nhật ký','Cuộn phim'];
// Ô sẽ chụp tiếp theo (dùng cho guide, chấm tiến độ, viền nhấp nháy).
const nextIndex=()=>retakeIndex!==null?retakeIndex:photos.length<count?photos.length:-1;
const guideIndex=()=>{const i=nextIndex();return i<0?0:i};

/* ---------- Hỗ trợ quay clip ---------- */
const recMime=(()=>{if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return null;for(const m of ['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm']){try{if(MediaRecorder.isTypeSupported(m))return m}catch(e){}}return null})();
const recExt=recMime&&recMime.startsWith('video/mp4')?'mp4':'webm';
const recordCanvas=document.createElement('canvas');recordCanvas.width=960;recordCanvas.height=640;const recordCtx=recordCanvas.getContext('2d');
const lumCanvas=document.createElement('canvas');lumCanvas.width=32;lumCanvas.height=18;const lumCtx=lumCanvas.getContext('2d',{willReadFrequently:true});
const canShareFiles=(()=>{try{return !!(navigator.canShare&&navigator.canShare({files:[new File(['x'],'a.png',{type:'image/png'})]}))}catch(e){return false}})();

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
  $$('.light-switch').forEach(b=>b.setAttribute('aria-checked',lightOn));
  document.body.classList.toggle('light-on',lightOn);
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
$('#counts').onclick=e=>{const b=e.target.closest('[data-count]');if(!b||busy||retakeIndex!==null)return;const n=+b.dataset.count;if(n!==count){count=n;layout=0;clearPhotos();hideDone()}controls();renderAll();updateUI();tone(600)};
function onLayout(e){const b=e.target.closest('[data-layout]');if(!b||busy)return;layout=+b.dataset.layout;controls();renderAll();updateUI();tone(600)}
$('#layouts').onclick=onLayout;$('#resultLayouts').onclick=onLayout;
$$('[data-timer]').forEach(b=>b.onclick=()=>{if(busy)return;timer=+b.dataset.timer;syncChoices();tone(600)});
$('#timerChip').onclick=()=>{if(busy)return;const order=[3,5,10];timer=order[(order.indexOf(timer)+1)%order.length];syncChoices();tone(600)};
$$('.mirror-btn').forEach(b=>b.onclick=()=>{if(busy)return;mirrored=!mirrored;video.style.transform=mirrored?'scaleX(-1)':'none';makeup.style.transform=video.style.transform;tone(600)});
$$('.lips-switch').forEach(b=>b.onclick=()=>{if(b.disabled)return;lipsOn=!lipsOn;store.set('cola-lips',lipsOn?'1':'0');syncChoices();renderAll();tone(600)});
function setLight(on){lightOn=on;store.set('cola-light',on?'1':'0');syncChoices();updateLowLight(lastLum);tone(600)}
$$('.light-switch').forEach(b=>b.onclick=()=>setLight(!lightOn));
$('#darkChip').onclick=()=>setLight(true);
$$('.mobile-tabs [data-tab]').forEach(b=>b.onclick=()=>{$('#options').dataset.tab=b.dataset.tab;$$('.mobile-tabs [data-tab]').forEach(x=>x.setAttribute('aria-selected',x===b))});
$('#layoutToggle').onclick=()=>{const g=$('.r-layout'),open=!g.classList.contains('open');g.classList.toggle('open',open);$('#layoutToggle').setAttribute('aria-expanded',open)};

/* ---------- Trạng thái giao diện ---------- */
function updateUI(){
  const n=count,i=guideIndex(),shooting=busy;
  let hint;
  if(shooting)hint=retakeIndex!==null?`Chụp lại tấm ${i+1} — giữ dáng nhé!`:`Tấm ${i+1} / ${n} — giữ dáng nhé!`;
  else if(preparing)hint='Đang chuẩn bị hiệu ứng…';
  else if(retakeIndex!==null)hint=`Chụp lại tấm ${i+1} — canh mặt vào ô sáng nhé`;
  else hint=mobileMQ.matches?'Canh mặt vào ô sáng nhé':'Canh mặt vào ô sáng — đó là phần sẽ lên ảnh';
  $('#hint').textContent=hint;
  const label=shooting?(retakeIndex!==null?`Đang chụp lại tấm ${i+1}…`:`Đang chụp ${i+1}/${n}…`):retakeIndex!==null?`Chụp lại tấm ${i+1}`:`Chụp ${n} tấm`;
  $('#shootText').textContent=label;$('#shoot').setAttribute('aria-label',label);
  $('#shoot').disabled=!cameraReady||shooting;
  $('#cancelRetake').hidden=retakeIndex===null||shooting;
  document.body.classList.toggle('is-busy',shooting);
  const next=nextIndex(),urls=photoUrls();
  const state=k=>k===next?'next':(retakeIndex!==null||k<photos.length)?'done':'';
  $('#dots').innerHTML=Array.from({length:n},(_,k)=>`<i class="${state(k)}"></i>`).join('');
  $('#miniStrip').innerHTML=Array.from({length:n},(_,k)=>`<i class="${k===next?'next':''}" ${urls[k]&&k!==next?`style="background-image:url(${urls[k]})"`:''}></i>`).join('');
  $('#miniCount').textContent=`${Math.min(retakeIndex!==null?n-1:photos.length,n)}/${n}`;
  updateGuide();updateLowLight(lastLum);
}
function updateGuide(){
  const g=$('#guide');g.hidden=!stream;
  const geo=geometry(count,layout),i=guideIndex(),[, ,w,h]=geo.boxes[i],r=w/h;
  let gw=1,gh=1;if(r<1.5)gw=r/1.5;else gh=1.5/r;
  g.style.width=gw*100+'%';g.style.height=gh*100+'%';
  const ow=Math.min(.2/gw,.9),oh=Math.min(.46/gh,.9),oval=$('#faceOval'),top=46-oh*50;
  oval.style.width=ow*100+'%';oval.style.height=oh*100+'%';oval.style.top=top+'%';
  $('#faceHint').style.top=`min(calc(${top+oh*100}% + 6px), calc(100% - 30px))`;
  const shape=Math.abs(r-1)<.12?'ô vuông':r>1?'ô ngang':'ô dọc';
  $('#guideLabel').textContent=`Tấm ${i+1}/${count} · ${shape}`;
}
mobileMQ.addEventListener('change',()=>{updateUI();updateResultChrome()});

/* ---------- Canh mặt & thiếu sáng ---------- */
// Đổi khung bao khuôn mặt (toạ độ video) sang toạ độ hiển thị trên cam 3:2 (đã cắt cover + lật gương) rồi so với guide.
function updateFaceHint(faces){
  const hint=$('#faceHint'),oval=$('#faceOval');
  if(!faceLandmarker||!lipsAvailable||!stream){hint.hidden=true;oval.classList.remove('ok');return}
  const W=frameBuffer.width,H=frameBuffer.height;if(!W||!H)return;
  let sw=W,sh=H;if(W/H>1.5)sw=H*1.5;else sh=W/1.5;
  const [, ,bw,bh]=geometry(count,layout).boxes[guideIndex()],r=bw/bh,gw=r<1.5?r/1.5:1;
  let text,cls;
  if(!faces||!faces.length){text='Chưa thấy mặt bạn';cls='none'}
  else{
    let minx=1,maxx=0;for(const p of faces[0]){if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x}
    let cx=((minx+maxx)/2*W-(W-sw)/2)/sw;if(mirrored)cx=1-cx;
    const off=(cx-.5)/gw,fw=(maxx-minx)*W/sw/gw;
    if(Math.abs(off)>.12){text=off<0?'Dịch sang phải một chút':'Dịch sang trái một chút';cls='move'}
    else if(fw<.18){text='Lại gần hơn một chút';cls='move'}
    else if(fw>.45){text='Lùi ra xa hơn';cls='move'}
    else{text='Chuẩn rồi!';cls='ok'}
  }
  hint.hidden=false;if(hint.textContent!==text)hint.textContent=text;hint.className='face-hint '+cls;oval.classList.toggle('ok',cls==='ok');
}
function measureLight(){if(!frameBuffer.width)return;lumCtx.drawImage(frameBuffer,0,0,32,18);const d=lumCtx.getImageData(0,0,32,18).data;let s=0;for(let i=0;i<d.length;i+=4)s+=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];updateLowLight(s/(d.length/4)/255)}
function updateLowLight(l){lastLum=l;$('#darkChip').hidden=!(stream&&l<.35&&!lightOn&&!busy)}

/* ---------- Máy ảnh ---------- */
function revealStudio(){
  if(!document.body.classList.contains('view-studio'))return;
  if(!mobileMQ.matches){const s=$('#studio'),hh=$('.site-header').offsetHeight;if(Math.abs(s.getBoundingClientRect().top-hh)>2)s.scrollIntoView({block:'start',behavior:behavior()})}
  else{const r=$('#camera').getBoundingClientRect(),top=$('.site-header').offsetHeight,bottom=innerHeight-$('.dock').offsetHeight;if(r.top<top||r.bottom>bottom)$('#camera').scrollIntoView({block:'center',behavior:behavior()})}
}
$('#startCamera').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw Error();revealStudio();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080}},audio:false});video.srcObject=stream;await video.play();video.style.display='block';video.style.visibility='hidden';$('#placeholder').style.display='none';video.style.filter=photoFilter();makeup.style.display='block';if(!faceLoopStarted){faceLoopStarted=true;requestAnimationFrame(renderMakeup)}preparing=true;updateUI();await Promise.race([initMakeup(),wait(20000)]);if(!faceLandmarker)setLipsAvailable(false);preparing=false;cameraReady=true;updateUI();tone(700)}catch(e){preparing=false;$('#placeholder p').textContent='Không thể bật máy ảnh. Hãy cho phép quyền truy cập camera trong trình duyệt rồi thử lại nhé.';updateUI()}};
// Cắt giữa theo tỉ lệ đích và lật gương — dùng chung cho ảnh và clip để hai thứ khớp nhau.
function cropInto(c,src,W,H,cw,ch){c.save();if(mirrored){c.translate(cw,0);c.scale(-1,1)}const ratio=cw/ch;let sw=W,sh=H;if(W/H>ratio)sw=H*ratio;else sh=W/ratio;c.drawImage(src,(W-sw)/2,(H-sh)/2,sw,sh,0,0,cw,ch);c.restore()}
// Hai bản từ CÙNG một khung hình (1920×1280): một bản có son, một bản không.
function capture(){
  const useFrame=frameBuffer.width>0&&frameBuffer.height>0&&makeup.width>0;
  const W=useFrame?frameBuffer.width:video.videoWidth,H=useFrame?frameBuffer.height:video.videoHeight;
  const src=document.createElement('canvas');src.width=W;src.height=H;const s=src.getContext('2d');
  s.filter=photoFilter();s.drawImage(useFrame?frameBuffer:video,0,0,W,H);s.filter='none';
  const crop=()=>{canvas.width=1920;canvas.height=1280;cropInto(ctx,src,W,H,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.92)};
  const plain=crop();
  s.globalCompositeOperation='multiply';for(const face of (useFrame?lastFaces:[]))paintLips(s,face,W,H);s.globalCompositeOperation='source-over';
  return {lips:crop(),plain};
}
// Ghi clip 960×640 từ #makeup (giữ son như lúc quay), cắt/lật giống capture().
function startClip(){
  if(!recMime||!stream)return null;
  let rec,cs;try{cs=recordCanvas.captureStream(30);rec=new MediaRecorder(cs,{mimeType:recMime,videoBitsPerSecond:4e6})}catch(e){return null}
  const st={rec,chunks:[],running:true,t0:0};
  const draw=()=>{if(!st.running)return;const W=makeup.width,H=makeup.height;if(W&&H)cropInto(recordCtx,makeup,W,H,960,640);requestAnimationFrame(draw)};draw();
  rec.ondataavailable=e=>{if(e.data&&e.data.size)st.chunks.push(e.data)};
  st.done=new Promise(res=>{rec.onstop=()=>{st.running=false;cs.getTracks().forEach(t=>t.stop());res(st.chunks.length?{blob:new Blob(st.chunks,{type:recMime.split(';')[0]}),ms:performance.now()-st.t0}:null)}});
  try{rec.start();st.t0=performance.now()}catch(e){st.running=false;return null}
  return st;
}
function stopClip(st){if(!st)return Promise.resolve(null);try{if(st.rec.state!=='inactive')st.rec.stop();else return Promise.resolve(null)}catch(e){return Promise.resolve(null)}return st.done}
let activeClips=0;
function showCount(n){const el=$('#countdown');el.className='countdown';el.textContent=n;void el.offsetWidth;el.classList.add('pop')}
// Một tấm: đếm ngược (clip bắt đầu ~1,5 giây trước khi chụp), flash, tone; clip dừng 1 giây sau khi chụp.
async function shootOne(){
  let clip=null;const recTimer=recMime?setTimeout(()=>{clip=startClip()},Math.max(0,timer*1000-1500)):null;
  activeClips++;$('#recChip').hidden=!recMime;
  for(let n=timer;n>0;n--){showCount(n);tone(500);await wait(1000)}
  clearTimeout(recTimer);if(recMime&&!clip)clip=startClip();
  $('#countdown').textContent='';$('#countdown').className='';
  const shot=capture();
  $('#flash').className='flash';tone(950,.2);
  shot.clipReady=wait(1000).then(()=>stopClip(clip)).then(r=>{if(r){shot.clip=r.blob;shot.clipMs=r.ms}}).finally(()=>{if(--activeClips<=0)$('#recChip').hidden=true});
  await wait(400);$('#flash').className='';
  return shot;
}
// Thẻ xem lại nhanh ~1,5 giây; trả về true nếu người dùng bấm "Chụp lại tấm này".
function showReview(i,shot){
  return new Promise(res=>{
    const card=$('#review');$('#reviewImg').src=lipsOn?shot.lips:shot.plain;$('#reviewText').textContent=`Tấm ${i+1} xong ✓`;card.hidden=false;
    const done=v=>{clearTimeout(t);$('#reviewRetake').onclick=null;card.hidden=true;res(v)};
    const t=setTimeout(()=>done(false),1500);
    $('#reviewRetake').onclick=()=>{tone(600);done(true)};
  });
}
async function shoot(){
  if(!stream||busy||!cameraReady)return;
  const single=retakeIndex!==null;
  busy=true;hideDone();revealStudio();
  if(!single)clearPhotos();
  renderAll();updateUI();
  const targets=single?[retakeIndex]:Array.from({length:count},(_,k)=>k);
  for(let k=0;k<targets.length;){
    const idx=targets[k];
    const shot=await shootOne();
    const old=photos[idx];photos[idx]=shot;photosRev++;
    renderAll();updateUI();
    const redo=await showReview(idx,shot);
    // Chụp lại ngay tấm này: bỏ ảnh (clip cũ được thu hồi khi ghi xong), đếm ngược lại đúng ô đó.
    if(redo){if(single)photos[idx]=old;else photos.length=idx;photosRev++;renderAll();updateUI();shot.clipReady.then(()=>releaseClip(shot));continue}
    await shot.clipReady;
    if(single&&old&&old!==shot)releaseClip(old);
    k++;
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

/* ---------- Clip & object URL ---------- */
function clipVideo(p){
  if(!p||!p.clip)return null;
  if(!p.vid){const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.setAttribute('playsinline','');v.preload='auto';p.clipUrl=URL.createObjectURL(p.clip);v.addEventListener('loadedmetadata',()=>{v.width=v.videoWidth;v.height=v.videoHeight});v.addEventListener('ended',()=>{v.currentTime=0;v.play().catch(()=>{})});v.src=p.clipUrl;p.vid=v}
  return p.vid;
}
function releaseClip(p){if(p&&p.clipUrl){if(p.vid){p.vid.pause();p.vid.removeAttribute('src');p.vid.load()}URL.revokeObjectURL(p.clipUrl);p.clipUrl=null;p.vid=null}}
function clearPhotos(){photos.forEach(releaseClip);photos=[];photosRev++;exportCache=null;pngCache=null}
const hasClips=()=>!!recMime&&photos.length===count&&photos.every(p=>p&&p.clip);
const motionMs=()=>Math.min(8000,2*Math.max(...photos.map(p=>p.clipMs||2500)));
function drawMotion(c,bg,vids,geo,scale){c.drawImage(bg,0,0);c.save();c.scale(scale,scale);geo.boxes.forEach(([x,y,w,h],i)=>{const v=vids[i];if(v&&v.readyState>=2&&v.width)cover(c,v,x,y,w,h)});c.restore()}
const ready=v=>v.readyState>=2?Promise.resolve():new Promise(r=>{v.addEventListener('loadeddata',r,{once:true});setTimeout(r,3000)});

/* ---------- Hai view: studio và thành quả ---------- */
function showView(v,push=true){
  if(v==='result'&&photos.length!==count)v='studio';
  hideDone();hideAsk();
  if(v==='result')retakeIndex=null;else stopMotionPreview();
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
$('#newSession').onclick=()=>{clearPhotos();retakeIndex=null;showView('studio');tone(600)};
// Chạm vào một ô trên dải ảnh (tĩnh hoặc động) để chụp lại tấm đó.
function onStripTap(e){const el=e.currentTarget,geo=geometry(count,layout),x=e.offsetX/el.offsetWidth*geo.w,y=e.offsetY/el.offsetHeight*geo.h;const i=geo.boxes.findIndex(([bx,by,bw,bh])=>x>=bx-6&&x<=bx+bw+6&&y>=by-6&&y<=by+bh+6);if(i>=0)askRetake(i)}
$('#resultImg').onclick=onStripTap;$('#motionCanvas').onclick=onStripTap;
let askIndex=null;
function askRetake(i){askIndex=i;$('#askText').textContent=`Chụp lại tấm ${i+1}?`;$('#retakeAsk').hidden=false;$('#askYes').focus()}
function hideAsk(){$('#retakeAsk').hidden=true;askIndex=null}
$('#askNo').onclick=hideAsk;$('#askYes').onclick=()=>{const i=askIndex;hideAsk();if(i!==null)startRetake(i)};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#retakeAsk').hidden)hideAsk()});

/* ---------- Thành quả: tĩnh / động ---------- */
$('#modeSwitch').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;resultMode=b.dataset.mode;renderResult();tone(600)};
function updateResultChrome(){
  const motionOk=hasClips();if(!motionOk)resultMode='still';
  const motion=resultMode==='motion',mob=mobileMQ.matches;
  $('#modeSwitch').hidden=!motionOk;
  $$('#modeSwitch [data-mode]').forEach(b=>{const on=b.dataset.mode===resultMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on)});
  document.body.classList.toggle('mode-motion',motion);
  $('#downloadText').textContent=motion?(mob?'↓ Lưu video':`↓ Tải video ${recExt.toUpperCase()}`):(mob?'↓ Lưu ảnh':'↓ Tải ảnh PNG');
  $('#localNote').textContent=motion?`Video khoảng ${Math.round(motionMs()/1000)} giây, lặp lại, không tiếng · chỉ lưu trên máy của bạn ♡`:'Ảnh 1800px, nét khi in · chỉ lưu trên máy của bạn ♡';
  $('#webmNote').hidden=!(motion&&recExt==='webm');
  $('#share').hidden=!canShareFiles;
  $('#resultImg').hidden=motion;$('#motionCanvas').hidden=!motion;$('#motionBadge').hidden=!motion;
}
let motionRun=0;
async function startMotionPreview(){
  const run=++motionRun,geo=geometry(count,layout),bg=document.createElement('canvas');
  await drawDesign(bg,frame,count,layout,[],false,{skipPhotos:true});if(run!==motionRun)return;
  const cv=$('#motionCanvas');cv.width=bg.width;cv.height=bg.height;const c=cv.getContext('2d');
  const vids=photos.map(clipVideo);vids.forEach(v=>v&&v.play().catch(()=>{}));
  const tick=()=>{if(run!==motionRun)return;drawMotion(c,bg,vids,geo,1);requestAnimationFrame(tick)};tick();
}
function stopMotionPreview(){motionRun++;photos.forEach(p=>p&&p.vid&&p.vid.pause())}
// Ghép video: nền khung vẽ một lần (skipPhotos), mỗi frame cover() từng clip vào đúng ô. Rộng 1080px, 30fps, 2 vòng clip (≤ 8 giây).
let exportCache=null,pngCache=null,exporting=false;
async function exportVideo(){
  const key=[frame,count,layout,photosRev].join('|');if(exportCache&&exportCache.key===key)return exportCache.blob;
  const geo=geometry(count,layout),scale=1080/geo.w,bg=document.createElement('canvas');
  await drawDesign(bg,frame,count,layout,[],false,{scale,skipPhotos:true});
  const out=document.createElement('canvas');out.width=bg.width;out.height=bg.height;const c=out.getContext('2d');
  const vids=photos.map(clipVideo);await Promise.all(vids.map(ready));
  vids.forEach(v=>{v.pause();v.currentTime=0});await wait(120);
  drawMotion(c,bg,vids,geo,scale);
  const cs=out.captureStream(30),rec=new MediaRecorder(cs,{mimeType:recMime,videoBitsPerSecond:8e6}),chunks=[];
  rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  const stopped=new Promise(r=>rec.onstop=r);
  rec.start();await Promise.all(vids.map(v=>v.play().catch(()=>{})));
  const dur=motionMs(),t0=performance.now();
  await new Promise(res=>{const tick=()=>{drawMotion(c,bg,vids,geo,scale);const left=dur-(performance.now()-t0);$('#downloadText').textContent=`Đang tạo video… ${Math.max(0,Math.ceil(left/1000))}s`;if(left<=0)res();else setTimeout(tick,1000/30)};tick()});
  rec.stop();await stopped;cs.getTracks().forEach(t=>t.stop());
  if(resultMode!=='motion'||!document.body.classList.contains('view-result'))vids.forEach(v=>v.pause());
  const blob=new Blob(chunks,{type:recMime.split(';')[0]});exportCache={key,blob};return blob;
}
async function exportPng(){
  const key=[frame,count,layout,lipsOn,photosRev].join('|');if(pngCache&&pngCache.key===key)return pngCache.blob;
  const out=document.createElement('canvas');await drawDesign(out,frame,count,layout,photoUrls(),false,{scale:2});
  const blob=await new Promise(r=>out.toBlob(r,'image/png'));pngCache={key,blob};return blob;
}
async function currentFile(){const motion=resultMode==='motion';const blob=motion?await exportVideo():await exportPng();return new File([blob],`cola-photobooth.${motion?recExt:'png'}`,{type:blob.type})}
async function withExport(fn){if(exporting)return;exporting=true;$('#download').disabled=true;$('#share').disabled=true;try{await fn()}catch(e){console.warn('Không xuất được:',e)}finally{exporting=false;$('#download').disabled=false;$('#share').disabled=false;updateResultChrome()}}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.download=name;a.href=url;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)}
$('#download').onclick=()=>{if(photos.length!==count)return;withExport(async()=>{const f=await currentFile();saveBlob(f,f.name);tone(750,.2)})};
$('#share').onclick=()=>{if(photos.length!==count)return;withExport(async()=>{const f=await currentFile();try{await navigator.share({files:[f],title:'Cola Photobooth'})}catch(e){if(e.name==='NotAllowedError'){$('#share').textContent='Chạm lần nữa để chia sẻ';setTimeout(()=>{$('#share').textContent='Chia sẻ'},6000)}}})};

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
async function drawDesign(target,fIndex,n,style,photoUrls,thumbnail=false,{highlightIndex=-1,scale=1,skipPhotos=false}={}){const f=frames[fIndex],geo=geometry(n,style);target.width=Math.round(geo.w*scale);target.height=Math.round(geo.h*scale);const c=target.getContext('2d');if(scale!==1)c.scale(scale,scale);c.fillStyle=f.bg;c.fillRect(0,0,geo.w,geo.h);if(f.type==='paper'&&await paperReady[f.sheet||0]){const paperImage=paperImages[f.sheet||0],sw=paperImage.naturalWidth/2,split=paperImage.naturalHeight*(f.sheet===1?596/1254:.5),top=f.paper<2,sy=top?0:split,sh=top?split:paperImage.naturalHeight-split;c.drawImage(paperImage,(f.paper%2)*sw,sy,sw,sh,0,0,geo.w,geo.h)}else if(f.type!=='paper')decorations(c,f,geo.w,geo.h);c.fillStyle=f.ink;c.textAlign='center';c.font='bold 24px sans-serif';c.letterSpacing='4px';c.fillText(f.label,450,73);c.letterSpacing='0px';const imgs=await Promise.all(photoUrls.map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})));geo.boxes.forEach((b,i)=>{const [x,y,w,h]=b;c.save();c.shadowColor='#493a3428';c.shadowBlur=14;c.shadowOffsetY=6;c.fillStyle='#fff';c.fillRect(x-6,y-6,w+12,h+12);c.restore();if(skipPhotos){}else if(imgs[i])cover(c,imgs[i],x,y,w,h);else{c.fillStyle=thumbnail?'#d9c5bd':'#e9dbd3';c.fillRect(x,y,w,h);c.fillStyle='#ffffffa0';c.font=`${Math.min(w,h)*.2}px Georgia`;c.textAlign='center';c.fillText(thumbnail?'♡':'✧',x+w/2,y+h*.58)}});if(highlightIndex>=0&&geo.boxes[highlightIndex]){const [hx,hy,hw,hh]=geo.boxes[highlightIndex];c.save();c.setLineDash([22,14]);c.lineWidth=8;c.strokeStyle='#c97b79';c.strokeRect(hx-14,hy-14,hw+28,hh+28);c.restore()}c.fillStyle=f.ink;c.textAlign='center';c.font='bold 58px Georgia';c.fillText('Cola',450,geo.h-130);c.font='24px sans-serif';c.letterSpacing='3px';c.fillText('PHOTOBOOTH  ·  MADE WITH LOVE',450,geo.h-80);c.letterSpacing='0px';return target}
function renderAll(){renderStrip();if(document.body.classList.contains('view-result'))renderResult()}
async function renderStrip(){const id=++renderVersion;const target=document.createElement('canvas');const hi=nextIndex();await drawDesign(target,frame,count,layout,photoUrls(),false,{highlightIndex:hi});if(id!==renderVersion)return;const strip=$('#strip');strip.innerHTML='';target.className='strip-canvas';target.setAttribute('role','img');target.setAttribute('aria-label',photos.length?'Dải ảnh của bạn':'Xem trước bố cục và khung ảnh');strip.appendChild(target);if(hi>=0){const geo=geometry(count,layout),[x,y,w,h]=geo.boxes[hi],p=document.createElement('span');p.className='next-pulse';p.style.left=(x-14)/geo.w*100+'%';p.style.top=(y-14)/geo.h*100+'%';p.style.width=(w+28)/geo.w*100+'%';p.style.height=(h+28)/geo.h*100+'%';strip.appendChild(p)}}
async function renderResult(){
  if(photos.length!==count)return;const id=++resultVersion;const urls=photoUrls();
  updateResultChrome();
  $('#shots').style.gridTemplateColumns=`repeat(${count},minmax(0,1fr))`;$('#shots').innerHTML=urls.map((u,i)=>`<figure class="shot"><img src="${u}" alt="Tấm ${i+1}"><button type="button" class="ghost" data-retake="${i}">↻ Chụp lại tấm ${i+1}</button></figure>`).join('');
  if(resultMode==='motion'){startMotionPreview();return}
  stopMotionPreview();
  const out=document.createElement('canvas');await drawDesign(out,frame,count,layout,urls);if(id!==resultVersion)return;$('#resultImg').src=out.toDataURL('image/png');
}

history.replaceState({view:'studio'},'');
controls();syncChoices();updateUI();renderStrip();
document.querySelectorAll('[data-preview]').forEach(el=>drawDesign(el,+el.dataset.preview,1,0,[],true).then(()=>{const r=document.querySelector(`[data-rpreview="${el.dataset.preview}"]`);r.width=el.width;r.height=el.height;r.getContext('2d').drawImage(el,0,0)}));

// Hiệu ứng làm sáng và màu môi áp dụng mặc định cho cả bốn bộ lọc.
function photoFilter(){const base=filters[filter][1];return (base==='none'?'':base+' ')+'brightness(1.06) saturate(1.035)'}
async function initMakeup(){try{const {FilesetResolver,FaceLandmarker}=await import('./assets/vision/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks('./assets/vision/wasm');const options={baseOptions:{modelAssetPath:'./assets/vision/face_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55};try{faceLandmarker=await FaceLandmarker.createFromOptions(files,options)}catch(e){options.baseOptions.delegate='CPU';faceLandmarker=await FaceLandmarker.createFromOptions(files,options)}setLipsAvailable(true);if(!faceLoopStarted){faceLoopStarted=true;requestAnimationFrame(renderMakeup)}}catch(e){console.warn('Không thể tải hiệu ứng son:',e);setLipsAvailable(false)}}
// MediaPipe không tải được (hoặc quá 20 giây): khoá công tắc son kèm tooltip, ẩn phản hồi canh mặt; tải xong muộn thì mở lại.
function setLipsAvailable(on){lipsAvailable=on;$$('.lips-switch').forEach(b=>b.disabled=!on);$$('.switch-wrap').forEach(w=>{if(on){w.removeAttribute('data-tip');w.removeAttribute('title')}else{w.dataset.tip='Không tải được hiệu ứng son';w.title='Không tải được hiệu ứng son'}});if(!on)updateFaceHint([])}
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
    if(now-lastFaceCheck>=200){lastFaceCheck=now;updateFaceHint(faces)}
    if(now-lastLumCheck>=1000){lastLumCheck=now;measureLight()}
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
