// —— 共享内核:DOM 取用器、台面常量、几何换算、纯工具 ——
//   无业务逻辑;被所有业务模块 import。

export const $ = (s: string): any => document.querySelector(s);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 台面画布分辨率(4:3),导出尺寸
export const TW = 2000, TH = 1500;

export const bg: any = $('#bg');
export const bctx: any = bg.getContext('2d');
bg.width = TW; bg.height = TH;

// 观片台屏幕元素(注意:在本项目里遮蔽全局 window.screen)
export const screen: any = $('#screen');
export const tray: any = $('#tray');

export const ui  = { glow: $('#glow'),  radius: $('#radius') };
export const out = { glow: $('#vGlow'), radius: $('#vRadius') };

// nominal px -> CSS px
export const deckScale = () => screen.clientWidth / TW;

// —— 胶卷规格 ——
//   ratio  = 底片长边占台面对应边的比例(越小底片越小、台面留白越多)
//   aspect = 画幅长短边比(>=1);照片会被 cover 裁成这个比例
export const films = [
  { name:'110',  desc:'微型',   ratio:0.26, aspect:17/13 },  // 13×17mm
  { name:'135',  desc:'35mm',  ratio:0.40, aspect:3/2 },    // 24×36mm
  { name:'120',  desc:'6×6',   ratio:0.58, aspect:1 },      // 正方
  { name:'4×5',  desc:'大画幅', ratio:0.78, aspect:5/4 },    // 4×5 inch
];
