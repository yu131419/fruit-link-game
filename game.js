// 豪华版连连看 - 简化实现（主题A: 可爱卡通风）
// 核心：emoji 水果、提示、重排、连击、粒子特效、音效（WebAudio）、本地排行榜
const FRUITS = ['🍓','🍎','🍇','🍌','🍊','🍑','🥝','🍍'];
let rows=8, cols=8;
let board = [], sel=null, score=0, combo=0, timeLeft=120, timer=null, level=1;
const gridWrap = document.getElementById('gridWrap');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const fxCanvas = document.getElementById('fxCanvas');
const ctx = fxCanvas.getContext('2d');
let audioCtx = null;

// Responsive canvas sizing
function resizeCanvas(){
  fxCanvas.width = fxCanvas.clientWidth;
  fxCanvas.height = fxCanvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function makeBoard(r=rows,c=cols){
  const total=r*c; const pair=total/2; let arr=[];
  for(let i=0;i<pair;i++){ let f=FRUITS[i%FRUITS.length]; arr.push(f,f); }
  // shuffle
  for(let i=arr.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  let b=Array.from({length:r+2},()=>Array(c+2).fill(''));
  let k=0;
  for(let i=1;i<=r;i++){ for(let j=1;j<=c;j++){ b[i][j]=arr[k++]; } }
  return b;
}

function renderGrid(){
  gridWrap.innerHTML='';
  const grid = document.createElement('div'); grid.className='grid';
  grid.style.gridTemplateColumns = `repeat(${cols},64px)`;
  for(let i=1;i<=rows;i++){
    for(let j=1;j<=cols;j++){
      const d=document.createElement('div'); d.className='cell'; d.dataset.r=i; d.dataset.c=j;
      d.textContent = board[i][j] || '';
      if(!board[i][j]) d.classList.add('empty');
      d.addEventListener('click', onCellClick);
      grid.appendChild(d);
    }
  }
  gridWrap.appendChild(grid);
  resizeCanvas();
}

function onCellClick(e){
  const el=e.currentTarget; const r=parseInt(el.dataset.r), c=parseInt(el.dataset.c);
  if(!board[r][c]) return;
  if(!sel){ sel={r,c,el}; el.classList.add('sel'); playClick(); return; }
  // same cell
  if(sel.r===r && sel.c===c){ sel.el.classList.remove('sel'); sel=null; return; }
  if(board[sel.r][sel.c]!==board[r][c]){ sel.el.classList.remove('sel'); sel=null; playFail(); return; }
  const path = findPath(sel,{r,c});
  if(path){ // success
    board[sel.r][sel.c]=''; board[r][c]='';
    animateMatch(path); sel.el.classList.remove('sel'); sel=null;
    score += 10 + combo*2; combo++; scoreEl.textContent=score; comboEl.textContent=combo;
    playMatch();
    renderGrid();
    if(checkWin()){ winLevel(); }
  } else { sel.el.classList.remove('sel'); sel=null; playFail(); }
}

function findPath(a,b){
  // BFS allowing up to 2 turns, operate on padded board (1..rows)
  const R=rows+2, C=cols+2;
  function pass(r,c){ if(r===a.r && c===a.c) return true; if(r===b.r && c===b.c) return true; return (!board[r] || board[r][c]===''); }
  const dirs=[[ -1,0],[0,1],[1,0],[0,-1]];
  let visited = Array.from({length:R+1},()=>Array.from({length:C+1},()=>Array(4).fill(99)));
  let q=[];
  for(let d=0;d<4;d++){ visited[a.r][a.c][d]=0; q.push({r:a.r,c:a.c,d,turns:0,prev:null}); }
  let found=null;
  while(q.length){
    let cur=q.shift();
    if(cur.turns>2) continue;
    let nr=cur.r+dirs[cur.d][0], nc=cur.c+dirs[cur.d][1];
    while(nr>=0 && nr<=rows+1 && nc>=0 && nc<=cols+1 && pass(nr,nc)){
      if(nr===b.r && nc===b.c){ found={r:nr,c:nc,d:cur.d,turns:cur.turns,prev:cur}; break; }
      for(let nd=0;nd<4;nd++){
        let nt = cur.turns + (nd===cur.d?0:1);
        if(nt>2) continue;
        if(visited[nr][nc][nd] > nt){ visited[nr][nc][nd]=nt; q.push({r:nr,c:nc,d:nd,turns:nt,prev:cur}); }
      }
      nr += dirs[cur.d][0]; nc += dirs[cur.d][1];
    }
    if(found) break;
  }
  if(!found) return null;
  let nodes=[]; let cur=found; nodes.push([cur.r,cur.c]);
  while(cur.prev){ cur=cur.prev; nodes.push([cur.r,cur.c]); }
  nodes.reverse();
  // compress
  let corners=[nodes[0]];
  for(let i=1;i<nodes.length;i++){ let p=nodes[i]; let last=corners[corners.length-1]; if(p[0]===last[0]||p[1]===last[1]) corners[corners.length-1]=p; else corners.push(p); }
  return corners;
}

function animateMatch(path){
  // draw simple particle along path on fxCanvas
  const rect = gridWrap.querySelector('.grid').getBoundingClientRect();
  const cellW = rect.width/cols, cellH = rect.height/rows;
  function center(p){
    const r=p[0], c=p[1];
    let x = rect.left + (c-1+0.5)*cellW - fxCanvas.getBoundingClientRect().left;
    let y = rect.top + (r-1+0.5)*cellH - fxCanvas.getBoundingClientRect().top;
    return [x,y];
  }
  let pts = path.map(center);
  // simple particle burst at endpoints
  burstAt(pts[0]); burstAt(pts[pts.length-1]);
}

function burstAt([x,y]){
  // create simple particles
  const particles = [];
  for(let i=0;i<30;i++){
    particles.push({
      x, y,
      vx: (Math.random()-0.5)*6, vy:(Math.random()-0.5)*6,
      life: 40 + Math.random()*20, r: 3 + Math.random()*6
    });
  }
  let t = 0;
  function step(){
    ctx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
    for(let p of particles){
      p.x += p.vx; p.y += p.vy; p.life--;
      ctx.globalAlpha = Math.max(0, p.life/60);
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle = 'rgba(255,107,129,0.9)'; ctx.fill();
    }
    t++;
    if(particles.some(p=>p.life>0)) requestAnimationFrame(step);
    else ctx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
  }
  step();
}

// simple sound synth
function ensureAudio(){ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } }
function playTone(freq, time=0.06){
  try{ ensureAudio(); const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; o.connect(g); g.connect(audioCtx.destination); g.gain.value=0.12; o.start(); o.stop(audioCtx.currentTime+time); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+time); }catch(e){}
}
function playClick(){ playTone(880,0.04); }
function playMatch(){ playTone(440,0.12); playTone(660,0.08); }
function playFail(){ playTone(220,0.08); combo=0; comboEl.textContent=combo; }

function shuffleBoard(){
  let arr=[];
  for(let i=1;i<=rows;i++) for(let j=1;j<=cols;j++) if(board[i][j]) arr.push(board[i][j]);
  for(let i=arr.length-1;i>0;i--){ let j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  let k=0; for(let i=1;i<=rows;i++) for(let j=1;j<=cols;j++) board[i][j]=arr[k++]||'';
  renderGrid();
}

function hint(){
  for(let i=1;i<=rows;i++) for(let j=1;j<=cols;j++){
    if(!board[i][j]) continue;
    for(let ii=1;ii<=rows;ii++) for(let jj=1;jj<=cols;jj++){
      if(i===ii && j===jj) continue;
      if(board[ii][jj] && board[ii][jj]===board[i][j]){
        if(findPath({r:i,c:j},{r:ii,c:jj})){
          // highlight
          const idx1=(i-1)*cols+(j-1), idx2=(ii-1)*cols+(jj-1);
          const cells = gridWrap.querySelectorAll('.cell');
          cells[idx1].classList.add('sel'); cells[idx2].classList.add('sel');
          setTimeout(()=>{ cells[idx1].classList.remove('sel'); cells[idx2].classList.remove('sel'); },800);
          return;
        }
      }
    }
  }
  shuffleBoard();
}

function checkWin(){ for(let i=1;i<=rows;i++) for(let j=1;j<=cols;j++) if(board[i][j]) return false; return true; }
function winLevel(){ clearInterval(timer); alert('恭喜过关！得分：'+score); saveScore(); level++; levelEl.textContent=level; startGame(); }

// timer
function startTimer(mode){
  clearInterval(timer);
  if(mode==='timed'){ timeLeft = Math.max(30, 120 - (level-1)*10); timeEl.textContent=timeLeft; timer = setInterval(()=>{ timeLeft--; timeEl.textContent=timeLeft; if(timeLeft<=0){ clearInterval(timer); alert('时间到！ 得分：'+score); saveScore(); } },1000); }
  else{ timeEl.textContent='∞'; }
}

// leaderboard localStorage
function loadBoard(){ const raw = localStorage.getItem('fl_leader'); if(!raw) return []; try{ return JSON.parse(raw); }catch(e){ return []; } }
function saveBoard(arr){ localStorage.setItem('fl_leader', JSON.stringify(arr)); }
function saveScore(){
  const nick = (document.getElementById('nick').value || '匿名').slice(0,12);
  const arr = loadBoard(); arr.push({nick,score,level,date:Date.now()}); arr.sort((a,b)=>b.score-a.score); saveBoard(arr.slice(0,20)); renderBoard();
}
function renderBoard(){ const arr=loadBoard(); const ol=document.getElementById('boardList'); ol.innerHTML=''; arr.forEach(it=>{ const li=document.createElement('li'); li.textContent = `${it.nick} — ${it.score} 分 (关 ${it.level})`; ol.appendChild(li); }); }

// init and UI
document.getElementById('startBtn').addEventListener('click', ()=>{
  startGame();
});
document.getElementById('hint').addEventListener('click', hint);
document.getElementById('shuffle').addEventListener('click', ()=>{ shuffleBoard(); playClick(); });
document.getElementById('freeze').addEventListener('click', ()=>{ if(typeof timeLeft==='number'){ timeLeft += 10; timeEl.textContent=timeLeft; playTone(1000,0.12); } });
document.getElementById('clearBoard').addEventListener('click', ()=>{ localStorage.removeItem('fl_leader'); renderBoard(); });

document.getElementById('shareWx').addEventListener('click', ()=>{
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(()=> alert('链接已复制，粘贴到微信中分享即可。'));
});
document.getElementById('shareTg').addEventListener('click', ()=>{
  const url = window.location.href;
  const tg = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('来玩水果连连看🍓 ' + url);
  window.open(tg, '_blank');
});

function startGame(){
  rows = 8; cols = 8; board = makeBoard(rows,cols); renderGrid(); score=0; combo=0; scoreEl.textContent=score; comboEl.textContent=combo; levelEl.textContent=level;
  const mode = document.getElementById('mode').value;
  startTimer(mode);
  renderBoard();
}

// initial
startGame();
