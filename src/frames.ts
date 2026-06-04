// —— 选帧/剪下/边框样式工具条域 ——
import type { Piece } from './types';
import { $, deckScale } from './core';
import { selected, setSelected, pieces, rollById } from './state';
import { pieceLayout, renderPiece } from './render';
import { layoutPieceEl } from './deck';
import { addPiece } from './pieces';

// 边框样式:旧 piece 无该字段时按 film 处理(向后兼容)
export function pieceFrameStyle(piece: any){ return (piece && piece.frameStyle) || 'film'; }

// —— 阶段2:按帧选中 + 剪下成独立单张 ——
// 命中检测:把视口坐标换回 piece 局部 nominal,落在哪一帧返回其索引,否则 -1
export function frameAt(piece: Piece, clientX: number, clientY: number, L?: any){
  L = L || pieceLayout(piece); if(!L) return -1;
  const s = deckScale();
  const elLeft = parseFloat(piece.el.style.left), elTop = parseFloat(piece.el.style.top);
  const lx = (clientX - elLeft)/s, ly = (clientY - elTop)/s;
  if(ly < L.framesY || ly > L.framesY + L.fh) return -1;
  for(let i=0;i<L.N;i++){
    const fx = L.originX + i*(L.fw+L.g);
    if(lx >= fx && lx <= fx + L.fw) return i;
  }
  return -1;
}
let cutBtn: any = null;
export function ensureCutBtn(){
  if(cutBtn) return cutBtn;
  cutBtn = document.createElement('button');
  cutBtn.className = 'cut-btn'; cutBtn.textContent = '✂ 剪下';
  cutBtn.title = '把这一帧剪成独立单张(原长条非破坏保留)';
  cutBtn.addEventListener('click', (e: any)=>{ e.stopPropagation(); cutSelected(); });
  document.body.appendChild(cutBtn);
  return cutBtn;
}
export function positionCutBtn(){
  if(!selected){ if(cutBtn) cutBtn.style.display='none'; return; }
  const { piece, idx } = selected;
  const L = pieceLayout(piece);
  if(!L || idx>=L.N){ clearSelection(); return; }
  const s = deckScale();
  const elLeft = parseFloat(piece.el.style.left), elTop = parseFloat(piece.el.style.top);
  const fx = L.originX + idx*(L.fw+L.g);
  const b = ensureCutBtn();
  b.style.display = '';
  b.style.left = (elLeft + (fx + L.fw/2)*s) + 'px';
  b.style.top  = (elTop + L.framesY*s - 8) + 'px';
}
export function setSelection(piece: Piece, idx: number){
  closeFrameBar();        // 选帧与边框工具条互斥
  setSelected({ piece, idx });
  renderPiece(piece);     // 画选框
  positionCutBtn();
}
export function clearSelection(){
  if(!selected) return;
  const pc = selected.piece;
  setSelected(null);
  if(cutBtn) cutBtn.style.display = 'none';
  if(pc && pieces.includes(pc)) renderPiece(pc);   // 去掉选框
}
export function selectFrame(piece: Piece, clientX: number, clientY: number){
  const L = pieceLayout(piece);
  if(!L || L.N<=1){ clearSelection(); return; }     // 单张/空卷无帧可选
  const idx = frameAt(piece, clientX, clientY, L);
  if(idx<0){ clearSelection(); return; }            // 点在帧外 = 取消
  if(selected && selected.piece===piece && selected.idx===idx){ clearSelection(); return; } // 再点同帧 = 取消
  setSelection(piece, idx);
}
// 剪下:复用同一帧的 shot 对象生成 N=1 piece;原长条/原卷非破坏保留该帧
export function cutSelected(){
  if(!selected) return null;
  const { piece, idx } = selected;
  const roll = rollById(piece.rollId);
  const shots = piece.shots || (roll && roll.shots);
  if(!roll || !shots || !shots[idx]) return null;
  const shot = shots[idx];                       // 引用同一 shot(非破坏)
  const L = pieceLayout(piece);
  const c = { x: piece.x + (L?L.cw*0.28:120), y: piece.y + (L?L.ch+50:120) };  // 原片右下错开落点
  const single = addPiece(roll, c.x, c.y, [shot]);
  clearSelection();
  return single;
}

// —— 阶段3:单张胶片边框样式工具条(none / film / polaroid)——
let frameBar: any = null;
export let frameTarget: Piece | null = null;
const FRAME_OPTS: [string, string][] = [['none','无边框'],['film','胶片'],['polaroid','拍立得']];
export function ensureFrameBar(){
  if(frameBar) return frameBar;
  frameBar = document.createElement('div');
  frameBar.className = 'frame-bar';
  FRAME_OPTS.forEach(([v,label])=>{
    const b = document.createElement('button');
    b.className = 'frame-opt'; b.dataset.v = v; b.textContent = label;
    b.addEventListener('click', (e: any)=>{ e.stopPropagation(); if(frameTarget) setFrameStyle(frameTarget, v); });
    frameBar.appendChild(b);
  });
  document.body.appendChild(frameBar);
  return frameBar;
}
export function toggleFrameBar(piece: Piece){
  if(frameTarget===piece){ closeFrameBar(); return; }   // 再点同片 = 收起
  openFrameBar(piece);
}
export function openFrameBar(piece: Piece){
  clearSelection();          // 与剪下选区互斥
  frameTarget = piece;
  positionFrameBar();
}
export function closeFrameBar(){
  frameTarget = null;
  if(frameBar) frameBar.style.display = 'none';
}
export function positionFrameBar(){
  if(!frameTarget){ if(frameBar) frameBar.style.display='none'; return; }
  if(!pieces.includes(frameTarget)){ closeFrameBar(); return; }
  const bar = ensureFrameBar();
  bar.style.display = '';
  const cur = pieceFrameStyle(frameTarget);
  bar.querySelectorAll('.frame-opt').forEach((b: any)=> b.classList.toggle('on', b.dataset.v===cur));
  const s = deckScale();
  const elLeft = parseFloat(frameTarget.el.style.left), elTop = parseFloat(frameTarget.el.style.top);
  bar.style.left = (elLeft + frameTarget.canvas.width*s/2) + 'px';
  bar.style.top  = (elTop - 8) + 'px';
}
export function setFrameStyle(piece: Piece, v: string){
  if(!piece) return;
  piece.frameStyle = v;
  renderPiece(piece);     // 重渲(canvas 尺寸随样式变)
  layoutPieceEl(piece);   // 按新尺寸重排
  positionFrameBar();     // 工具条跟随新尺寸 + 高亮当前项
}
