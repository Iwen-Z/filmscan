// —— 候选区(按卷分组)域:胶圈缩略 + hover 展开预览 + tray 渲染 ——
import type { Roll } from './types';
import { filmTypeLabel, rollFilmType } from './types';
import { $ } from './core';
import { rolls, pieces } from './state';

// —— 默认胶圈态:用纯 Canvas 画「卷起的胶圈/胶卷盘」,零图片资源、零依赖 ——
//   同心环(暖色 #e8dcc0 线条,内圈更亮)+ 暗盘底 + 中心留孔。
export function drawCoil(canvas: HTMLCanvasElement){
  const dpr = window.devicePixelRatio || 1;
  const size = 56;
  canvas.width = size*dpr; canvas.height = size*dpr;
  canvas.style.width = size+'px'; canvas.style.height = size+'px';
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,size,size);
  const cx = size/2, cy = size/2, rOuter = size/2-3, rInner = 6.5;
  // 盘底:暗棕实心盘
  c.beginPath(); c.arc(cx,cy,rOuter,0,Math.PI*2);
  c.fillStyle = 'rgba(34,29,22,.9)'; c.fill();
  c.lineWidth = 1.4; c.strokeStyle = 'rgba(232,220,192,.55)'; c.stroke();
  // 同心螺旋圈
  c.lineCap = 'round';
  const rings = 8;
  for(let i=1;i<rings;i++){
    const t = i/rings;                       // 0..1 由内到外
    const r = rInner + t*(rOuter-rInner);
    c.globalAlpha = 0.3 + 0.55*(1-t);        // 内圈更亮
    c.lineWidth = 1.4;
    c.strokeStyle = '#e8dcc0';
    c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.stroke();
  }
  c.globalAlpha = 1;
  // 中心孔
  c.beginPath(); c.arc(cx,cy,rInner-1.5,0,Math.PI*2);
  c.fillStyle = '#15130f'; c.fill();
  c.lineWidth = 1.4; c.strokeStyle = 'rgba(232,220,192,.85)'; c.stroke();
}

// —— 展开预览:把单帧 cover 裁切画进一个小 canvas(横画幅,高 80) ——
export function drawFrameThumb(canvas: HTMLCanvasElement, img: HTMLImageElement | undefined){
  const dpr = window.devicePixelRatio || 1;
  const h = 80, w = Math.round(h * 3/2);     // 预览统一用 3:2 横画幅
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
    roll.shots.forEach(sh=>{
      const cv = document.createElement('canvas');
      drawFrameThumb(cv, sh.img);
      wrap.appendChild(cv);
    });
  }
  wrap.style.display = 'flex';
  // 与 roll-item 同 top 对齐,夹在视口内
  const r = sec.getBoundingClientRect();
  const eh = wrap.offsetHeight;
  wrap.style.top = Math.max(6, Math.min(r.top, window.innerHeight - eh - 6)) + 'px';
}
export function hideExpand(){
  if(expandHideTimer){ clearTimeout(expandHideTimer); expandHideTimer = null; }
  const wrap = $('#rollExpand');
  wrap.style.display = 'none'; wrap.innerHTML = ''; expandRoll = null;
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
      `</div>`+
      `<div class="roll-btns">`+
        `<button class="roll-add" title="加照片进这卷">＋</button>`+
        `<button class="roll-settings" title="卷设置">⚙</button>`+
        `<button class="roll-del" title="删除整卷">×</button>`+
      `</div>`;
    drawCoil(sec.querySelector('.coil') as HTMLCanvasElement);
    sec.addEventListener('mouseenter', ()=>{ cancelHideExpand(); showExpand(roll, sec); });
    sec.addEventListener('mouseleave', scheduleHideExpand);
    wrap.appendChild(sec);
  });
}
