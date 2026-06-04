// —— 入口编排:DOM 取用 + 事件绑定 + 初始化 ——
//   业务逻辑全部下沉到 types/state/render/deck/pieces/frames/rolls/tray/presets;
//   本文件只做接线,不含任何业务函数体。
import './styles.css';
import type { FilmType, Roll } from './types';
import { $, screen, tray, films, deckScale, ui } from './core';
import { pieces, rolls, filmIdx, rollById, setImportTarget, setNextId, setGlow, setRadius } from './state';
import { render } from './render';
import { applyDeck, updatePlaceholder, deckRect, layoutPieceEl } from './deck';
import { positionCutBtn, positionFrameBar, clearSelection, closeFrameBar } from './frames';
import { addPiece, startPieceDrag, onPointerMove, endPieceDrag, rerenderPiecesByRoll } from './pieces';
import { newRoll, deleteRoll, cycleRollType, removeShot, moveShot, addFiles } from './rolls';
import { expandRoll, hideExpand, cancelHideExpand, scheduleHideExpand, renderTray } from './tray';
import { save, syncLabels, selectFilm, toggleDrawer, seedSampleRoll, setFmt } from './presets';
import { loadAllRolls } from './persist';

// —— 胶卷规格:底部 dock chip + 抽屉「胶片」组 seg(共用 selectFilm)——
const filmsEl = $('#films'), filmSeg = $('#filmSeg');
films.forEach((f,i)=>{
  const chip = document.createElement('div');           // 底部 dock chip
  chip.className = 'film' + (i===filmIdx?' on':'');
  chip.innerHTML = `${f.name}<small>${f.desc}</small>`;
  chip.onclick = ()=>selectFilm(i);
  filmsEl.appendChild(chip);

  const btn = document.createElement('button');         // 抽屉「胶片」组同款
  if(i===filmIdx) btn.className = 'on';
  btn.innerHTML = `${f.name}<small>${f.desc}</small>`;
  btn.onclick = ()=>selectFilm(i);
  filmSeg.appendChild(btn);
});

// —— 导入入口 ——
// 新建卷:点「＋」展开胶片类型三选一,选一类即建空卷(默认反转,不自动上台)
const newRollPanel = $('#newRollPanel');
$('#newRoll').onclick = ()=>{ newRollPanel.hidden = !newRollPanel.hidden; };
newRollPanel.addEventListener('click', (e: MouseEvent)=>{
  const t = (e.target as HTMLElement).dataset.t; if(!t) return;
  newRoll(t as FilmType);
  newRollPanel.hidden = true;
});
const file = $<HTMLInputElement>('#file');
$('#placeholder').onclick = ()=>{ setImportTarget(newRoll()); file.click(); };  // 引导:新建卷并导入(默认反转)
file.onchange = () => { if(file.files) addFiles(file.files); file.value=''; };

// —— 候选区(按卷):卷头 pointerdown 拖出即跟随 / 删除 / 卷内＋导入 ——
const rollsEl = $('#rolls');
rollsEl.addEventListener('pointerdown', (e: PointerEvent)=>{
  if(e.button) return;
  const t = e.target as HTMLElement;
  // 功能按钮(删整卷/导入/删单张/切类型)各自的 click 优先,不起拖
  if(t.closest('.roll-del') || t.closest('.roll-add')
     || t.closest('.roll-type') || t.closest('.del')) return;
  const sec = t.closest('.roll') as HTMLElement | null; if(!sec) return;   // 卡片任意处(含缩略图)都能抓整卷
  const roll = rollById(sec.dataset.r);
  if(!roll || !roll.shots.length) return;     // 空卷没照片,建不了 piece
  e.preventDefault();
  hideExpand();                                  // 抓整卷出发 -> 收起 hover 预览
  const s = deckScale(), r = deckRect();
  const nx = (e.clientX - r.left)/s, ny = (e.clientY - r.top)/s;  // 光标处 nominal
  const piece = addPiece(roll, nx, ny);        // 立刻生成并以中心对齐光标
  if(piece) startPieceDrag(piece, e, true);     // 立刻跟手
});
rollsEl.addEventListener('click', (e: MouseEvent)=>{
  const t = e.target as HTMLElement;
  const sec = t.closest('.roll') as HTMLElement | null; if(!sec) return;
  const roll = rollById(sec.dataset.r); if(!roll) return;
  if(t.classList.contains('roll-del')){ deleteRoll(roll); return; }
  if(t.classList.contains('roll-add')){ setImportTarget(roll); file.click(); return; }
  if(t.classList.contains('roll-type')){ cycleRollType(roll); return; }
  const th = t.closest('.thumb') as HTMLElement | null;
  if(th && t.classList.contains('del')){ removeShot(roll, +th.dataset.i!); return; }
});
rollsEl.addEventListener('dragstart', (e: DragEvent)=>{
  const th = (e.target as HTMLElement).closest('.thumb') as HTMLElement | null;
  if(th && e.dataTransfer){ e.dataTransfer.setData('text/fs-thumb', th.dataset.r+':'+th.dataset.i); e.dataTransfer.effectAllowed='copyMove'; }
});
// 卷作为放置目标:把照片拖进这卷 / 外部文件导入这卷
rollsEl.addEventListener('dragover', (e: DragEvent)=>{
  const sec = (e.target as HTMLElement).closest('.roll'); if(!sec || !e.dataTransfer) return;
  if(e.dataTransfer.types.includes('text/fs-thumb') || e.dataTransfer.types.includes('Files')){
    e.preventDefault(); sec.classList.add('drop-on');
  }
});
rollsEl.addEventListener('dragleave', (e: DragEvent)=>{
  const sec = (e.target as HTMLElement).closest('.roll'); if(sec && !sec.contains(e.relatedTarget as Node)) sec.classList.remove('drop-on');
});
rollsEl.addEventListener('drop', (e: DragEvent)=>{
  const sec = (e.target as HTMLElement).closest('.roll') as HTMLElement | null; if(!sec) return;
  sec.classList.remove('drop-on');
  const roll = rollById(sec.dataset.r); if(!roll || !e.dataTransfer) return;
  const td = e.dataTransfer.getData('text/fs-thumb');
  if(td){ e.preventDefault(); moveShot(td, roll); return; }
  if(e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files, roll); }
});

// —— 台面:仅接收外部 OS 文件(落台/移动 piece 已 pointer 化) ——
['dragover','dragenter'].forEach(ev=>screen.addEventListener(ev,(e: Event)=>{
  const dt = (e as DragEvent).dataTransfer;
  if(!dt || !dt.types.includes('Files')) return;
  e.preventDefault(); screen.classList.add('drag-on'); dt.dropEffect='copy';
}));
['dragleave','dragend'].forEach(ev=>screen.addEventListener(ev,()=>screen.classList.remove('drag-on')));
screen.addEventListener('drop', (e: DragEvent)=>{
  screen.classList.remove('drag-on');
  if(e.dataTransfer && e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files); }   // 外部文件 -> 进卷
});

// 候选区:外部文件拖到卷以外的空白处=进默认卷
['dragover','dragenter'].forEach(ev=>tray.addEventListener(ev,(e: Event)=>{
  const dt = (e as DragEvent).dataTransfer;
  if(dt && dt.types.includes('Files')){ e.preventDefault(); tray.classList.add('drag-on'); }
}));
['dragleave','drop'].forEach(ev=>tray.addEventListener(ev,()=>tray.classList.remove('drag-on')));
tray.addEventListener('drop', (e: DragEvent)=>{
  if(e.dataTransfer && e.dataTransfer.files.length && !(e.target as HTMLElement).closest('.roll')){ e.preventDefault(); addFiles(e.dataTransfer.files); }
});

// 展开条本身的 hover/拖拽:停留其上不收起;pointerdown 仍抓整卷拖到台面
{
  const ex = $('#rollExpand');
  ex.addEventListener('mouseenter', cancelHideExpand);
  ex.addEventListener('mouseleave', scheduleHideExpand);
  ex.addEventListener('pointerdown', (e: PointerEvent)=>{
    if(e.button) return;
    const roll = expandRoll;
    if(!roll || !roll.shots.length) return;     // 空卷无照片,建不了 piece
    e.preventDefault();
    const s = deckScale(), r = deckRect();
    const nx = (e.clientX - r.left)/s, ny = (e.clientY - r.top)/s;
    hideExpand();
    const piece = addPiece(roll, nx, ny);        // 整卷,沿用现有机制
    if(piece) startPieceDrag(piece, e, true);     // 立刻跟手
  });
}

// 窗口缩放:piece 的 nominal 坐标不变,仅按新 scale 重排 CSS
window.addEventListener('resize', ()=>{ pieces.forEach(layoutPieceEl); positionCutBtn(); positionFrameBar(); });

// 统一 pointer 拖动:逻辑在 pieces 模块,这里只绑定
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', endPieceDrag);
window.addEventListener('pointercancel', endPieceDrag);
// 点击 piece / 剪下按钮 / 边框工具条以外的任何地方 = 取消选帧
window.addEventListener('pointerdown', (e: PointerEvent)=>{
  const t = e.target as HTMLElement;
  if(t.closest('.piece') || t.closest('.cut-btn') || t.closest('.frame-bar')) return;
  clearSelection(); closeFrameBar();
});

// 滑块
(Object.keys(ui) as (keyof typeof ui)[]).forEach(k => { ui[k].oninput = () => {
  setGlow(+ui.glow.value);        // 背光亮度(只调观片台面板,见 renderBg)
  setRadius(+ui.radius.value);    // 底片圆角(胶片属性)
  syncLabels(); render();
}; });
$('#fmt').onclick = (e: MouseEvent) => {
  const t = e.target as HTMLElement;
  if(!t.dataset.f) return;
  setFmt(t.dataset.f);
  document.querySelectorAll('#fmt button').forEach(b=>b.classList.remove('on'));
  t.classList.add('on');
};
$('#save').onclick = save;

// 抽屉
$('#gear').onclick = ()=>toggleDrawer(true);
$('#closeDrawer').onclick = ()=>toggleDrawer(false);
$('#scrim').onclick = ()=>toggleDrawer(false);

// —— 初始化 ——
applyDeck();
updatePlaceholder();
if(location.search.includes('selftest')){
  import('./selftest');                       // 自检环境:动态 import 触发 PASS/FAIL 浮层(不触库)
} else {
  // 正常环境:先从 IndexedDB 恢复用户卷,库空才预置示例卷
  void (async ()=>{
    const stored = await loadAllRolls();
    if(stored.length){
      stored.forEach(rec=>{
        const roll: Roll = { id: rec.id, name: rec.name, shots: [], filmType: rec.filmType };
        rec.shots.forEach(blob=>{
          const url = URL.createObjectURL(blob);    // 同源 blob URL,不污染画布
          const im = new Image();
          im.onload = ()=>{ rerenderPiecesByRoll(roll.id); renderTray(); };   // 异步渐次补图
          im.src = url;
          roll.shots.push({ url, img:im, blob });   // 留 blob 以便后续编辑再次落库
        });
        rolls.push(roll);
      });
      setNextId(Math.max(...stored.map(r=>r.id)) + 1);   // 新卷 id 不与恢复卷冲突
      renderTray();                                      // 先显示卷(数量),图随 onload 补
    } else {
      seedSampleRoll();   // 库空才 seed 示例
    }
  })();
}
