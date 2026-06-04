// —— 导出/标签同步/规格选择/抽屉/示例卷 ——
import { $, bg, TW, TH, ui, out } from './core';
import { pieces, setFilmIdx } from './state';
import { renderPiece } from './render';
import { layoutPieceEl } from './deck';
import { positionCutBtn, positionFrameBar } from './frames';
import { addPiece, rerenderPiecesByRoll } from './pieces';
import { newRoll } from './rolls';
import { renderTray } from './tray';

// —— 导出格式(jpg/png),由底部 dock 切换 ——
let fmt = 'jpg';
export function setFmt(v: string){ fmt = v; }

// —— 导出 ——
export function save(){
  if(!pieces.length) return;
  const type = fmt==='png' ? 'image/png' : 'image/jpeg';
  const out = document.createElement('canvas');
  out.width = TW; out.height = TH;
  const oc = out.getContext('2d')!;
  oc.drawImage(bg,0,0,TW,TH);                      // 发光台面背景
  pieces.slice().sort((a,b)=>a.z-b.z)              // 按 z 从底到顶合成
        .forEach(pc=>oc.drawImage(pc.canvas, pc.x, pc.y));  // nominal 1:1,台面外自然被裁
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob!);
    a.download = 'filmscan.' + fmt;
    a.click();
    URL.revokeObjectURL(a.href);
  }, type, 0.95);
}

export function syncLabels(){
  out.glow.textContent   = ui.glow.value;
  out.radius.textContent = ui.radius.value;
}

// —— 胶卷规格:底部 chip 与抽屉「胶片」组 seg 共用同一套切换逻辑、双向同步高亮 ——
export function selectFilm(i: number){
  setFilmIdx(i);
  document.querySelectorAll('#films .film').forEach((n,idx)=>n.classList.toggle('on', idx===i));
  document.querySelectorAll('#filmSeg button').forEach((n,idx)=>n.classList.toggle('on', idx===i));
  pieces.forEach(pc=>{                 // 切规格:canvas 尺寸变 -> 重渲并按新尺寸重排
    renderPiece(pc);
    layoutPieceEl(pc);
    pc.el.classList.remove('placing'); void pc.el.offsetWidth; pc.el.classList.add('placing');
  });
  positionCutBtn();                    // 选框跟随新几何
  positionFrameBar();                  // 边框工具条跟随新几何
}

// —— 抽屉 ——
const drawer = $('#drawer'), scrim = $('#scrim');
export function toggleDrawer(open: boolean){ drawer.classList.toggle('open', open); scrim.classList.toggle('on', open); }

// —— 内置示例卷:读 images/ 下的实拍图,免去每次手动导入 ——
//    file:// 下无法列目录,文件名只能写死;换示例照片改这份清单(或沿用相同文件名)即可。
const SAMPLE_IMAGES = [
  'images/DSC02800.JPG', 'images/DSC02820.JPG', 'images/DSC02881.JPG',
  'images/DSC02899.JPG', 'images/DSC02910.JPG', 'images/DSC02926.JPG',
];
export function seedSampleRoll(){
  const roll = newRoll(); roll.name = '示例卷';
  SAMPLE_IMAGES.forEach(src=>{
    const img = new Image();
    img.onload  = ()=>{ rerenderPiecesByRoll(roll.id); renderTray(); };
    img.onerror = ()=>{};   // 某张缺失就跳过,不影响其余
    img.src = src;
    roll.shots.push({ url: src, img });
  });
  addPiece(roll, TW/2, TH/2);     // 摆一条到台面中央,图片随 onload 补画
  renderTray();
}
