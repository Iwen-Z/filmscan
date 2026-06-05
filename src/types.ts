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
  filmIdx: number;   // 画幅规格索引(对应 core.ts films);per-roll,旧卷缺字段按 1=135 兼容(见 rollFilmIdx)
  cap?: number;      // 张数上限(硬上限);undefined=不限
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
  // 双层叠放 canvas(同尺寸、完全重合):base 在下(片基/齿孔/印字/漏光),photo 在上(逐帧照片/暗角/halation/灰尘/负片处理)。
  //   字段名沿用 canvas/ctx(= base 层,避免大范围重命名),photoCanvas/photoCtx 为新增的照片层。
  canvas: HTMLCanvasElement;        // base 层(片基):z-index 0
  ctx: CanvasRenderingContext2D;    // = canvas 的 2d 上下文
  photoCanvas: HTMLCanvasElement;   // photo 层(照片):absolute 叠在 base 之上,z-index 1
  photoCtx: CanvasRenderingContext2D;
  shots: Shot[] | null;
  frameStyle?: string;
  rotation?: number;   // 整卷的确定性轻微旋转(弧度,LCG 派生);导出读取以匹配台面观感,剪下单张恒为 0
}

//   旧 roll 无 filmType 字段 -> 按 'reversal' 向后兼容(见 rollFilmType)。
export const FILM_TYPES: { v: FilmType; label: string }[] = [
  { v: 'reversal', label: '反转' },
  { v: 'bw',       label: '黑白' },
  { v: 'negative', label: '负片' },
];

export const rollFilmType = (roll?: Roll | null): FilmType =>
  (roll && roll.filmType) || 'reversal';
export const rollFilmIdx = (roll?: Roll | null): number =>
  (roll && roll.filmIdx != null ? roll.filmIdx : 1);
export const filmTypeLabel = (v: FilmType): string =>
  (FILM_TYPES.find(t => t.v === v) || FILM_TYPES[0]).label;
