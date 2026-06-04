// —— 观片台域:硬编码单台机身/铭牌 + piece 的 CSS 布局/视口夹取 ——
import type { Piece } from './types';
import { $, screen, deckScale, clamp } from './core';
import { pieces, bumpZTop } from './state';
import { render } from './render';
import { positionCutBtn, positionFrameBar } from './frames';

// —— 观片台:硬编码单台 = 专业观片台(不再有切换/多预设) ——
const DECK = { name:'专业观片台', frame:'pro', base:'#ffffff', unif:0, pixel:0, plate:'FILMSCAN PRO' };
let p: any = {...DECK};

// —— 硬编码单台:套用专业观片台的机身/铭牌/台名,并渲染 ——
export function applyDeck(){
  p = {...DECK};
  $('#bodyEl').className = 'body ' + p.frame;
  $('#nameplate').textContent = p.plate || '';
  $('#deckname').textContent = p.name;
  render();
  pieces.forEach(layoutPieceEl);
  positionCutBtn();
  positionFrameBar();
}

// —— 台面占位/保存按钮状态 ——
export function updatePlaceholder(){
  $('#placeholder').style.display = pieces.length ? 'none' : '';
  $('#save').disabled = !pieces.length;
}

// —— piece 的 CSS 布局:piece.x/y 是相对观片台屏幕左上角的 nominal,定位 = 观片台屏幕矩形 + x*s ——
export function deckRect(){ return screen.getBoundingClientRect(); }   // 观片台屏幕在视口中的矩形
export function layoutPieceEl(piece: Piece){
  const s = deckScale(), r = deckRect();
  piece.el.style.left   = (r.left + piece.x*s)+'px';
  piece.el.style.top    = (r.top  + piece.y*s)+'px';
  piece.el.style.width  = (piece.canvas.width*s)+'px';
  piece.el.style.height = (piece.canvas.height*s)+'px';
}
// 至少留 ~40 CSS px 在视口内(避免整片丢失),在视口空间换算回 nominal
export function clampPieceToViewport(piece: Piece){
  const s = deckScale(), r = deckRect();
  const left = r.left + piece.x*s, top = r.top + piece.y*s;
  const w = piece.canvas.width*s, h = piece.canvas.height*s, m = 40;
  const nl = clamp(left, m - w, window.innerWidth  - m);
  const nt = clamp(top,  m - h, window.innerHeight - m);
  piece.x += (nl-left)/s; piece.y += (nt-top)/s;
}
// 把 piece 中心摆到 nominal 落点(cx,cy),放开 clamp 到整个视口
export function centerPieceAt(piece: Piece, cx: number, cy: number){
  piece.x = cx - piece.canvas.width/2;
  piece.y = cy - piece.canvas.height/2;
  clampPieceToViewport(piece);
  layoutPieceEl(piece);
}
export function raisePiece(piece: Piece){ piece.z = bumpZTop(); piece.el.style.zIndex = String(piece.z); }
