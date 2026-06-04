// —— 全局可变态 + 访问器/setter ——
//   ESM 下 import 来的绑定不可重新赋值,故凡是「整体替换/自增」的态都经 setter 改写;
//   就地修改(push/splice/forEach)直接操作导出的引用即可。
import type { Roll, Piece } from './types';

// —— 胶卷:每卷一组照片 ——
export let rolls: Roll[] = [];
export function setRolls(v: Roll[]) { rolls = v; }

// —— 台面上的 piece ——
export let pieces: Piece[] = [];
export function setPieces(v: Piece[]) { pieces = v; }

// 卷 id 自增
export let nextId = 1;
export function setNextId(v: number) { nextId = v; }
export function allocId() { const id = nextId; nextId = id + 1; return id; }

// piece 叠放层级
export let zTop = 0;
export function bumpZTop() { zTop += 1; return zTop; }

// 阶段2:当前选中的帧 { piece, idx },用于「剪下」
export let selected: { piece: Piece; idx: number } | null = null;
export function setSelected(v: { piece: Piece; idx: number } | null) { selected = v; }

// 下一次导入的目标卷(点某卷的「＋」时设置)
export let importTarget: Roll | null = null;
export function setImportTarget(v: Roll | null) { importTarget = v; }

// —— 胶片/台面可调态(滑杆/规格选择驱动)——
export let glow = 40;                 // 背光亮度(只调观片台面板,见 renderBg)
export function setGlow(v: number) { glow = v; }
export let radius = 0;                // 底片圆角(胶片属性)
export function setRadius(v: number) { radius = v; }
export let filmIdx = 1;               // 画幅规格,默认 135
export function setFilmIdx(v: number) { filmIdx = v; }

export const rollById = (id: string | number | undefined): Roll | undefined =>
  rolls.find(r => String(r.id) === String(id));
