// —— 页内零依赖自检:main.ts 在 ?selftest 时动态 import 本模块触发 ——
//   右下角浮层显示 PASS/FAIL,机制与原内联版完全一致。
import { $, bg, bctx, TW, TH, clamp, deckScale, screen } from './core';
import { pieces, selected } from './state';
import { newRoll, cycleRollType, deleteRoll, updateRollSettings, addFiles, moveShot } from './rolls';
import { addPiece, removePiece, startPieceDrag } from './pieces';
import { layoutPieceEl, centerPieceAt } from './deck';
import { pieceLayout, renderPiece } from './render';
import { setSelection, cutSelected, pieceFrameStyle, setFrameStyle } from './frames';
import { rollFilmType, type Roll } from './types';
import { persistRoll, loadAllRolls, writeCount } from './persist';

const T: [string, boolean][] = [], ok = (n: string, c: unknown)=>T.push([n,!!c]);
// 持久层:仅断言函数已导出,selftest 路径不调用任何 DB(见 writeCount 守卫)
ok('持久层函数已导出', typeof persistRoll === 'function' && typeof loadAllRolls === 'function');
ok('selftest 路径未写库(writeCount===0)', writeCount === 0);
const r = newRoll();
const im = new Image();
im.onload = ()=>{
  r.shots.push({ url:im.src, img:im });
  const p1 = addPiece(r, 600, 700)!;
  ok('①拿卷立刻有 piece(addPiece 返回非空且长度+1)', !!p1 && pieces.length===1);
  ok('piece 有 canvas 且已渲染', p1 && p1.canvas.width>0 && p1.canvas.height>0);
  ok('占位已隐藏', $('#placeholder').style.display==='none');
  // 新坐标公式:left/top = 观片台屏幕矩形 + x*s
  const s = deckScale(), rc = screen.getBoundingClientRect();
  const near = (a: number,b: number)=>Math.abs(a-b)<0.05;   // 亚像素容差,避开 IEEE754 字符串格式化噪声
  ok('piece left/top = 屏幕矩形 + x*s',
     near(parseFloat(p1.el.style.left), rc.left + p1.x*s) &&
     near(parseFloat(p1.el.style.top),  rc.top  + p1.y*s));
  ok('④无 .piece-grip 把手 / canvas 上有起拖逻辑',
     !p1.el.querySelector('.piece-grip') && typeof startPieceDrag==='function');
  const p2 = addPiece(r, 1200, 700)!;
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
  const c2 = oc.getContext('2d')!;
  c2.drawImage(bg,0,0,TW,TH);
  pieces.forEach(pc=>c2.drawImage(pc.canvas, pc.x, pc.y));
  // 采样发光窗中心(帧区,1x1 黑图),应非纯白台面底色 -> 证明 piece 真画进导出
  const cx = Math.round(p1.x + p1.canvas.width/2), cy = Math.round(p1.y + p1.canvas.height/2);
  const px = c2.getImageData(clamp(cx,0,TW-1), clamp(cy,0,TH-1), 1, 1).data;
  ok('导出含 piece 像素(非纯白底)', !(px[0]===255 && px[1]===255 && px[2]===255));
  // 把 piece 移到远离观片台处再导出,发光窗中心应回到纯白底色(框外被裁掉)
  p1.x = TW + 3000;
  const oc2 = document.createElement('canvas'); oc2.width=TW; oc2.height=TH;
  const c3 = oc2.getContext('2d')!;
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
  const strip = addPiece(r3, 1000, 400)!;
  ok('长条 piece N=3', pieceLayout(strip)!.N===3);
  setSelection(strip, 1);
  ok('选中帧后有选区(selected 指向该 piece+帧)',
     selected && selected.piece===strip && selected.idx===1);
  const before = pieces.length;
  const single = cutSelected()!;
  ok('剪下生成独立单张 piece(数量+1)', pieces.length===before+1 && !!single);
  ok('单张 = N=1 piece(shots 长度 1,复用逐帧渲染)',
     single && single.shots && single.shots.length===1 && single.canvas.width>0);
  ok('剪下后选区已清空', selected===null);
  ok('非破坏:原长条仍 N=3、原卷帧数不变',
     pieceLayout(strip)!.N===3 && r3.shots.length===3);

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
  const legacy = addPiece(r3, 800, 800, [r3.shots[0]])!;
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
  const rLegacy = newRoll(); delete (rLegacy as Partial<Roll>).filmType;
  ok('旧卷无 filmType 字段按 reversal 向后兼容', rollFilmType(rLegacy)==='reversal');
  rNeg.shots.push({url:im.src,img:im});
  const pNeg = addPiece(rNeg, 700, 900)!;
  ok('负片卷 piece 正常渲染(canvas 有效)', !!pNeg && pNeg.canvas.width>0 && pNeg.canvas.height>0);
  cycleRollType(rNeg);   // negative -> reversal,该卷 piece 实时重渲
  ok('切类型循环并落到 roll(negative->reversal)', rNeg.filmType==='reversal' && pNeg.canvas.width>0);
  removePiece(pNeg); deleteRoll(rNeg); deleteRoll(rLegacy);

  // —— 阶段E:卷设置弹窗契约(对象参 newRoll / cap / updateRollSettings)——
  ok('newRoll() 默认 cap 不限(undefined)', r.cap===undefined);
  const rOpts = newRoll({ filmType:'bw', filmIdx:3, cap:24 });
  ok('newRoll(对象参) 设置 filmType/filmIdx/cap',
     rOpts.filmType==='bw' && rOpts.filmIdx===3 && rOpts.cap===24);
  updateRollSettings(rOpts, { filmType:'negative', filmIdx:0, cap:12 });
  ok('updateRollSettings 就地更新字段',
     rOpts.filmType==='negative' && rOpts.filmIdx===0 && rOpts.cap===12);
  updateRollSettings(rOpts, { filmIdx:2 });   // 仅传 filmIdx:cap 显式回不限,filmType 不变
  ok('updateRollSettings 局部更新 + cap 回不限',
     rOpts.filmIdx===2 && rOpts.filmType==='negative' && rOpts.cap===undefined);
  deleteRoll(rOpts);

  // —— 阶段F:cap 张数上限强制(截断导入 / 满卷阻断移帧)——
  const mkFile = ()=> new File([new Uint8Array([137,80,78,71])], 'x.png', { type:'image/png' });
  const rCap = newRoll({ cap:2 });
  addFiles([mkFile(), mkFile(), mkFile()] as unknown as FileList, rCap);
  ok('cap 截断:3 张导入 cap=2 卷只收 2', rCap.shots.length===2);
  addFiles([mkFile()] as unknown as FileList, rCap);
  ok('满卷再导入被拒(帧数不变)', rCap.shots.length===2);
  const rSrc = newRoll();
  rSrc.shots.push({ url:im.src, img:im });
  moveShot(rSrc.id+':0', rCap);
  ok('moveShot 目标卷满被阻断(源帧保留、目标不变)',
     rSrc.shots.length===1 && rCap.shots.length===2);
  updateRollSettings(rCap, { cap:3 });   // 上调 cap 后腾出 1 张空位
  moveShot(rSrc.id+':0', rCap);
  ok('cap 充足 moveShot 正常移入',
     rSrc.shots.length===0 && rCap.shots.length===3);
  deleteRoll(rCap); deleteRoll(rSrc);

  // 单张能进导出:摆到发光窗中心合成后非纯白底
  centerPieceAt(single, TW/2, TH/2);
  const ocS = document.createElement('canvas'); ocS.width=TW; ocS.height=TH;
  const cS = ocS.getContext('2d')!; cS.drawImage(bg,0,0,TW,TH);
  cS.drawImage(single.canvas, single.x, single.y);
  const sx = Math.round(single.x+single.canvas.width/2), sy = Math.round(single.y+single.canvas.height/2);
  const sp = cS.getImageData(clamp(sx,0,TW-1), clamp(sy,0,TH-1), 1, 1).data;
  ok('④单张出现在导出(非纯白底)', !(sp[0]===255 && sp[1]===255 && sp[2]===255));
  // 清理阶段2用例,回到只剩 p1
  removePiece(single); removePiece(strip); deleteRoll(r3);
  centerPieceAt(p1, TW/2, TH/2);

  oc.toBlob(b=>{
    ok('导出 blob 非空', !!b && b.size>0);
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
