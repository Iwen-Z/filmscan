// —— 卷操作域:新建/切类型/删卷/删帧/移帧/导入照片 ——
import type { FilmType, Roll } from './types';
import { FILM_TYPES, rollFilmType } from './types';
import { rolls, setRolls, allocId, importTarget, setImportTarget, rollById } from './state';
import { rerenderPiecesByRoll, removePiecesByRoll } from './pieces';
import { renderTray } from './tray';
import { persistRoll, deleteRollFromDB } from './persist';
import { toast } from './core';

// 新建空卷。
//   新签名走对象参 { filmType?, filmIdx?, cap? };
//   向后兼容旧位置参字符串形式 newRoll('reversal')(selftest 在用)。
export function newRoll(opts?: { filmType?: FilmType; filmIdx?: number; cap?: number } | FilmType): Roll {
  const o = typeof opts === 'string' ? { filmType: opts } : (opts || {});
  const id = allocId();
  const roll: Roll = {
    id, name:'卷 '+id, shots:[],
    filmType: o.filmType || 'reversal',
    filmIdx: o.filmIdx != null ? o.filmIdx : 1,
    cap: o.cap,
  };
  rolls.push(roll); renderTray();
  return roll;
}
// 就地更新卷设置(编辑模式):画幅/类型/张数上限 -> 重渲该卷 piece + tray + 落库
export function updateRollSettings(roll: Roll, opts: { filmType?: FilmType; filmIdx?: number; cap?: number }): void {
  if(!roll) return;
  if(opts.filmType != null) roll.filmType = opts.filmType;
  if(opts.filmIdx != null)  roll.filmIdx = opts.filmIdx;
  // 下调 cap 到现有帧数以下:不删帧,仅提示满卷后无法继续导入
  if(opts.cap != null && opts.cap < roll.shots.length)
    toast(`当前已有 ${roll.shots.length} 张,下调 cap 不删帧,满卷后无法继续导入`);
  roll.cap = opts.cap;       // undefined = 不限(显式覆盖)
  rerenderPiecesByRoll(roll.id);   // 画幅/类型变 -> 该卷所有 piece 重渲
  renderTray();
  void persistRoll(roll);          // 设置变更落库(fire-and-forget)
}
// 切换某卷胶片类型(循环 反转->黑白->负片),该卷所有 piece 实时重渲
export function cycleRollType(roll: Roll){
  if(!roll) return;
  const i = FILM_TYPES.findIndex(t=>t.v===rollFilmType(roll));
  roll.filmType = FILM_TYPES[(i+1)%FILM_TYPES.length].v;
  rerenderPiecesByRoll(roll.id);   // 该卷所有 piece 重渲(renderPiece -> renderPieceFilm 按新 filmType)
  renderTray();
  void persistRoll(roll);          // filmType 变更落库(fire-and-forget)
}
export function deleteRoll(roll: Roll){
  roll.shots.forEach(s=>URL.revokeObjectURL(s.url));
  removePiecesByRoll(roll.id);
  setRolls(rolls.filter(r=>r!==roll));
  renderTray();
  void deleteRollFromDB(roll.id);  // 删卷:同步从库移除(fire-and-forget)
}
export function removeShot(roll: Roll, i: number){
  URL.revokeObjectURL(roll.shots[i].url);
  roll.shots.splice(i,1);
  if(roll.shots.length) rerenderPiecesByRoll(roll.id);
  else removePiecesByRoll(roll.id);   // 卷空了,连带移除其 piece
  renderTray();
  void persistRoll(roll);          // 帧数变更:覆盖整卷
}
export function moveShot(tdata: string, target: Roll){
  const [rid,idx] = tdata.split(':');
  const src = rollById(rid); if(!src || src===target) return;
  if(target.cap != null && target.shots.length >= target.cap){ toast('目标卷已满'); return; }
  const [shot] = src.shots.splice(+idx,1); if(!shot) return;
  target.shots.push(shot);
  if(!src.shots.length) removePiecesByRoll(src.id);
  else rerenderPiecesByRoll(src.id);
  rerenderPiecesByRoll(target.id);
  renderTray();
  void persistRoll(src); void persistRoll(target);   // 两卷归属变更都落库
}

// —— 导入照片进某卷 ——
export function addFiles(list: FileList, roll?: Roll | null){
  let imgs = [...list].filter((f: File)=>f.type.startsWith('image/'));
  if(!imgs.length) return;
  const dest = roll || importTarget || (rolls.length ? rolls[rolls.length-1] : newRoll());
  setImportTarget(null);
  // cap 强制:只允许导入剩余容量内的帧,多余截断并 toast 提示
  const remaining = dest.cap != null ? dest.cap - dest.shots.length : Infinity;
  if(remaining <= 0){ toast('卷已满,无法继续导入'); return; }
  if(imgs.length > remaining){
    const skipped = imgs.length - remaining;
    imgs = imgs.slice(0, remaining);
    toast(`卷已满,仅导入 ${remaining} 张(已跳过 ${skipped} 张)`);
  }
  imgs.forEach((f: File)=>{
    const url = URL.createObjectURL(f);
    const im = new Image();
    const shot = { url, img:im, blob:f };   // File 即 Blob,直接留作持久化源
    im.onload = ()=>{ rerenderPiecesByRoll(dest.id); renderTray(); };
    im.src = url;
    dest.shots.push(shot);
  });
  renderTray();
  void persistRoll(dest);   // 导入后整卷落库(blob 已就绪,无需等 onload)
}
