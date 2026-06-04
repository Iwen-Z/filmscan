// —— 渲染域:发光台面层 + 各 frameStyle 的 piece canvas 绘制 ——
import { rollFilmType, type Piece, type Roll, type Shot } from './types';
import { bg, bctx, TW, TH, films, deckScale } from './core';
import { glow, radius, filmIdx, selected, pieces, rollById } from './state';
import { pieceFrameStyle } from './frames';

// —— 胶卷条几何的解算结果(pieceLayout 返回)——
export interface PieceLayout {
  roll: Roll | undefined;
  shots: Shot[];
  ratio: number; aspect: number;
  fh: number; fw: number; g: number; m: number;
  BH: number; N: number; CW: number; pad: number; stripW: number;
  originX: number; bandTop: number; framesY: number;
  cw: number; ch: number;
}

export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number){
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
export function renderBg(){
  bg.width = TW; bg.height = TH;            // 设宽即清空
  // 背光亮度:只调本台面板明度。低 glow -> 暗灰面板,高 glow -> 亮白面板。
  //   胶片像素不在此处理(见 renderPieceFilm);片基半透明,压台的胶片靠合成自然透出此面板亮度。
  const lum = Math.round(70 + (glow/100)*185);   // glow0 -> 70 暗灰,glow100 -> 255 亮白
  bctx.fillStyle = 'rgb('+lum+','+lum+','+lum+')';
  bctx.fillRect(0,0,TW,TH);
}

// cover 裁切单帧画到 (fx,fy,fw,fh)。照片是不透明乳剂,始终 WYSIWYG,背光不改其明暗。
//   (lightbox 形参保留以兼容既有调用点,不再用于提亮)
function drawPhotoCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined,
                       fx: number, fy: number, fw: number, fh: number,
                       rad: number, far: number, lightbox: boolean){
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
export function pieceLayout(piece: Piece): PieceLayout | null {
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
export function renderPiece(piece: Piece){
  const style = pieceFrameStyle(piece);
  if(style === 'none')     return renderPieceBare(piece);
  if(style === 'polaroid') return renderPiecePolaroid(piece);
  return renderPieceFilm(piece);   // 默认胶片带(向后兼容)
}

// 无边框:只画照片本身,无片基/齿孔/透光带(单张 N=1)
export function renderPieceBare(piece: Piece){
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
export function renderPiecePolaroid(piece: Piece){
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
export function renderPieceFilm(piece: Piece){
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

export function renderAllPieces(){ pieces.forEach(renderPiece); }
export function render(){ renderBg(); renderAllPieces(); }   // 全局外观变化时
