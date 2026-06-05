// —— 入口编排:DOM 取用 + 事件绑定 + 初始化 ——
//   业务逻辑全部下沉到 types/state/render/deck/pieces/frames/rolls/tray/presets;
//   本文件只做接线,不含任何业务函数体。
import './styles.css';
import type { FilmType, Roll } from './types';
import { rollFilmType, rollFilmIdx } from './types';
import { $, screen, tray, deckScale, ui } from './core';
import { pieces, rolls, rollById, setImportTarget, setNextId, setRadius } from './state';
import { render } from './render';
import { applyDeck, updatePlaceholder, deckRect, layoutPieceEl } from './deck';
import { positionCutBtn, positionFrameBar, clearSelection, closeFrameBar } from './frames';
import { addPiece, startPieceDrag, onPointerMove, endPieceDrag, rerenderPiecesByRoll } from './pieces';
import { newRoll, deleteRoll, cycleRollType, removeShot, moveShot, addFiles, updateRollSettings } from './rolls';
import { expandRoll, hideExpand, cancelHideExpand, scheduleHideExpand, renderTray } from './tray';
import { save, syncLabels, toggleDrawer, setFmt } from './presets';
import { loadAllRolls } from './persist';

const file = $<HTMLInputElement>('#file');
file.onchange = () => { if(file.files) addFiles(file.files); file.value=''; };

// —— 卷设置弹窗:新建/编辑共用,选画幅/类型/张数上限 ——
type RollOpts = { filmType: FilmType; filmIdx: number; cap?: number };
const rollModal = $('#rollModal');
const mTitle = $('#rollModalTitle');
const mFmt = $('#rollModalFmt'), mType = $('#rollModalType'), mCap = $('#rollModalCap');
const mCapCustom = $<HTMLInputElement>('#rollCapCustom');
let modalOnOk: ((opts: RollOpts)=>void) | null = null;

// 单选:容器内仅 btn 高亮(btn=null 时全清)
function selectOne(container: HTMLElement, btn: Element | null){
  container.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===btn));
}
function openRollModal(o: { title: string } & RollOpts & { onOk: (opts: RollOpts)=>void }){
  mTitle.textContent = o.title;
  selectOne(mFmt, mFmt.querySelector(`button[data-idx="${o.filmIdx}"]`));
  selectOne(mType, mType.querySelector(`button[data-v="${o.filmType}"]`));
  // 张数上限:命中预设按钮则高亮该按钮;自定义值进输入框;不限选「不限」
  mCapCustom.value = '';
  const preset = o.cap != null ? mCap.querySelector(`button[data-cap="${o.cap}"]`) : mCap.querySelector('button[data-cap=""]');
  if(o.cap != null && !preset){ mCapCustom.value = String(o.cap); selectOne(mCap, null); }
  else { selectOne(mCap, preset); }
  modalOnOk = o.onOk;
  rollModal.hidden = false;
}
function closeRollModal(){ rollModal.hidden = true; modalOnOk = null; }

mFmt.addEventListener('click', (e: MouseEvent)=>{ const b=(e.target as HTMLElement).closest('button'); if(b) selectOne(mFmt, b); });
mType.addEventListener('click', (e: MouseEvent)=>{ const b=(e.target as HTMLElement).closest('button'); if(b) selectOne(mType, b); });
mCap.addEventListener('click', (e: MouseEvent)=>{ const b=(e.target as HTMLElement).closest('button'); if(b){ mCapCustom.value=''; selectOne(mCap, b); } });
mCapCustom.addEventListener('input', ()=>{ if(mCapCustom.value) selectOne(mCap, null); });

function gatherCap(): number | undefined {
  if(mCapCustom.value){ const n = Math.floor(+mCapCustom.value); return n>0 ? n : undefined; }
  const on = mCap.querySelector('button.on') as HTMLElement | null;
  return on && on.dataset.cap ? +on.dataset.cap : undefined;   // data-cap="" (不限) -> undefined
}
function gatherOpts(): RollOpts {
  const fmtOn = mFmt.querySelector('button.on') as HTMLElement | null;
  const typeOn = mType.querySelector('button.on') as HTMLElement | null;
  return {
    filmIdx: fmtOn && fmtOn.dataset.idx != null ? +fmtOn.dataset.idx : 1,
    filmType: ((typeOn && typeOn.dataset.v) || 'reversal') as FilmType,
    cap: gatherCap(),
  };
}
$('#rollModalCancel').onclick = closeRollModal;
rollModal.addEventListener('click', (e: MouseEvent)=>{ if(e.target===rollModal) closeRollModal(); });  // 点遮罩关闭
$('#rollModalOk').onclick = ()=>{ const cb = modalOnOk; const o = gatherOpts(); closeRollModal(); if(cb) cb(o); };

// 新建卷:点「＋」打开弹窗(空白预填),确定即建空卷(不自动上台)
$('#newRoll').onclick = ()=> openRollModal({ title:'新建卷', filmIdx:1, filmType:'reversal', cap:undefined, onOk:o=>{ newRoll(o); } });
// 引导占位:打开弹窗 -> 确定后新建卷并导入(语义不变)
$('#placeholder').onclick = ()=> openRollModal({ title:'新建卷', filmIdx:1, filmType:'reversal', cap:undefined, onOk:o=>{ setImportTarget(newRoll(o)); file.click(); } });

// —— 候选区(按卷):卷头 pointerdown 拖出即跟随 / 删除 / 卷内＋导入 ——
const rollsEl = $('#rolls');
rollsEl.addEventListener('pointerdown', (e: PointerEvent)=>{
  if(e.button) return;
  const t = e.target as HTMLElement;
  // 功能按钮(删整卷/导入/卷设置/删单张/切类型)各自的 click 优先,不起拖
  if(t.closest('.roll-del') || t.closest('.roll-add') || t.closest('.roll-settings')
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
  if(t.classList.contains('roll-settings')){
    openRollModal({ title:'卷设置', filmIdx: rollFilmIdx(roll), filmType: rollFilmType(roll), cap: roll.cap,
                    onOk:o=>updateRollSettings(roll, o) });
    return;
  }
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
  // 正常环境:从 IndexedDB 恢复用户卷;库空则保持空台面(占位提示引导导入)
  void (async ()=>{
    const stored = await loadAllRolls();
    if(stored.length){
      stored.forEach(rec=>{
        const roll: Roll = { id: rec.id, name: rec.name, shots: [], filmType: rec.filmType, filmIdx: rec.filmIdx ?? 1, cap: rec.cap };
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
    }
  })();
}
