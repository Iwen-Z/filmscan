// —— 共享内核:DOM 取用器、台面常量、几何换算、纯工具 ——
//   无业务逻辑;被所有业务模块 import。

// querySelector 包装:T 默认 HTMLElement;命中即非空,故 as T 收窄(DOM 静态契约,缺元素是 bug 非常态)
export const $ = <T extends Element = HTMLElement>(s: string): T => document.querySelector(s) as T;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 轻提示:无依赖临时 toast,4s 后自移除(失败也不抛);共享给 persist/rolls 等所有业务模块。
export function toast(msg: string): void {
  try {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:999;'
      + 'max-width:80vw;padding:10px 16px;border-radius:8px;font:13px system-ui,sans-serif;'
      + 'color:#fff;background:#b42318;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  } catch (_) { /* DOM 不可用(如非浏览器环境)时静默 */ }
}

// 台面画布分辨率(4:3),导出尺寸
export const TW = 2000, TH = 1500;

export const bg: HTMLCanvasElement = $<HTMLCanvasElement>('#bg');
export const bctx: CanvasRenderingContext2D = bg.getContext('2d')!;
bg.width = TW; bg.height = TH;

// 观片台屏幕元素(注意:在本项目里遮蔽全局 window.screen)
export const screen: HTMLElement = $('#screen');
export const tray: HTMLElement = $('#tray');

export const ui  = { radius: $<HTMLInputElement>('#radius') };
export const out = { radius: $('#vRadius') };

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
