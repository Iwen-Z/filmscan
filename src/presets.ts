// —— 导出/标签同步/抽屉 ——
import { $, bg, TW, TH, ui, out } from './core';
import { pieces } from './state';

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
        .forEach(pc=>{                              // nominal 1:1,台面外自然被裁
          // 单张的随手旋转(render 时设到 piece.rotation)同样应用到导出,绕 piece 中心旋转
          const angle = pc.rotation || 0;
          if(angle){
            const cx = pc.x + pc.canvas.width/2, cy = pc.y + pc.canvas.height/2;
            oc.save();
            oc.translate(cx, cy);
            oc.rotate(angle * Math.PI / 180);
            oc.translate(-cx, -cy);
            oc.drawImage(pc.canvas, pc.x, pc.y);
            oc.restore();
          } else {
            oc.drawImage(pc.canvas, pc.x, pc.y);
          }
        });
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob!);
    a.download = 'filmscan.' + fmt;
    a.click();
    URL.revokeObjectURL(a.href);
  }, type, 0.95);
}

export function syncLabels(){
  out.radius.textContent = ui.radius.value;
}

// —— 抽屉 ——
const drawer = $('#drawer'), scrim = $('#scrim');
export function toggleDrawer(open: boolean){ drawer.classList.toggle('open', open); scrim.classList.toggle('on', open); }
