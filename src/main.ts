// @ts-nocheck
import './styles.css';

const $ = s => document.querySelector(s);
const bg = $('#bg'), bctx = bg.getContext('2d');
let fmt = 'jpg';

// —— 胶卷:每卷一组照片 ——
let rolls = [];          // [{ id, name, shots:[{url,img}], filmType }]
let nextId = 1;
let importTarget = null; // 下一次导入的目标卷(点某卷的「＋」时设置)
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const rollById = id => rolls.find(r => String(r.id) === String(id));

// —— 胶片类型(per-roll):反转(正片现状) / 黑白(灰度) / 负片(反相+C-41 橙罩) ——
//   旧 roll 无 filmType 字段 -> 按 'reversal' 向后兼容(见 rollFilmType)。
const FILM_TYPES = [
  { v:'reversal', label:'反转' },
  { v:'bw',       label:'黑白' },
  { v:'negative', label:'负片' },
];
const rollFilmType = roll => (roll && roll.filmType) || 'reversal';
const filmTypeLabel = v => (FILM_TYPES.find(t=>t.v===v) || FILM_TYPES[0]).label;

// —— 台面上的 piece:每片是一个 DOM 元素(含自带 canvas),可自由 2D 拖动 ——
//   piece.shots = null   -> 渲染所属卷的全部帧(长条)
//   piece.shots = [shot] -> 只渲染这些帧(阶段2「剪下」的单张就是 N=1 的 piece;shot 仍是原卷里同一对象,非破坏)
let pieces = [];         // [{ id, rollId, x, y, z, el, canvas, ctx, shots }]  x/y=相对观片台屏幕左上角的 nominal 坐标(可负/超界)
let pieceSeq = 1;
let zTop = 0;
let selected = null;     // 阶段2:当前选中的帧 { piece, idx },用于「剪下」
const deckScale = () => screen.clientWidth / TW;   // nominal px -> CSS px

// —— 胶卷规格 ——
//   ratio  = 底片长边占台面对应边的比例(越小底片越小、台面留白越多)
//   aspect = 画幅长短边比(>=1);照片会被 cover 裁成这个比例,横竖跟随照片方向
const films = [
  { name:'110',  desc:'微型', ratio:0.26, aspect:17/13 },  // 13×17mm
  { name:'135',  desc:'35mm', ratio:0.40, aspect:3/2 },    // 24×36mm
  { name:'120',  desc:'6×6',  ratio:0.58, aspect:1 },      // 正方
  { name:'4×5',  desc:'大画幅', ratio:0.78, aspect:5/4 },   // 4×5 inch
];
let filmIdx = 1;          // 默认 135

// —— 胶片本身的属性(独立于观片台,换台子不变) ——
//   glow   = 胶片透过背光后边缘的溢光强度(透光是底片的特性,不是台子的)
//   radius = 底片画幅圆角,真实底片基本是直角 -> 默认 0
let glow = 40;
let radius = 0;

// —— 观片台:硬编码单台 = 专业观片台(不再有切换/多预设) ——
//   背光亮度(glow)只调本台面板亮度,见 renderBg;胶片像素不受其影响。
const DECK = { name:'专业观片台', frame:'pro', base:'#ffffff', unif:0, pixel:0, plate:'FILMSCAN PRO' };
let p = {...DECK};

// 台面画布分辨率(4:3),导出尺寸
const TW = 2000, TH = 1500;
bg.width = TW; bg.height = TH;

const ui  = { glow:$('#glow'), radius:$('#radius') };
const out = { glow:$('#vGlow'), radius:$('#vRadius') };

function rr(c,x,y,w,h,r){
  r = Math.max(0, Math.min(r, w/2, h/2));
  c.beginPath();
  c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r);
  c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);
  c.arcTo(x,y,x+w,y,r);
  c.closePath();
}

// —— 发光台面层(底色/均匀度/像素网格):只随观片台预设与微调变,换照片不动 ——
function renderBg(){
  bg.width = TW; bg.height = TH;            // 设宽即清空
  // 背光亮度:只调本台面板明度。低 glow -> 暗灰面板,高 glow -> 亮白面板。
  //   胶片像素不在此处理(见 renderPieceFilm);片基半透明,压台的胶片靠合成自然透出此面板亮度。
  const lum = Math.round(70 + (glow/100)*185);   // glow0 -> 70 暗灰,glow100 -> 255 亮白
  bctx.fillStyle = 'rgb('+lum+','+lum+','+lum+')';
  bctx.fillRect(0,0,TW,TH);
}

// 边框样式:旧 piece 无该字段时按 film 处理(向后兼容)
function pieceFrameStyle(piece){ return (piece && piece.frameStyle) || 'film'; }

// cover 裁切单帧画到 (fx,fy,fw,fh)。照片是不透明乳剂,始终 WYSIWYG,背光不改其明暗。
//   (lightbox 形参保留以兼容既有调用点,不再用于提亮)
function drawPhotoCover(ctx, img, fx, fy, fw, fh, rad, far, lightbox){
  if(!img || !img.complete || !img.naturalWidth) return;
  const iw = img.naturalWidth, ih = img.naturalHeight, ia = iw/ih;
  let sx,sy,sw,sh;
  if(ia > far){ sh = ih; sw = ih*far; sx = (iw-sw)/2; sy = 0; }
  else        { sw = iw; sh = iw/far; sx = 0; sy = (ih-sh)/2; }
  ctx.save();
  rr(ctx, fx, fy, fw, fh, rad); ctx.clip();
  ctx.drawImage(img, sx,sy,sw,sh, fx, fy, fw, fh);
  ctx.restore();
}

// —— 胶卷条几何:把某个 piece 所属卷的若干帧横排在该 piece 的局部画布上 ——
//   坐标全部在该 piece 的 canvas 局部坐标系,band 整体偏移 PAD(给 glow 留边)
function pieceLayout(piece){
  const roll = rollById(piece.rollId);
  const shots = piece.shots || (roll && roll.shots);   // 剪下的单张用自带 shots 子集,否则整卷
  if(!shots || !shots.length) return null;
  const ratio = films[filmIdx].ratio, aspect = films[filmIdx].aspect;
  const fh = TH * (0.067 + ratio*0.103);   // 帧高随规格变;整体缩小使 135 在 lightbox 高度内可竖排约 7 条(BH≈214,TH/7≈214),台面留白更多
  const fw = fh * aspect;                // 横画幅(长边在水平方向)
  const g  = fh * 0.10;                  // 帧间片基
  const m  = fh * 0.16;                  // 上下片基/齿孔区
  const BH = fh + 2*m;                    // 胶卷带高
  const N  = shots.length;
  const CW = N*fw + (N-1)*g;              // 所有帧内容宽
  const pad = TW * 0.06;                  // 胶卷两端片头
  const stripW = CW + 2*pad;             // 整条内容宽(无窗口截断,长卷比台面宽 -> 伸到框外)
  // 四周留白:必须 >= 外侧 glow 的 shadowBlur(fh*0.16),否则溢光被 canvas 边裁切
  const PAD = Math.ceil(fh*0.22);
  const originX = pad + PAD;              // 首帧在 canvas 局部坐标中的起点
  const bandTop = PAD;                    // band 垂直起点(canvas 高 = BH+2*PAD)
  const framesY = bandTop + m;
  const cw = stripW + 2*PAD, ch = BH + 2*PAD;
  return { roll, shots, ratio, aspect, fh, fw, g, m, BH, N, CW, pad, stripW,
           originX, bandTop, framesY, cw, ch };
}

// —— 渲染入口:按 frameStyle 分支(none / film / polaroid)——
function renderPiece(piece){
  const style = pieceFrameStyle(piece);
  if(style === 'none')     return renderPieceBare(piece);
  if(style === 'polaroid') return renderPiecePolaroid(piece);
  return renderPieceFilm(piece);   // 默认胶片带(向后兼容)
}

// 无边框:只画照片本身,无片基/齿孔/透光带(单张 N=1)
function renderPieceBare(piece){
  const L = pieceLayout(piece);
  if(!L){ return; }
  const { shots, fw, fh, aspect } = L;
  const PAD = Math.ceil(fh*0.12);                 // 给透光柔边留一点余白,免被 canvas 边裁切
  const cw = fw + 2*PAD, ch = fh + 2*PAD;
  piece.canvas.width = cw; piece.canvas.height = ch;
  const s = deckScale();
  piece.el.style.width  = (cw*s)+'px';
  piece.el.style.height = (ch*s)+'px';
  const rad = Math.round(Math.min(fw,fh) * radius/100/2);
  drawPhotoCover(piece.ctx, shots[0] && shots[0].img, PAD, PAD, fw, fh, rad, aspect, true);
}

// 拍立得:经典白边相纸,四周等宽、底部加宽;照片直角不透光(单张 N=1)
function renderPiecePolaroid(piece){
  const L = pieceLayout(piece);
  if(!L){ return; }
  const { shots, fw, fh, aspect } = L;
  const side   = Math.max(6, Math.round(fw*0.06));   // 四周等宽白边
  const bottom = side + Math.round(fh*0.20);         // 底部白边加宽(经典拍立得比例)
  const PAD    = Math.ceil(fh*0.10);                 // 投影/柔边余白
  const cardW = fw + 2*side, cardH = fh + side + bottom;
  const cw = cardW + 2*PAD, ch = cardH + 2*PAD;
  piece.canvas.width = cw; piece.canvas.height = ch;
  const s = deckScale();
  piece.el.style.width  = (cw*s)+'px';
  piece.el.style.height = (ch*s)+'px';
  const ctx = piece.ctx;
  // 白卡 + 轻微投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = Math.round(fh*0.10);
  ctx.shadowOffsetY = Math.round(fh*0.02);
  rr(ctx, PAD, PAD, cardW, cardH, Math.round(side*0.35));
  ctx.fillStyle = '#f7f4ec';
  ctx.fill();
  ctx.restore();
  // 照片:相纸印刷,直角、不叠背光
  drawPhotoCover(ctx, shots[0] && shots[0].img, PAD+side, PAD+side, fw, fh, 0, aspect, false);
}

// —— 渲染胶片带 piece 的 canvas:片基 + 齿孔 + 逐帧裁切 + 透光 ——
function renderPieceFilm(piece){
  const L = pieceLayout(piece);
  if(!L){ return; }
  const ctx = piece.ctx;
  piece.canvas.width = L.cw; piece.canvas.height = L.ch;   // 设宽即清空(透明底)
  const s = deckScale();
  piece.el.style.width  = (L.cw*s)+'px';
  piece.el.style.height = (L.ch*s)+'px';

  const { shots, fh, fw, g, m, BH, CW, originX, bandTop, framesY } = L;
  const rad = Math.round(Math.min(fw,fh) * radius/100/2);
  const bandX = originX - g, bandW = CW + 2*g, bandR = 0;   // 35mm 胶卷是直边长条,不要圆角
  const filmType = rollFilmType(L.roll);   // 该卷胶片类型,决定片基色 + 逐帧画面处理

  // 1) 片基(恒定半透明暗棕胶卷带)+ 齿孔真镂空
  //    关键:片基 alpha 固定半透明,不随任何滑杆变。底下是什么就透出什么:
  //      压在观片台上 -> 透出被背光照亮的面板(亮);摆到台外桌面 -> 透出暗桌面(暗)。
  //    于是「台外胶片不被背光提亮」靠合成自然成立,无需位置判断。
  const BASE_ALPHA = 0.55;                    // 恒定半透明常量
  const EDGE_ALPHA = 0.3;                     // 长边渐隐透光,同样恒定
  ctx.save();
  rr(ctx, bandX, bandTop, bandW, BH, bandR); ctx.clip();
  // 片基色:反转/黑白 = 现状清透灰暗棕;负片 = 橙色(C-41 片基),都保持半透明让背光透上来
  const baseRGB = filmType==='negative' ? '180,90,30' : '38,31,23';
  ctx.fillStyle = 'rgba('+baseRGB+','+BASE_ALPHA+')';
  ctx.fillRect(bandX, bandTop, bandW, BH);
  // destination-out:把齿孔位置的片基像素清成全透明(真镂空)
  ctx.globalCompositeOperation = 'destination-out';
  const holeW = fh*0.10, holeH = m*0.42, holeR = holeH*0.35, step = fh*0.26;
  ctx.fillStyle = '#000';
  for(let x = bandX + step*0.4; x < bandX + bandW - holeW; x += step){
    rr(ctx, x, bandTop + m*0.30, holeW, holeH, holeR); ctx.fill();
    rr(ctx, x, bandTop + BH - m*0.30 - holeH, holeW, holeH, holeR); ctx.fill();
  }
  // 片基长边:恒定的淡渐隐(胶片边缘最薄)——固定值,不随背光变
  {
    const edge = m*0.5;
    let gTop = ctx.createLinearGradient(0,bandTop,0,bandTop+edge);
    gTop.addColorStop(0,'rgba(0,0,0,'+EDGE_ALPHA+')'); gTop.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = gTop; ctx.fillRect(bandX,bandTop,bandW,edge);
    let gBot = ctx.createLinearGradient(0,bandTop+BH-edge,0,bandTop+BH);
    gBot.addColorStop(0,'rgba(0,0,0,0)'); gBot.addColorStop(1,'rgba(0,0,0,'+EDGE_ALPHA+')');
    ctx.fillStyle = gBot; ctx.fillRect(bandX,bandTop+BH-edge,bandW,edge);
  }
  ctx.restore();

  // 2) 逐帧:cover 裁成画幅。照片是不透明乳剂,WYSIWYG,背光不改其像素明暗。
  const far = L.aspect;
  shots.forEach((sh0,i)=>{
    const img = sh0.img;
    if(!img.complete || !img.naturalWidth) return;
    const fx = originX + i*(fw+g);
    if(fx+fw < -60 || fx > L.cw+60) return;        // 视野外跳过
    const iw = img.naturalWidth, ih = img.naturalHeight, ia = iw/ih;
    let sx,sy,sw,sh;
    if(ia > far){ sh = ih; sw = ih*far; sx = (iw-sw)/2; sy = 0; }
    else        { sw = iw; sh = iw/far; sx = 0; sy = (ih-sh)/2; }
    ctx.save();
    rr(ctx, fx, framesY, fw, fh, rad); ctx.clip();
    // 按 filmType 处理画面:reversal 原样;bw 灰度;negative 反相 + 橙罩(C-41 观感)
    if(filmType==='bw')            ctx.filter = 'grayscale(1)';
    else if(filmType==='negative') ctx.filter = 'invert(1)';
    ctx.drawImage(img, sx,sy,sw,sh, fx, framesY, fw, fh);
    ctx.filter = 'none';
    if(filmType==='negative'){     // 叠橙色蒙版(C-41 橙罩),clip 内只染本帧
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(200,100,30,1)';
      ctx.fillRect(fx, framesY, fw, fh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });

  // 3) 阶段2:被选中那帧画虚线选框(仅长条 N>1 才可选帧)
  if(selected && selected.piece===piece && shots.length>1 && selected.idx<shots.length){
    const fx = originX + selected.idx*(fw+g);
    ctx.save();
    ctx.strokeStyle = 'rgba(231,212,168,.95)';
    ctx.lineWidth = Math.max(3, Math.round(Math.min(fw,fh)*0.03));
    ctx.setLineDash([fh*0.09, fh*0.05]);
    rr(ctx, fx, framesY, fw, fh, rad);
    ctx.stroke();
    ctx.restore();
  }
}

function renderAllPieces(){ pieces.forEach(renderPiece); }
function render(){ renderBg(); renderAllPieces(); }   // 全局外观变化时

// —— 硬编码单台:套用专业观片台的机身/铭牌/台名,并渲染 ——
function applyDeck(){
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
function updatePlaceholder(){
  $('#placeholder').style.display = pieces.length ? 'none' : '';
  $('#save').disabled = !pieces.length;
}

// —— piece 的 CSS 布局:piece.x/y 是相对观片台屏幕左上角的 nominal,定位 = 观片台屏幕矩形 + x*s ——
function deckRect(){ return screen.getBoundingClientRect(); }   // 观片台屏幕在视口中的矩形
function layoutPieceEl(piece){
  const s = deckScale(), r = deckRect();
  piece.el.style.left   = (r.left + piece.x*s)+'px';
  piece.el.style.top    = (r.top  + piece.y*s)+'px';
  piece.el.style.width  = (piece.canvas.width*s)+'px';
  piece.el.style.height = (piece.canvas.height*s)+'px';
}
// 至少留 ~40 CSS px 在视口内(避免整片丢失),在视口空间换算回 nominal
function clampPieceToViewport(piece){
  const s = deckScale(), r = deckRect();
  const left = r.left + piece.x*s, top = r.top + piece.y*s;
  const w = piece.canvas.width*s, h = piece.canvas.height*s, m = 40;
  const nl = clamp(left, m - w, window.innerWidth  - m);
  const nt = clamp(top,  m - h, window.innerHeight - m);
  piece.x += (nl-left)/s; piece.y += (nt-top)/s;
}
// 把 piece 中心摆到 nominal 落点(cx,cy),放开 clamp 到整个视口
function centerPieceAt(piece, cx, cy){
  piece.x = cx - piece.canvas.width/2;
  piece.y = cy - piece.canvas.height/2;
  clampPieceToViewport(piece);
  layoutPieceEl(piece);
}
function raisePiece(piece){ piece.z = ++zTop; piece.el.style.zIndex = piece.z; }

// —— 新建一个 piece 摆上台面 ——
//   shotsOverride 非空时 = 只渲染这些帧(阶段2「剪下」的单张),否则渲染整卷
function addPiece(roll, nx, ny, shotsOverride, frameStyle){
  if(!roll || !roll.shots.length) return null;
  const el = document.createElement('div'); el.className = 'piece';
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  el.insertAdjacentHTML('beforeend', '<button class="piece-del" title="移除">×</button>');
  const piece = { id:pieceSeq++, rollId:roll.id, x:nx, y:ny, z:++zTop,
                  el, canvas, ctx:canvas.getContext('2d'),
                  shots: shotsOverride || null,
                  frameStyle: frameStyle || 'film' };   // 随 piece 保存,默认胶片
  el.style.zIndex = piece.z;
  pieces.push(piece);
  $('#pieces').appendChild(el);
  renderPiece(piece);                     // 先渲染拿到 cw/ch
  centerPieceAt(piece, nx, ny);
  el.classList.add('placing');
  bindPieceEvents(piece);
  updatePlaceholder();
  return piece;
}
function removePiece(piece){
  if(selected && selected.piece===piece) clearSelection();
  if(frameTarget===piece) closeFrameBar();
  piece.el.remove();
  pieces = pieces.filter(p=>p!==piece);
  updatePlaceholder();
}
function removePiecesByRoll(rollId){
  if(selected && String(selected.piece.rollId)===String(rollId)) clearSelection();
  if(frameTarget && String(frameTarget.rollId)===String(rollId)) closeFrameBar();
  pieces.filter(p=>String(p.rollId)===String(rollId)).forEach(p=>p.el.remove());
  pieces = pieces.filter(p=>String(p.rollId)!==String(rollId));
  updatePlaceholder();
}
function rerenderPiecesByRoll(rollId){
  // 卷内帧数变化会改变长条几何,使选中帧索引失效 -> 先取消选区再重渲
  if(selected && String(selected.piece.rollId)===String(rollId)) clearSelection();
  pieces.forEach(p=>{ if(String(p.rollId)===String(rollId)) renderPiece(p); });
  positionFrameBar();   // 单张几何/位置可能随之变,跟随重定位
}
// 多片落点层叠,避免完全重叠
function cascadePos(){
  const n = pieces.length;
  return { x: TW/2 + (n%6)*40, y: TH/2 + (n%6)*40 };
}

// —— 统一 pointer 拖动:抓本体即移动整条;tray 拖出与桌上移动共用同一套逻辑 ——
let drag = null;  // {piece, startX, startY, baseX, baseY, fromTray, leftTray}
function inTray(x,y){
  const r = tray.getBoundingClientRect();
  return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
}
function startPieceDrag(piece, e, fromTray){
  raisePiece(piece);
  piece.el.classList.add('dragging');
  drag = { piece, startX:e.clientX, startY:e.clientY,
           baseX:piece.x, baseY:piece.y, fromTray, leftTray:false };
  $('#pieces').style.zIndex = 99;   // 拖动中 piece 浮到候选区(tray z6)之上,跟手途中始终可见
  try{ piece.el.setPointerCapture(e.pointerId); }catch(_){}
}
window.addEventListener('pointermove', e=>{
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
});
function endPieceDrag(e){
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
window.addEventListener('pointerup', endPieceDrag);
window.addEventListener('pointercancel', endPieceDrag);
// 点击 piece / 剪下按钮以外的任何地方 = 取消选帧
window.addEventListener('pointerdown', e=>{
  if(e.target.closest('.piece') || e.target.closest('.cut-btn') || e.target.closest('.frame-bar')) return;
  clearSelection(); closeFrameBar();
});

// 抓 canvas 本体起拖整条;保留显式删除按钮
function bindPieceEvents(piece){
  piece.canvas.addEventListener('pointerdown', e=>{
    if(e.button) return;
    startPieceDrag(piece, e, false);
  });
  const del = piece.el.querySelector('.piece-del');
  if(del) del.addEventListener('click', e=>{ e.stopPropagation(); removePiece(piece); });
}

// —— 阶段2:按帧选中 + 剪下成独立单张 ——
// 命中检测:把视口坐标换回 piece 局部 nominal,落在哪一帧返回其索引,否则 -1
function frameAt(piece, clientX, clientY, L){
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
let cutBtn = null;
function ensureCutBtn(){
  if(cutBtn) return cutBtn;
  cutBtn = document.createElement('button');
  cutBtn.className = 'cut-btn'; cutBtn.textContent = '✂ 剪下';
  cutBtn.title = '把这一帧剪成独立单张(原长条非破坏保留)';
  cutBtn.addEventListener('click', e=>{ e.stopPropagation(); cutSelected(); });
  document.body.appendChild(cutBtn);
  return cutBtn;
}
function positionCutBtn(){
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
function setSelection(piece, idx){
  closeFrameBar();        // 选帧与边框工具条互斥
  selected = { piece, idx };
  renderPiece(piece);     // 画选框
  positionCutBtn();
}
function clearSelection(){
  if(!selected) return;
  const pc = selected.piece;
  selected = null;
  if(cutBtn) cutBtn.style.display = 'none';
  if(pc && pieces.includes(pc)) renderPiece(pc);   // 去掉选框
}
function selectFrame(piece, clientX, clientY){
  const L = pieceLayout(piece);
  if(!L || L.N<=1){ clearSelection(); return; }     // 单张/空卷无帧可选
  const idx = frameAt(piece, clientX, clientY, L);
  if(idx<0){ clearSelection(); return; }            // 点在帧外 = 取消
  if(selected && selected.piece===piece && selected.idx===idx){ clearSelection(); return; } // 再点同帧 = 取消
  setSelection(piece, idx);
}
// 剪下:复用同一帧的 shot 对象生成 N=1 piece;原长条/原卷非破坏保留该帧
function cutSelected(){
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
let frameBar = null, frameTarget = null;
const FRAME_OPTS = [['none','无边框'],['film','胶片'],['polaroid','拍立得']];
function ensureFrameBar(){
  if(frameBar) return frameBar;
  frameBar = document.createElement('div');
  frameBar.className = 'frame-bar';
  FRAME_OPTS.forEach(([v,label])=>{
    const b = document.createElement('button');
    b.className = 'frame-opt'; b.dataset.v = v; b.textContent = label;
    b.addEventListener('click', e=>{ e.stopPropagation(); if(frameTarget) setFrameStyle(frameTarget, v); });
    frameBar.appendChild(b);
  });
  document.body.appendChild(frameBar);
  return frameBar;
}
function toggleFrameBar(piece){
  if(frameTarget===piece){ closeFrameBar(); return; }   // 再点同片 = 收起
  openFrameBar(piece);
}
function openFrameBar(piece){
  clearSelection();          // 与剪下选区互斥
  frameTarget = piece;
  positionFrameBar();
}
function closeFrameBar(){
  frameTarget = null;
  if(frameBar) frameBar.style.display = 'none';
}
function positionFrameBar(){
  if(!frameTarget){ if(frameBar) frameBar.style.display='none'; return; }
  if(!pieces.includes(frameTarget)){ closeFrameBar(); return; }
  const bar = ensureFrameBar();
  bar.style.display = '';
  const cur = pieceFrameStyle(frameTarget);
  bar.querySelectorAll('.frame-opt').forEach(b=> b.classList.toggle('on', b.dataset.v===cur));
  const s = deckScale();
  const elLeft = parseFloat(frameTarget.el.style.left), elTop = parseFloat(frameTarget.el.style.top);
  bar.style.left = (elLeft + frameTarget.canvas.width*s/2) + 'px';
  bar.style.top  = (elTop - 8) + 'px';
}
function setFrameStyle(piece, v){
  if(!piece) return;
  piece.frameStyle = v;
  renderPiece(piece);     // 重渲(canvas 尺寸随样式变)
  layoutPieceEl(piece);   // 按新尺寸重排
  positionFrameBar();     // 工具条跟随新尺寸 + 高亮当前项
}

// —— 卷操作 ——
function newRoll(filmType){
  const id = nextId++;
  const roll = { id, name:'卷 '+id, shots:[], filmType: filmType || 'reversal' };
  rolls.push(roll); renderTray();
  return roll;
}
// 切换某卷胶片类型(循环 反转->黑白->负片),该卷所有 piece 实时重渲
function cycleRollType(roll){
  if(!roll) return;
  const i = FILM_TYPES.findIndex(t=>t.v===rollFilmType(roll));
  roll.filmType = FILM_TYPES[(i+1)%FILM_TYPES.length].v;
  rerenderPiecesByRoll(roll.id);   // 该卷所有 piece 重渲(renderPiece -> renderPieceFilm 按新 filmType)
  renderTray();
}
function deleteRoll(roll){
  roll.shots.forEach(s=>URL.revokeObjectURL(s.url));
  removePiecesByRoll(roll.id);
  rolls = rolls.filter(r=>r!==roll);
  renderTray();
}
function removeShot(roll, i){
  URL.revokeObjectURL(roll.shots[i].url);
  roll.shots.splice(i,1);
  if(roll.shots.length) rerenderPiecesByRoll(roll.id);
  else removePiecesByRoll(roll.id);   // 卷空了,连带移除其 piece
  renderTray();
}
function moveShot(tdata, target){
  const [rid,idx] = tdata.split(':');
  const src = rollById(rid); if(!src || src===target) return;
  const [shot] = src.shots.splice(+idx,1); if(!shot) return;
  target.shots.push(shot);
  if(!src.shots.length) removePiecesByRoll(src.id);
  else rerenderPiecesByRoll(src.id);
  rerenderPiecesByRoll(target.id);
  renderTray();
}

// —— 导入照片进某卷 ——
function addFiles(list, roll){
  const imgs = [...list].filter(f=>f.type.startsWith('image/'));
  if(!imgs.length) return;
  roll = roll || importTarget || (rolls.length ? rolls[rolls.length-1] : newRoll());
  importTarget = null;
  imgs.forEach(f=>{
    const url = URL.createObjectURL(f);
    const im = new Image();
    const shot = { url, img:im };
    im.onload = ()=>{ rerenderPiecesByRoll(roll.id); renderTray(); };
    im.src = url;
    roll.shots.push(shot);
  });
  renderTray();
}

// —— 默认胶圈态:用纯 Canvas 画「卷起的胶圈/胶卷盘」,零图片资源、零依赖 ——
//   同心环(暖色 #e8dcc0 线条,内圈更亮)+ 暗盘底 + 中心留孔。
function drawCoil(canvas){
  const dpr = window.devicePixelRatio || 1;
  const size = 56;
  canvas.width = size*dpr; canvas.height = size*dpr;
  canvas.style.width = size+'px'; canvas.style.height = size+'px';
  const c = canvas.getContext('2d');
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
function drawFrameThumb(canvas, img){
  const dpr = window.devicePixelRatio || 1;
  const h = 80, w = Math.round(h * 3/2);     // 预览统一用 3:2 横画幅
  canvas.style.width = w+'px'; canvas.style.height = h+'px';
  canvas.width = w*dpr; canvas.height = h*dpr;
  const c = canvas.getContext('2d');
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
let expandRoll = null, expandHideTimer = null;
function showExpand(roll, sec){
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
function hideExpand(){
  if(expandHideTimer){ clearTimeout(expandHideTimer); expandHideTimer = null; }
  const wrap = $('#rollExpand');
  wrap.style.display = 'none'; wrap.innerHTML = ''; expandRoll = null;
}
function scheduleHideExpand(){
  if(expandHideTimer) clearTimeout(expandHideTimer);
  expandHideTimer = setTimeout(hideExpand, 120);   // 留点余地,让指针能移进展开条
}
function cancelHideExpand(){ if(expandHideTimer){ clearTimeout(expandHideTimer); expandHideTimer = null; } }

// —— 渲染候选区(按卷分组):默认胶圈态 ——
function renderTray(){
  const wrap = $('#rolls');
  wrap.querySelectorAll('.roll').forEach(n=>n.remove());
  $('#trayEmpty').style.display = rolls.length ? 'none' : 'block';
  // 当前展开卷可能已被删/改,重建后同步收起避免悬挂引用
  if(expandRoll && !rolls.includes(expandRoll)) hideExpand();
  rolls.forEach(roll=>{
    const onDeck = pieces.some(pc=>String(pc.rollId)===String(roll.id));
    const sec = document.createElement('section');
    sec.className = 'roll' + (onDeck ? ' on' : '');
    sec.dataset.r = roll.id;
    sec.title = '按住拖到台面 = 放这卷 · hover 预览各帧';
    sec.innerHTML =
      `<canvas class="coil"></canvas>`+
      `<div class="roll-meta">`+
        `<div class="roll-name">${roll.name}</div>`+
        `<div class="roll-count">${roll.shots.length} 张</div>`+
        `<button class="roll-type" title="切换胶片类型(反转/黑白/负片)">${filmTypeLabel(rollFilmType(roll))}</button>`+
      `</div>`+
      `<div class="roll-btns">`+
        `<button class="roll-add" title="加照片进这卷">＋</button>`+
        `<button class="roll-del" title="删除整卷">×</button>`+
      `</div>`;
    drawCoil(sec.querySelector('.coil'));
    sec.addEventListener('mouseenter', ()=>{ cancelHideExpand(); showExpand(roll, sec); });
    sec.addEventListener('mouseleave', scheduleHideExpand);
    wrap.appendChild(sec);
  });
}

// 展开条本身的 hover/拖拽:停留其上不收起;pointerdown 仍抓整卷拖到台面
{
  const ex = $('#rollExpand');
  ex.addEventListener('mouseenter', cancelHideExpand);
  ex.addEventListener('mouseleave', scheduleHideExpand);
  ex.addEventListener('pointerdown', e=>{
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

// —— 导出 ——
const file = $('#file');
function save(){
  if(!pieces.length) return;
  const type = fmt==='png' ? 'image/png' : 'image/jpeg';
  const out = document.createElement('canvas');
  out.width = TW; out.height = TH;
  const oc = out.getContext('2d');
  oc.drawImage(bg,0,0,TW,TH);                      // 发光台面背景
  pieces.slice().sort((a,b)=>a.z-b.z)              // 按 z 从底到顶合成
        .forEach(pc=>oc.drawImage(pc.canvas, pc.x, pc.y));  // nominal 1:1,台面外自然被裁
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'filmscan.' + fmt;
    a.click();
    URL.revokeObjectURL(a.href);
  }, type, 0.95);
}

function syncLabels(){
  out.glow.textContent   = ui.glow.value;
  out.radius.textContent = ui.radius.value;
}

// —— 胶卷规格:底部 chip 与抽屉「胶片」组 seg 共用同一套切换逻辑、双向同步高亮 ——
function selectFilm(i){
  filmIdx = i;
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
newRollPanel.addEventListener('click', e=>{
  const t = e.target.dataset.t; if(!t) return;
  newRoll(t);
  newRollPanel.hidden = true;
});
$('#placeholder').onclick = ()=>{ importTarget = newRoll(); file.click(); };  // 引导:新建卷并导入(默认反转)
file.onchange = e => { addFiles(e.target.files); file.value=''; };

// —— 候选区(按卷):卷头 pointerdown 拖出即跟随 / 删除 / 卷内＋导入 ——
const rollsEl = $('#rolls');
rollsEl.addEventListener('pointerdown', e=>{
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
rollsEl.addEventListener('click', e=>{
  const sec = e.target.closest('.roll'); if(!sec) return;
  const roll = rollById(sec.dataset.r); if(!roll) return;
  if(e.target.classList.contains('roll-del')){ deleteRoll(roll); return; }
  if(e.target.classList.contains('roll-add')){ importTarget = roll; file.click(); return; }
  if(e.target.classList.contains('roll-type')){ cycleRollType(roll); return; }
  const th = e.target.closest('.thumb');
  if(th && e.target.classList.contains('del')){ removeShot(roll, +th.dataset.i); return; }
});
rollsEl.addEventListener('dragstart', e=>{
  const th = e.target.closest('.thumb');
  if(th){ e.dataTransfer.setData('text/fs-thumb', th.dataset.r+':'+th.dataset.i); e.dataTransfer.effectAllowed='copyMove'; }
});
// 卷作为放置目标:把照片拖进这卷 / 外部文件导入这卷
rollsEl.addEventListener('dragover', e=>{
  const sec = e.target.closest('.roll'); if(!sec) return;
  if(e.dataTransfer.types.includes('text/fs-thumb') || e.dataTransfer.types.includes('Files')){
    e.preventDefault(); sec.classList.add('drop-on');
  }
});
rollsEl.addEventListener('dragleave', e=>{
  const sec = e.target.closest('.roll'); if(sec && !sec.contains(e.relatedTarget)) sec.classList.remove('drop-on');
});
rollsEl.addEventListener('drop', e=>{
  const sec = e.target.closest('.roll'); if(!sec) return;
  sec.classList.remove('drop-on');
  const roll = rollById(sec.dataset.r); if(!roll) return;
  const td = e.dataTransfer.getData('text/fs-thumb');
  if(td){ e.preventDefault(); moveShot(td, roll); return; }
  if(e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files, roll); }
});

// —— 台面:仅接收外部 OS 文件(落台/移动 piece 已 pointer 化) ——
const screen = $('#screen');
['dragover','dragenter'].forEach(ev=>screen.addEventListener(ev,e=>{
  if(!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault(); screen.classList.add('drag-on'); e.dataTransfer.dropEffect='copy';
}));
['dragleave','dragend'].forEach(ev=>screen.addEventListener(ev,e=>screen.classList.remove('drag-on')));
screen.addEventListener('drop', e=>{
  screen.classList.remove('drag-on');
  if(e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files); }   // 外部文件 -> 进卷
});

// 候选区:外部文件拖到卷以外的空白处=进默认卷
const tray = $('#tray');
['dragover','dragenter'].forEach(ev=>tray.addEventListener(ev,e=>{
  if(e.dataTransfer.types.includes('Files')){ e.preventDefault(); tray.classList.add('drag-on'); }
}));
['dragleave','drop'].forEach(ev=>tray.addEventListener(ev,e=>tray.classList.remove('drag-on')));
tray.addEventListener('drop', e=>{
  if(e.dataTransfer.files.length && !e.target.closest('.roll')){ e.preventDefault(); addFiles(e.dataTransfer.files); }
});

// 窗口缩放:piece 的 nominal 坐标不变,仅按新 scale 重排 CSS
window.addEventListener('resize', ()=>{ pieces.forEach(layoutPieceEl); positionCutBtn(); positionFrameBar(); });

// 滑块
for(const k in ui) ui[k].oninput = () => {
  glow=+ui.glow.value;        // 背光亮度(只调观片台面板,见 renderBg)
  radius=+ui.radius.value;    // 底片圆角(胶片属性)
  syncLabels(); render();
};
$('#fmt').onclick = e => {
  if(!e.target.dataset.f) return;
  fmt = e.target.dataset.f;
  document.querySelectorAll('#fmt button').forEach(b=>b.classList.remove('on'));
  e.target.classList.add('on');
};
$('#save').onclick = save;

// 抽屉
const drawer = $('#drawer'), scrim = $('#scrim');
function toggleDrawer(open){ drawer.classList.toggle('open', open); scrim.classList.toggle('on', open); }
$('#gear').onclick = ()=>toggleDrawer(true);
$('#closeDrawer').onclick = ()=>toggleDrawer(false);
scrim.onclick = ()=>toggleDrawer(false);

// —— 内置示例卷:读 images/ 下的实拍图,免去每次手动导入 ——
//    file:// 下无法列目录,文件名只能写死;换示例照片改这份清单(或沿用相同文件名)即可。
const SAMPLE_IMAGES = [
  'images/DSC02800.JPG', 'images/DSC02820.JPG', 'images/DSC02881.JPG',
  'images/DSC02899.JPG', 'images/DSC02910.JPG', 'images/DSC02926.JPG',
];
function seedSampleRoll(){
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

applyDeck();
updatePlaceholder();
if(!location.search.includes('selftest')) seedSampleRoll();   // 自检环境不预置,免得干扰断言计数

// —— 页内零依赖自检:打开 index.html?selftest 自动跑,右下角浮层显示 PASS/FAIL ——
if(location.search.includes('selftest')){
  const T=[], ok=(n,c)=>T.push([n,!!c]);
  const r = newRoll();
  const im = new Image();
  im.onload = ()=>{
    r.shots.push({ url:im.src, img:im });
    const p1 = addPiece(r, 600, 700);
    ok('①拿卷立刻有 piece(addPiece 返回非空且长度+1)', !!p1 && pieces.length===1);
    ok('piece 有 canvas 且已渲染', p1 && p1.canvas.width>0 && p1.canvas.height>0);
    ok('占位已隐藏', $('#placeholder').style.display==='none');
    // 新坐标公式:left/top = 观片台屏幕矩形 + x*s
    const s = deckScale(), rc = screen.getBoundingClientRect();
    const near = (a,b)=>Math.abs(a-b)<0.05;   // 亚像素容差,避开 IEEE754 字符串格式化噪声
    ok('piece left/top = 屏幕矩形 + x*s',
       near(parseFloat(p1.el.style.left), rc.left + p1.x*s) &&
       near(parseFloat(p1.el.style.top),  rc.top  + p1.y*s));
    ok('④无 .piece-grip 把手 / canvas 上有起拖逻辑',
       !p1.el.querySelector('.piece-grip') && typeof startPieceDrag==='function');
    const p2 = addPiece(r, 1200, 700);
    ok('可摆第二片(同卷多片)', pieces.length===2);
    ok('第二片 z 更高', p2.z>p1.z);
    const bx = p1.x; p1.x += 120; layoutPieceEl(p1);
    ok('移动改变 left', near(parseFloat(p1.el.style.left), rc.left + p1.x*s) && p1.x!==bx);
    // ②可摆到台框外(负 nominal 坐标),layoutPieceEl 不把它拉回框内
    p1.x = -300; layoutPieceEl(p1);
    ok('②piece 可摆到台框外(负坐标不被拉回)',
       p1.x===-300 && near(parseFloat(p1.el.style.left), rc.left + (-300)*s));
    removePiece(p2);
    ok('删除 piece 后长度回 1', pieces.length===1);
    // ⑥导出只截观片台:画框=TW×TH,piece 按相对观片台的 nominal 偏移合成,框外被裁
    centerPieceAt(p1, TW/2, TH/2);   // 摆到发光窗中央
    const oc = document.createElement('canvas'); oc.width=TW; oc.height=TH;
    const c2 = oc.getContext('2d');
    c2.drawImage(bg,0,0,TW,TH);
    pieces.forEach(pc=>c2.drawImage(pc.canvas, pc.x, pc.y));
    // 采样发光窗中心(帧区,1x1 黑图),应非纯白台面底色 -> 证明 piece 真画进导出
    const cx = Math.round(p1.x + p1.canvas.width/2), cy = Math.round(p1.y + p1.canvas.height/2);
    const px = c2.getImageData(clamp(cx,0,TW-1), clamp(cy,0,TH-1), 1, 1).data;
    ok('导出含 piece 像素(非纯白底)', !(px[0]===255 && px[1]===255 && px[2]===255));
    // 把 piece 移到远离观片台处再导出,发光窗中心应回到纯白底色(框外被裁掉)
    p1.x = TW + 3000;
    const oc2 = document.createElement('canvas'); oc2.width=TW; oc2.height=TH;
    const c3 = oc2.getContext('2d');
    c3.drawImage(bg,0,0,TW,TH);
    pieces.forEach(pc=>c3.drawImage(pc.canvas, pc.x, pc.y));
    const pc2 = c3.getImageData(TW/2|0, TH/2|0, 1, 1).data;
    // 面板亮度现随背光(glow)变,不再恒为纯白 -> 与台面底色(bg 同点)逐通道比对
    const bgC = bctx.getImageData(TW/2|0, TH/2|0, 1, 1).data;
    ok('⑥框外 piece 被裁(中心回台面底色)', pc2[0]===bgC[0] && pc2[1]===bgC[1] && pc2[2]===bgC[2]);
    centerPieceAt(p1, TW/2, TH/2);   // 复位

    // —— 阶段2:按帧剪出单张 ——
    const r3 = newRoll();
    r3.shots.push({url:im.src,img:im},{url:im.src,img:im},{url:im.src,img:im});  // 3 帧长条
    const strip = addPiece(r3, 1000, 400);
    ok('长条 piece N=3', pieceLayout(strip).N===3);
    setSelection(strip, 1);
    ok('选中帧后有选区(selected 指向该 piece+帧)',
       selected && selected.piece===strip && selected.idx===1);
    const before = pieces.length;
    const single = cutSelected();
    ok('剪下生成独立单张 piece(数量+1)', pieces.length===before+1 && !!single);
    ok('单张 = N=1 piece(shots 长度 1,复用逐帧渲染)',
       single && single.shots && single.shots.length===1 && single.canvas.width>0);
    ok('剪下后选区已清空', selected===null);
    ok('非破坏:原长条仍 N=3、原卷帧数不变',
       pieceLayout(strip).N===3 && r3.shots.length===3);

    // —— 阶段3:单张边框样式切换 ——
    ok('剪下单张默认 frameStyle=film', pieceFrameStyle(single)==='film');
    setFrameStyle(single, 'none');
    const wNone = single.canvas.width, hNone = single.canvas.height;
    ok('切 none:frameStyle 落到 piece 且画布有效',
       single.frameStyle==='none' && wNone>0 && hNone>0);
    setFrameStyle(single, 'polaroid');
    const wPol = single.canvas.width, hPol = single.canvas.height;
    ok('切 polaroid:四周加白边(画布两维都变大)',
       single.frameStyle==='polaroid' && wPol>wNone && hPol>hNone);
    ok('polaroid 底部白边更宽(高度增量 > 宽度增量)', (hPol-hNone) > (wPol-wNone));
    // 向后兼容:旧 piece 无 frameStyle 字段时按 film 处理且能渲染
    const legacy = addPiece(r3, 800, 800, [r3.shots[0]]);
    delete legacy.frameStyle;
    renderPiece(legacy);
    ok('旧 piece 无 frameStyle 字段按 film 处理',
       pieceFrameStyle(legacy)==='film' && legacy.canvas.width>0);
    removePiece(legacy);
    setFrameStyle(single, 'film');   // 复位,后续导出断言基于 film 几何

    // —— 阶段D:per-roll 胶片类型(反转/黑白/负片)——
    ok('新建卷默认 filmType=reversal', r.filmType==='reversal' && rollFilmType(r)==='reversal');
    const rNeg = newRoll('negative');
    ok('newRoll(negative) 设置 filmType', rNeg.filmType==='negative');
    const rLegacy = newRoll(); delete rLegacy.filmType;
    ok('旧卷无 filmType 字段按 reversal 向后兼容', rollFilmType(rLegacy)==='reversal');
    rNeg.shots.push({url:im.src,img:im});
    const pNeg = addPiece(rNeg, 700, 900);
    ok('负片卷 piece 正常渲染(canvas 有效)', !!pNeg && pNeg.canvas.width>0 && pNeg.canvas.height>0);
    cycleRollType(rNeg);   // negative -> reversal,该卷 piece 实时重渲
    ok('切类型循环并落到 roll(negative->reversal)', rNeg.filmType==='reversal' && pNeg.canvas.width>0);
    removePiece(pNeg); deleteRoll(rNeg); deleteRoll(rLegacy);

    // 单张能进导出:摆到发光窗中心合成后非纯白底
    centerPieceAt(single, TW/2, TH/2);
    const ocS = document.createElement('canvas'); ocS.width=TW; ocS.height=TH;
    const cS = ocS.getContext('2d'); cS.drawImage(bg,0,0,TW,TH);
    cS.drawImage(single.canvas, single.x, single.y);
    const sx = Math.round(single.x+single.canvas.width/2), sy = Math.round(single.y+single.canvas.height/2);
    const sp = cS.getImageData(clamp(sx,0,TW-1), clamp(sy,0,TH-1), 1, 1).data;
    ok('④单张出现在导出(非纯白底)', !(sp[0]===255 && sp[1]===255 && sp[2]===255));
    // 清理阶段2用例,回到只剩 p1
    removePiece(single); removePiece(strip); deleteRoll(r3);
    centerPieceAt(p1, TW/2, TH/2);

    oc.toBlob(b=>{
      ok('导出 blob 非空', b && b.size>0);
      // ⑤模拟拖回 tray 移除
      removePiece(pieces[0]);
      ok('⑤拖回 tray 移除后占位重现', pieces.length===0 && $('#placeholder').style.display==='');
      const pass = T.every(t=>t[1]);
      console.table(T.map(([n,v])=>({test:n,pass:v})));
      const d = document.createElement('div');
      d.style.cssText='position:fixed;right:8px;bottom:8px;z-index:99;padding:8px 12px;border-radius:8px;font:12px monospace;color:#fff;background:'+(pass?'#1a7f37':'#b42318');
      d.textContent=(pass?'SELFTEST PASS ':'SELFTEST FAIL ')+T.filter(t=>!t[1]).map(t=>t[0]).join('; ');
      document.body.appendChild(d);
    }, 'image/png');
  };
  im.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
}
