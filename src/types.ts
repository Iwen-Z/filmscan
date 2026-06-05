// —— 全局契约:下游所有模块从这里 import 类型与胶片类型常量 ——

// —— 胶片类型(per-roll):反转(正片现状) / 黑白(灰度) / 负片(反相+C-41 橙罩) ——
export type FilmType = 'reversal' | 'bw' | 'negative';

export interface Shot {
  url: string;
  img: HTMLImageElement;
  blob?: Blob;
}

export interface Roll {
  id: number;
  name: string;
  shots: Shot[];
  filmType: FilmType;
}

// —— 台面上的 piece:每片是一个 DOM 元素(含自带 canvas),可自由 2D 拖动 ——
//   piece.shots = null   -> 渲染所属卷的全部帧(长条)
//   piece.shots = [shot] -> 只渲染这些帧(阶段2「剪下」的单张)
export interface Piece {
  id: number;
  rollId: number;
  x: number;   // 相对观片台屏幕左上角的 nominal 坐标(可负/超界)
  y: number;
  z: number;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  shots: Shot[] | null;
  frameStyle?: string;
}

//   旧 roll 无 filmType 字段 -> 按 'reversal' 向后兼容(见 rollFilmType)。
export const FILM_TYPES: { v: FilmType; label: string }[] = [
  { v: 'reversal', label: '反转' },
  { v: 'bw',       label: '黑白' },
  { v: 'negative', label: '负片' },
];

export const rollFilmType = (roll?: Roll | null): FilmType =>
  (roll && roll.filmType) || 'reversal';
export const filmTypeLabel = (v: FilmType): string =>
  (FILM_TYPES.find(t => t.v === v) || FILM_TYPES[0]).label;
