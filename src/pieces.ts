// —— 台面 piece 域:新建/移除/重渲 + 统一 pointer 拖动 ——
import type { Roll, Shot, Piece } from './types';
import { $, deckScale, tray, TW, TH } from './core';
import { pieces, setPieces, selected, bumpZTop } from './state';
import { renderPiece, pieceLayout } from './render';
import { centerPieceAt, layoutPieceEl, clampPieceToViewport, raisePiece, updatePlaceholder } from './deck';
import { clearSelection, closeFrameBar, frameTarget, toggleFrameBar, selectFrame, positionFrameBar } from './frames';

let pieceSeq = 1;

// —— 新建一个 piece 摆上台面 ——
//   shotsOverride 非空时 = 只渲染这些帧(阶段2「剪下」的单张),否则渲染整卷
export function addPiece(roll: Roll, nx: number, ny: number, shotsOverride?: Shot[] | null, frameStyle?: string): Piece | null {
  if(!roll || !roll.shots.length) return null;
  const el = document.createElement('div'); el.className = 'piece';
  // 双层叠放:base canvas(片基,z0)在常规流;photo canvas(照片,z1)绝对定位完全重合叠在其上。
  const canvas = document.createElement('canvas');
  canvas.style.zIndex = '0';
  el.appendChild(canvas);
  const photoCanvas = document.createElement('canvas');
  photoCanvas.style.position = 'absolute';
  photoCanvas.style.top = '0';
  photoCanvas.style.left = '0';
  photoCanvas.style.zIndex = '1';
  el.appendChild(photoCanvas);
  el.insertAdjacentHTML('beforeend', '<button class="piece-del" title="移除">×</button>');
  const piece: Piece = { id:pieceSeq++, rollId:roll.id, x:nx, y:ny, z:bumpZTop(),
                  el, canvas, ctx:canvas.getContext('2d')!,
                  photoCanvas, photoCtx:photoCanvas.getContext('2d')!,
                  shots: shotsOverride || null,
                  frameStyle: frameStyle || 'film' };   // 随 piece 保存,默认胶片
  el.style.zIndex = String(piece.z);
  pieces.push(piece);
  $('#pieces').appendChild(el);
  renderPiece(piece);                     // 先渲染拿到 cw/ch
  centerPieceAt(piece, nx, ny);
  el.classList.add('placing');
  bindPieceEvents(piece);
  updatePlaceholder();
  return piece;
}
export function removePiece(piece: Piece){
  if(selected && selected.piece===piece) clearSelection();
  if(frameTarget===piece) closeFrameBar();
  piece.el.remove();
  setPieces(pieces.filter(p=>p!==piece));
  updatePlaceholder();
}
export function removePiecesByRoll(rollId: number){
  if(selected && String(selected.piece.rollId)===String(rollId)) clearSelection();
  if(frameTarget && String(frameTarget.rollId)===String(rollId)) closeFrameBar();
  pieces.filter(p=>String(p.rollId)===String(rollId)).forEach(p=>p.el.remove());
  setPieces(pieces.filter(p=>String(p.rollId)!==String(rollId)));
  updatePlaceholder();
}
export function rerenderPiecesByRoll(rollId: number){
  // 卷内帧数变化会改变长条几何,使选中帧索引失效 -> 先取消选区再重渲
  if(selected && String(selected.piece.rollId)===String(rollId)) clearSelection();
  pieces.forEach(p=>{ if(String(p.rollId)===String(rollId)) renderPiece(p); });
  positionFrameBar();   // 单张几何/位置可能随之变,跟随重定位
}
// 多片落点层叠,避免完全重叠
export function cascadePos(){
  const n = pieces.length;
  return { x: TW/2 + (n%6)*40, y: TH/2 + (n%6)*40 };
}

// —— 统一 pointer 拖动:抓本体即移动整条;tray 拖出与桌上移动共用同一套逻辑 ——
interface Drag {
  piece: Piece;
  startX: number; startY: number;
  baseX: number; baseY: number;
  fromTray: boolean; leftTray: boolean;
  moved?: boolean;
}
let drag: Drag | null = null;
export function inTray(x: number, y: number){
  const r = tray.getBoundingClientRect();
  return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
}
export function startPieceDrag(piece: Piece, e: PointerEvent, fromTray: boolean){
  raisePiece(piece);
  piece.el.classList.add('dragging');
  drag = { piece, startX:e.clientX, startY:e.clientY,
           baseX:piece.x, baseY:piece.y, fromTray, leftTray:false };
  $('#pieces').style.zIndex = '99';   // 拖动中 piece 浮到候选区(tray z6)之上,跟手途中始终可见
  try{ piece.el.setPointerCapture(e.pointerId); }catch(_){}
}
// window pointermove 处理:逻辑在此,绑定在 main
export function onPointerMove(e: PointerEvent){
  if(!drag) return;
  // 一旦真正移动(>5px)即认定为拖动:取消选帧(否则浮动按钮会停在旧位置)
  if(!drag.moved && Math.hypot(e.clientX-drag.startX, e.clientY-drag.startY)>=5){
    drag.moved = true; clearSelection(); closeFrameBar();
  }
  const s = deckScale();
  drag.piece.x = drag.baseX + (e.clientX-drag.startX)/s;
  drag.piece.y = drag.baseY + (e.clientY-drag.startY)/s;
  layoutPieceEl(drag.piece);
  const over = inTray(e.clientX, e.clientY);
  if(!over) drag.leftTray = true;
  // 仅当“能被移除”时提示:桌上 piece 一进 tray 即提示;tray 新拿出的要先离开过 tray
  tray.classList.toggle('drag-on', over && (drag.leftTray || !drag.fromTray));
}
export function endPieceDrag(e: PointerEvent){
  if(!drag) return;
  const d = drag; drag = null;
  d.piece.el.classList.remove('dragging');
  tray.classList.remove('drag-on');
  $('#pieces').style.zIndex = '';   // 松手后恢复正常层级(回到 CSS 的 z4)
  try{ d.piece.el.releasePointerCapture(e.pointerId); }catch(_){}
  if(inTray(e.clientX, e.clientY)){
    if(d.fromTray && !d.leftTray){          // 纯点击卷头 = 放到台面中央
      const c = cascadePos(); centerPieceAt(d.piece, c.x, c.y);
    } else {                                // 拖回 tray = 移除
      removePiece(d.piece); return;
    }
  } else if(!d.fromTray && !d.moved){       // 桌上轻点(未拖动)
    const L = pieceLayout(d.piece);
    if(L && L.N===1) toggleFrameBar(d.piece);            // 单张 = 浮出边框样式工具条
    else selectFrame(d.piece, e.clientX, e.clientY);     // 长条 = 选中点击处的帧
  }
  clampPieceToViewport(d.piece); layoutPieceEl(d.piece);
}

// 抓 canvas 本体起拖整条;保留显式删除按钮
export function bindPieceEvents(piece: Piece){
  piece.canvas.addEventListener('pointerdown', (e: PointerEvent)=>{
    if(e.button) return;
    startPieceDrag(piece, e, false);
  });
  const del = piece.el.querySelector('.piece-del');
  if(del) del.addEventListener('click', (e: Event)=>{ e.stopPropagation(); removePiece(piece); });
}
