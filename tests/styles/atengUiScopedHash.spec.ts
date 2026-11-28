import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 校验 @atengk/element-plus 构建产物 JS 与 CSS 的 Vue SFC Scoped Hash 集合一致性，防止 Yalc 联调静默漂移 (#77)。
 *
 * @author Ateng
 * @since 2026-11-28
 */

const ADMIN_WEB_ROOT = resolve(__dirname, '../..');
const SCOPED_HASH_PATTERN = /data-v-[0-9a-f]{8}/g;
const TABLE_TOOLBAR_SELECTOR_PATTERN = /\.at-table__toolbar\[(data-v-[0-9a-f]{8})\]/g;

function extractScopedHashes(content: string): string[] {
  return Array.from(new Set(content.match(SCOPED_HASH_PATTERN) ?? [])).sort();
}

function resolveInstalledDistDir(): string {
  const requireFromHere = createRequire(import.meta.url);
  const styleEntry = requireFromHere.resolve('@atengk/element-plus/style.css');
  return dirname(styleEntry);
}

function assertDistScopedHashConsistency(distDir: string, label: string): {
  jsHashes: string[];
  cssHashes: string[];
} {
  const jsPath = resolve(distDir, 'index.js');
  const cssPath = resolve(distDir, 'index.css');
  expect(existsSync(jsPath), `${label} 缺少 dist/index.js`).toBe(true);
  expect(existsSync(cssPath), `${label} 缺少 dist/index.css`).toBe(true);

  const jsContent = readFileSync(jsPath, 'utf8');
  const cssContent = readFileSync(cssPath, 'utf8');
  const jsHashes = extractScopedHashes(jsContent);
  const cssHashes = extractScopedHashes(cssContent);

  expect(jsHashes.length, `${label} dist/index.js 未提取到任何 data-v-* hash`).toBeGreaterThan(0);
  expect(cssHashes.length, `${label} dist/index.css 未提取到任何 data-v-* hash`).toBeGreaterThan(0);

  const cssSet = new Set(cssHashes);
  const jsSet = new Set(jsHashes);
  const missingInCss = jsHashes.filter(hash => !cssSet.has(hash));
  const missingInJs = cssHashes.filter(hash => !jsSet.has(hash));

  expect(missingInCss, `${label} 仅存在于 JS 的孤立 scoped hash`).toEqual([]);
  expect(missingInJs, `${label} 仅存在于 CSS 的过期 scoped hash`).toEqual([]);

  const toolbarMatches = Array.from(cssContent.matchAll(TABLE_TOOLBAR_SELECTOR_PATTERN));
  expect(toolbarMatches.length, `${label} dist/index.css 缺少 .at-table__toolbar[data-v-*] 规则`).toBeGreaterThan(0);
  for (const match of toolbarMatches) {
    const toolbarHash = match[1];
    expect(toolbarHash, `${label} .at-table__toolbar scoped hash 未匹配`).toBeDefined();
    expect(jsSet.has(toolbarHash!), `${label} .at-table__toolbar hash ${toolbarHash} 不在 JS 集合中`).toBe(true);
  }

  return { jsHashes, cssHashes };
}

describe('@atengk/element-plus scoped hash consistency (#77)', () => {
  it('matches all data-v-* scoped hashes between dist/index.js and dist/index.css', () => {
    const installedDistDir = resolveInstalledDistDir();
    const installedResult = assertDistScopedHashConsistency(installedDistDir, 'node_modules');

    const yalcDistDir = resolve(ADMIN_WEB_ROOT, '.yalc/@atengk/element-plus/dist');
    if (existsSync(resolve(yalcDistDir, 'index.js')) && existsSync(resolve(yalcDistDir, 'index.css'))) {
      const yalcResult = assertDistScopedHashConsistency(yalcDistDir, '.yalc');
      expect(yalcResult.jsHashes).toEqual(installedResult.jsHashes);
      expect(yalcResult.cssHashes).toEqual(installedResult.cssHashes);
    }
  });
});
