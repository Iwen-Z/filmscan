// —— 入口编排:DOM 取用 + 事件绑定 + 初始化 ——
//   业务逻辑全部下沉到 types/state/render/deck/pieces/frames/rolls/tray/presets;
//   本文件只做接线,不含任何业务函数体。
import './styles.css';
import { $, screen, tray, films, deckScale, ui } from './core';
import { pieces, filmIdx, rollById, setImportTarget, setGlow, setRadius } from './state';
import { render } from './render';
import { applyDeck, updatePlaceholder, deckRect, layoutPieceEl } from './deck';
import { positionCutBtn, positionFrameBar, clearSelection, closeFrameBar } from './frames';
import { addPiece, startPieceDrag, onPointerMove, endPieceDrag } from './pieces';
import { newRoll, deleteRoll, cycleRollType, removeShot, moveShot, addFiles } from './rolls';
import { expandRoll, hideExpand, cancelHideExpand, scheduleHideExpand } from './tray';
import { save, syncLabels, selectFilm, toggleDrawer, seedSampleRoll, setFmt } from './presets';

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
newRollPanel.addEventListener('click', (e: any)=>{
  const t = e.target.dataset.t; if(!t) return;
  newRoll(t);
  newRollPanel.hidden = true;
});
const file = $('#file');
$('#placeholder').onclick = ()=>{ setImportTarget(newRoll()); file.click(); };  // 引导:新建卷并导入(默认反转)
file.onchange = (e: any) => { addFiles(e.target.files); file.value=''; };

// —— 候选区(按卷):卷头 pointerdown 拖出即跟随 / 删除 / 卷内＋导入 ——
const rollsEl = $('#rolls');
rollsEl.addEventListener('pointerdown', (e: any)=>{
  if(e.button) return;
  // 功能按钮(删整卷/导入/删单张/切类型)各自的 click 优先,不起拖
  if(e.target.closest('.roll-del') || e.target.closest('.roll-add')
     || e.target.closest('.roll-type') || e.target.closest('.del')) return;
  const sec = e.target.closest('.roll'); if(!sec) return;   // 卡片任意处(含缩略图)都能抓整卷
  const roll = rollById(sec.dataset.r);
  if(!roll || !roll.shots.length) return;     // 空卷没照片,建不了 piece
  e.preventDefault();
  hideExpand();                                  // 抓整卷出发 -> 收起 hover 预览
  const s = deckScale(), r = deckRect();
  const nx = (e.clientX - r.left)/s, ny = (e.clientY - r.top)/s;  // 光标处 nominal
  const piece = addPiece(roll, nx, ny);        // 立刻生成并以中心对齐光标
  if(piece) startPieceDrag(piece, e, true);     // 立刻跟手
});
rollsEl.addEventListener('click', (e: any)=>{
  const sec = e.target.closest('.roll'); if(!sec) return;
  const roll = rollById(sec.dataset.r); if(!roll) return;
  if(e.target.classList.contains('roll-del')){ deleteRoll(roll); return; }
  if(e.target.classList.contains('roll-add')){ setImportTarget(roll); file.click(); return; }
  if(e.target.classList.contains('roll-type')){ cycleRollType(roll); return; }
  const th = e.target.closest('.thumb');
  if(th && e.target.classList.contains('del')){ removeShot(roll, +th.dataset.i); return; }
});
rollsEl.addEventListener('dragstart', (e: any)=>{
  const th = e.target.closest('.thumb');
  if(th){ e.dataTransfer.setData('text/fs-thumb', th.dataset.r+':'+th.dataset.i); e.dataTransfer.effectAllowed='copyMove'; }
});
// 卷作为放置目标:把照片拖进这卷 / 外部文件导入这卷
rollsEl.addEventListener('dragover', (e: any)=>{
  const sec = e.target.closest('.roll'); if(!sec) return;
  if(e.dataTransfer.types.includes('text/fs-thumb') || e.dataTransfer.types.includes('Files')){
    e.preventDefault(); sec.classList.add('drop-on');
  }
});
rollsEl.addEventListener('dragleave', (e: any)=>{
  const sec = e.target.closest('.roll'); if(sec && !sec.contains(e.relatedTarget)) sec.classList.remove('drop-on');
});
rollsEl.addEventListener('drop', (e: any)=>{
  const sec = e.target.closest('.roll'); if(!sec) return;
  sec.classList.remove('drop-on');
  const roll = rollById(sec.dataset.r); if(!roll) return;
  const td = e.dataTransfer.getData('text/fs-thumb');
  if(td){ e.preventDefault(); moveShot(td, roll); return; }
  if(e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files, roll); }
});

// —— 台面:仅接收外部 OS 文件(落台/移动 piece 已 pointer 化) ——
['dragover','dragenter'].forEach(ev=>screen.addEventListener(ev,(e: any)=>{
  if(!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault(); screen.classList.add('drag-on'); e.dataTransfer.dropEffect='copy';
}));
['dragleave','dragend'].forEach(ev=>screen.addEventListener(ev,(e: any)=>screen.classList.remove('drag-on')));
screen.addEventListener('drop', (e: any)=>{
  screen.classList.remove('drag-on');
  if(e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files); }   // 外部文件 -> 进卷
});

// 候选区:外部文件拖到卷以外的空白处=进默认卷
['dragover','dragenter'].forEach(ev=>tray.addEventListener(ev,(e: any)=>{
  if(e.dataTransfer.types.includes('Files')){ e.preventDefault(); tray.classList.add('drag-on'); }
}));
['dragleave','drop'].forEach(ev=>tray.addEventListener(ev,(e: any)=>tray.classList.remove('drag-on')));
tray.addEventListener('drop', (e: any)=>{
  if(e.dataTransfer.files.length && !e.target.closest('.roll')){ e.preventDefault(); addFiles(e.dataTransfer.files); }
});

// 展开条本身的 hover/拖拽:停留其上不收起;pointerdown 仍抓整卷拖到台面
{
  const ex = $('#rollExpand');
  ex.addEventListener('mouseenter', cancelHideExpand);
  ex.addEventListener('mouseleave', scheduleHideExpand);
  ex.addEventListener('pointerdown', (e: any)=>{
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
window.addEventListener('pointerdown', (e: any)=>{
  if(e.target.closest('.piece') || e.target.closest('.cut-btn') || e.target.closest('.frame-bar')) return;
  clearSelection(); closeFrameBar();
});

// 滑块
for(const k in ui) ui[k].oninput = () => {
  setGlow(+ui.glow.value);        // 背光亮度(只调观片台面板,见 renderBg)
  setRadius(+ui.radius.value);    // 底片圆角(胶片属性)
  syncLabels(); render();
};
$('#fmt').onclick = (e: any) => {
  if(!e.target.dataset.f) return;
  setFmt(e.target.dataset.f);
  document.querySelectorAll('#fmt button').forEach(b=>b.classList.remove('on'));
  e.target.classList.add('on');
};
$('#save').onclick = save;

// 抽屉
$('#gear').onclick = ()=>toggleDrawer(true);
$('#closeDrawer').onclick = ()=>toggleDrawer(false);
$('#scrim').onclick = ()=>toggleDrawer(false);

// —— 初始化 ——
applyDeck();
updatePlaceholder();
if(location.search.includes('selftest')) import('./selftest');   // 自检环境:动态 import 触发 PASS/FAIL 浮层
else seedSampleRoll();                                            // 正常环境:预置示例卷
