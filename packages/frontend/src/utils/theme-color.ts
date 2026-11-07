const DEFAULT_BACKGROUND_COLOR = '#fff';

/**
 * 更新浏览器 / PWA 状态栏的主题色。
 *
 * iOS 18 及以前的主屏 Web App 通过 `<meta name="theme-color">` 决定状态栏底色，
 * iOS 26 起改为读取页面背景色（`body` 的 `background-color`）。
 * 因此两处需要一起更新，状态栏才能跟随当前页面一起变黑。
 */
export function setThemeColor(color: string) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document.body.style.backgroundColor = color;
}

/** 恢复到应用默认的浅色背景。 */
export function resetThemeColor() {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', DEFAULT_BACKGROUND_COLOR);
  document.body.style.backgroundColor = '';
}
