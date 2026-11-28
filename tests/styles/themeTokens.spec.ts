import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 全局样式架构红线、Light/Dark 轻量薄滚动条及暗黑禁用态语义色阶 WCAG 2.1 对比度校验 (#73)。
 *
 * @author Ateng
 * @since 2026-11-28
 */

const ADMIN_WEB_ROOT = resolve(__dirname, '../..');
const MAIN_CSS_PATH = resolve(ADMIN_WEB_ROOT, 'src/styles/main.css');
const TOKENS_CSS_PATH = resolve(ADMIN_WEB_ROOT, 'src/styles/tokens.css');

function parseCssCustomProps(blockBody: string): Record<string, string> {
  const withoutComments = blockBody.replace(/\/\*[\s\S]*?\*\//g, '');
  const props: Record<string, string> = {};
  const declRegex = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = declRegex.exec(withoutComments)) !== null) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) {
      props[key] = value;
    }
  }
  return props;
}

function extractCssBlock(css: string, selectorPattern: RegExp): string {
  const match = css.match(selectorPattern);
  if (!match?.[1]) {
    throw new Error(`未在 tokens.css 找到目标样式块: ${selectorPattern}`);
  }
  return match[1];
}

function resolveHexVar(vars: Record<string, string>, varName: string, depth = 0): string {
  if (depth > 8) {
    throw new Error(`CSS 变量存在循环引用: ${varName}`);
  }
  const raw = vars[varName];
  if (!raw) {
    throw new Error(`缺少暗黑模式 CSS 变量定义: ${varName}`);
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const varRef = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i)?.[1];
  if (varRef) {
    return resolveHexVar(vars, varRef, depth + 1);
  }
  throw new Error(`变量 ${varName} 解析值不是 6 位十六进制色值: ${raw}`);
}

function computeRelativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => {
    const linear = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return linear <= 0.03928 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function computeContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = computeRelativeLuminance(fgHex);
  const l2 = computeRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme Tokens & Global Thin Scrollbar Styles (#73)', () => {
  it('preserves strict 6-import order in main.css without Preflight, theme-pro.css, or !important', () => {
    const mainCss = readFileSync(MAIN_CSS_PATH, 'utf8');
    const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf8');

    const imports = Array.from(mainCss.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)).map(m => m[1]);
    expect(imports).toEqual([
      'element-plus/dist/index.css',
      'element-plus/theme-chalk/dark/css-vars.css',
      '@atengk/element-plus/style.css',
      './tokens.css',
      'tailwindcss/theme.css',
      'tailwindcss/utilities.css',
    ]);

    const activeMainCss = mainCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const activeTokensCss = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(activeMainCss).not.toMatch(
      /theme-pro\.css|tailwindcss\/preflight|@import\s+['"]tailwindcss['"]/,
    );
    expect(activeMainCss).not.toContain('!important');
    expect(activeTokensCss).not.toContain('!important');
  });

  it('defines light and dark scrollbar semantic tokens and lightweight global thin scrollbar rules', () => {
    const mainCss = readFileSync(MAIN_CSS_PATH, 'utf8');
    const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf8');

    const lightProps = parseCssCustomProps(
      extractCssBlock(tokensCss, /^:root\s*\{([\s\S]*?)\n\}/m),
    );
    const darkProps = parseCssCustomProps(
      extractCssBlock(tokensCss, /^html\.dark\s*\{([\s\S]*?)\n\}/m),
    );

    expect(lightProps['--solid-scrollbar-size']).toBe('6px');
    expect(lightProps['--solid-scrollbar-track']).toBe('transparent');
    expect(lightProps['--solid-scrollbar-thumb']).toBeDefined();
    expect(lightProps['--solid-scrollbar-thumb-hover']).toBeDefined();

    expect(darkProps['--solid-scrollbar-track']).toBe('transparent');
    expect(darkProps['--solid-scrollbar-thumb']).toBeDefined();
    expect(darkProps['--solid-scrollbar-thumb-hover']).toBeDefined();

    expect(mainCss).toContain('@supports not selector(::-webkit-scrollbar)');
    expect(mainCss).toContain('scrollbar-width: thin;');
    expect(mainCss).toContain(
      'scrollbar-color: var(--solid-scrollbar-thumb) var(--solid-scrollbar-track);',
    );
    expect(mainCss).toMatch(
      /::-webkit-scrollbar\s*\{[\s\S]*?width:\s*var\(--solid-scrollbar-size\);/,
    );
    expect(mainCss).toMatch(
      /::-webkit-scrollbar-track\s*\{[\s\S]*?background:\s*var\(--solid-scrollbar-track\);/,
    );
    expect(mainCss).toMatch(
      /::-webkit-scrollbar-thumb\s*\{[\s\S]*?background-color:\s*var\(--solid-scrollbar-thumb\);/,
    );
    expect(mainCss).toMatch(
      /::-webkit-scrollbar-thumb:hover\s*\{[\s\S]*?background-color:\s*var\(--solid-scrollbar-thumb-hover\);/,
    );
    expect(mainCss).toMatch(/::-webkit-scrollbar-corner\s*\{[\s\S]*?background:\s*transparent;/);
  });

  it('defines complete dark semantic light/dark scales and meets WCAG AA (>= 4.5:1) for disabled danger/error/success/warning/info buttons', () => {
    const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf8');
    const darkBlock = extractCssBlock(tokensCss, /^html\.dark\s*\{([\s\S]*?)\n\}/m);
    const sharedBlock = extractCssBlock(tokensCss, /^:root,\s*\r?\nhtml\.dark\s*\{([\s\S]*?)\n\}/m);

    const darkVars: Record<string, string> = {
      ...parseCssCustomProps(darkBlock),
      ...parseCssCustomProps(sharedBlock),
    };

    const surfaceBg = resolveHexVar(darkVars, '--solid-bg-surface');
    const elevatedBg = resolveHexVar(darkVars, '--solid-bg-elevated');
    expect(surfaceBg).toBe('#111827');
    expect(elevatedBg).toBe('#182234');

    const semanticTypes = ['danger', 'error', 'success', 'warning', 'info'] as const;
    const scaleSuffixes = [
      'dark-2',
      'light-3',
      'light-5',
      'light-7',
      'light-8',
      'light-9',
    ] as const;

    for (const type of semanticTypes) {
      for (const suffix of scaleSuffixes) {
        const key = `--el-color-${type}-${suffix}`;
        expect(darkVars[key]).toBeDefined();
        resolveHexVar(darkVars, key);
      }

      const baseFg = resolveHexVar(darkVars, `--el-color-${type}`);
      const disabledFg = resolveHexVar(darkVars, `--el-color-${type}-light-5`);
      const disabledPlainBg = resolveHexVar(darkVars, `--el-color-${type}-light-9`);

      // plain disabled：--el-color-<type>-light-5 前景 vs --el-color-<type>-light-9 背景 >= 4.5:1
      expect(computeContrastRatio(disabledFg, disabledPlainBg)).toBeGreaterThanOrEqual(4.5);
      // link disabled：--el-color-<type>-light-5 前景 vs 深色表面 #111827 与浮层 #182234 均 >= 4.5:1
      expect(computeContrastRatio(disabledFg, surfaceBg)).toBeGreaterThanOrEqual(4.5);
      expect(computeContrastRatio(disabledFg, elevatedBg)).toBeGreaterThanOrEqual(4.5);
      // 常规 plain / tag：主语义色 vs --el-color-<type>-light-9 背景 >= 4.5:1
      expect(computeContrastRatio(baseFg, disabledPlainBg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
