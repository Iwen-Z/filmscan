// —— 候选区(按卷分组)域:暗盒缩略 + hover 展开预览 + tray 渲染 ——
import type { Roll, FilmType } from './types';
import { filmTypeLabel, rollFilmType, rollFilmIdx } from './types';
import { $, films } from './core';
import { rolls, pieces } from './state';

// 圆角矩形路径(自带 helper,不依赖 ctx.roundRect,headless 兼容)
function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number){
  const rr = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+rr, y);
  c.arcTo(x+w, y,   x+w, y+h, rr);
  c.arcTo(x+w, y+h, x,   y+h, rr);
  c.arcTo(x,   y+h, x,   y,   rr);
  c.arcTo(x,   y,   x+w, y,   rr);
  c.closePath();
}

// 按胶片类型给罐身渐变上色:[左高光, 右暗]。默认暖银,bw 冷深灰,negative 橙底。
const CANISTER_TINT: Record<FilmType, [string, string]> = {
  reversal: ['#d0c8b8', '#6a6055'],   // 暖银(规格默认)
  bw:       ['#9a9a9a', '#454545'],   // 冷深灰
  negative: ['#d2854a', '#8a4a20'],   // 橙底(C-41)
};

// —— 默认暗盒态:纯 Canvas 画「竖立的 35mm 金属暗盒」,零图片资源、零依赖 ——
//   罐身竖直渐变模拟圆柱金属 + 顶部轴心凸起 + 底部露片头(leader,带齿孔)。
export function drawCanister(canvas: HTMLCanvasElement, roll: Roll){
  const dpr = window.devicePixelRatio || 1;
  const W = 40, H = 64;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,W,H);

  const [hi, lo] = CANISTER_TINT[rollFilmType(roll)] || CANISTER_TINT.reversal;
  // 罐身几何
  const bodyW = 28, bodyX = (W-bodyW)/2;          // 居中,左右各留 6
  const bodyY = 8,  bodyH = 44;                   // y 8..52
  // 顶部稍宽凸起(轴心/齿轮孔区)
  const capW = 34, capX = (W-capW)/2, capY = 2, capH = 8;
  // 底部片头(leader)
  const leaderW = 20, leaderX = (W-leaderW)/2, leaderY = 50, leaderH = 12;

  // 圆柱金属:左高光 -> 右暗的横向线性渐变
  const grad = c.createLinearGradient(bodyX, 0, bodyX+bodyW, 0);
  grad.addColorStop(0,    hi);
  grad.addColorStop(0.35, hi);
  grad.addColorStop(1,    lo);

  // 片头(先画,叠在罐身底下)
  roundRectPath(c, leaderX, leaderY, leaderW, leaderH, 2);
  c.fillStyle = '#2a1f14'; c.fill();
  // 齿孔:3 个矩形孔
  c.fillStyle = '#15130f';
  const holeW = 3, holeH = 4, holeY = leaderY + leaderH - holeH - 2;
  for(let i=0;i<3;i++){
    const hx = leaderX + 3 + i*((leaderW-6-holeW)/2);
    c.fillRect(hx, holeY, holeW, holeH);
  }

  // 顶部凸起
  roundRectPath(c, capX, capY, capW, capH, 2.5);
  c.fillStyle = grad; c.fill();
  c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.28)'; c.stroke();

  // 罐身
  roundRectPath(c, bodyX, bodyY, bodyW, bodyH, 4);
  c.fillStyle = grad; c.fill();
  c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.3)'; c.stroke();
  // 左缘高光竖条,强化圆柱感
  c.fillStyle = 'rgba(255,255,255,.22)';
  c.fillRect(bodyX+3, bodyY+3, 2.5, bodyH-6);
}

// —— 展开预览:把单帧 cover 裁切画进一个小 canvas(横画幅,高 80) ——
//   画幅比例按 per-roll 规格(films[rollFilmIdx(roll)].aspect),不再硬编 3:2。
export function drawFrameThumb(canvas: HTMLCanvasElement, img: HTMLImageElement | undefined, roll: Roll){
  const dpr = window.devicePixelRatio || 1;
  const h = 80, w = Math.round(h * films[rollFilmIdx(roll)].aspect);   // per-roll 画幅比
  canvas.style.width = w+'px'; canvas.style.height = h+'px';
  canvas.width = w*dpr; canvas.height = h*dpr;
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr,0,0,dpr,0,0);
  c.fillStyle = '#2a231a'; c.fillRect(0,0,w,h);              // 片基底
  if(img && img.complete && img.naturalWidth){
    const iw = img.naturalWidth, ih = img.naturalHeight, ia = iw/ih, fa = w/h;
    let sx,sy,sw,sh;
    if(ia > fa){ sh = ih; sw = ih*fa; sx = (iw-sw)/2; sy = 0; }
    else       { sw = iw; sh = iw/fa; sx = 0; sy = (ih-sh)/2; }
    c.drawImage(img, sx,sy,sw,sh, 0,0,w,h);
  } else {
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0,0,w,h);   // 未载入占位
  }
}

// —— hover 向左水平展开预览:singleton 展开条,绑定当前 hover 的卷 ——
export let expandRoll: Roll | null = null;
let expandHideTimer: ReturnType<typeof setTimeout> | null = null;
export function showExpand(roll: Roll, sec: HTMLElement){
  const wrap = $('#rollExpand');
  expandRoll = roll;
  wrap.innerHTML = '';
  if(!roll.shots.length){
    const e = document.createElement('div');
    e.className = 'ex-empty'; e.textContent = '空卷 · 点 ＋ 导入照片';
    wrap.appendChild(e);
  } else {
    roll.shots.forEach((sh, i)=>{
      const cv = document.createElement('canvas');
      cv.dataset.idx = String(i);          // CSS transition-delay 级联入场用
      drawFrameThumb(cv, sh.img, roll);
      wrap.appendChild(cv);
    });
  }
  // 与 roll-item 同 top 对齐,夹在视口内(class 切前先量 offsetHeight,display:flex 默认在)
  const r = sec.getBoundingClientRect();
  const eh = wrap.offsetHeight;
  wrap.style.top = Math.max(6, Math.min(r.top, window.innerHeight - eh - 6)) + 'px';
  // 加 class 驱动 CSS transform+transition 卷轴抽出动画(替代 display 硬切)
  wrap.classList.add('expand-visible');
}
// transitionend 清 DOM:模块级单例,避免快速 show/hide 时监听器堆积
function onExpandTransitionEnd(e: TransitionEvent){
  const wrap = e.currentTarget as HTMLElement;
  if(e.target !== wrap) return;                          // 只认 wrap 自身,忽略子 canvas 冒泡
  if(wrap.classList.contains('expand-visible')) return;  // 期间又被展开 -> 不清
  wrap.innerHTML = '';
}
export function hideExpand(){
  if(expandHideTimer){ clearTimeout(expandHideTimer); expandHideTimer = null; }
  const wrap = $('#rollExpand');
  // 先移 class 触发收起动画;动画结束(transitionend)再清 DOM,避免动画未走完就清空
  wrap.removeEventListener('transitionend', onExpandTransitionEnd);  // 去重,确保单例
  wrap.addEventListener('transitionend', onExpandTransitionEnd);
  wrap.classList.remove('expand-visible');
  expandRoll = null;
}
export function scheduleHideExpand(){
  if(expandHideTimer) clearTimeout(expandHideTimer);
  expandHideTimer = setTimeout(hideExpand, 120);   // 留点余地,让指针能移进展开条
}
export function cancelHideExpand(){ if(expandHideTimer){ clearTimeout(expandHideTimer); expandHideTimer = null; } }

// —— 渲染候选区(按卷分组):默认胶圈态 ——
export function renderTray(){
  const wrap = $('#rolls');
  wrap.querySelectorAll('.roll').forEach(n=>n.remove());
  $('#trayEmpty').style.display = rolls.length ? 'none' : 'block';
  // 当前展开卷可能已被删/改,重建后同步收起避免悬挂引用
  if(expandRoll && !rolls.includes(expandRoll)) hideExpand();
  rolls.forEach(roll=>{
    const onDeck = pieces.some(pc=>String(pc.rollId)===String(roll.id));
    const sec = document.createElement('section');
    sec.className = 'roll' + (onDeck ? ' on' : '');
    sec.dataset.r = String(roll.id);
    sec.title = '按住拖到台面 = 放这卷 · hover 预览各帧';
    const capped = roll.cap != null;
    const full = capped && roll.shots.length >= (roll.cap as number);
    const countTxt = capped ? `${roll.shots.length}/${roll.cap} 张` : `${roll.shots.length} 张`;
    sec.innerHTML =
      `<canvas class="coil"></canvas>`+
      `<div class="roll-meta">`+
        `<div class="roll-name">${roll.name}</div>`+
        `<div class="roll-count${full ? ' full' : ''}">${countTxt}</div>`+
        `<button class="roll-type" title="切换胶片类型(反转/黑白/负片)">${filmTypeLabel(rollFilmType(roll))}</button>`+
        `<div class="roll-btns">`+
          `<button class="roll-add" title="加照片进这卷">＋</button>`+
          `<button class="roll-settings" title="卷设置">⚙</button>`+
          `<button class="roll-del" title="删除整卷">×</button>`+
        `</div>`+
      `</div>`;
    drawCanister(sec.querySelector('.coil') as HTMLCanvasElement, roll);
    sec.addEventListener('mouseenter', ()=>{ cancelHideExpand(); showExpand(roll, sec); });
    sec.addEventListener('mouseleave', scheduleHideExpand);
    wrap.appendChild(sec);
  });
}
