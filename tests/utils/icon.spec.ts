import { describe, expect, it } from 'vitest';
import { Refresh, Setting, UserFilled } from '@element-plus/icons-vue';
import {
  ALL_ELEMENT_ICONS,
  EXTRA_ELEMENT_ICONS,
  resolveMenuIcon,
  TAB_MENU_ICONS,
} from '@/utils/icon';

/**
 * 菜单与页签图标映射工具单元测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */
describe('icon utility', () => {
  it('resolves valid Element Plus icon names and kebab-case variants safely', () => {
    expect(resolveMenuIcon('Setting')).toBe(Setting);
    expect(resolveMenuIcon('  UserFilled  ')).toBe(UserFilled);
    expect(resolveMenuIcon('user-filled')).toBe(UserFilled);
    expect(resolveMenuIcon('el-icon-refresh')).toBe(Refresh);
  });

  it('returns undefined safely for blank, unknown, or prototype-chain keys', () => {
    expect(resolveMenuIcon(undefined)).toBeUndefined();
    expect(resolveMenuIcon('')).toBeUndefined();
    expect(resolveMenuIcon('   ')).toBeUndefined();
    expect(resolveMenuIcon('NonExistentIconXyz')).toBeUndefined();
    expect(resolveMenuIcon('toString')).toBeUndefined();
    expect(resolveMenuIcon('constructor')).toBeUndefined();
  });

  it('exposes linear icon components for all AtengTabsNav context menu commands', () => {
    const commands = [
      'refresh',
      'close',
      'closeOthers',
      'closeLeft',
      'closeRight',
      'closeAll',
    ] as const;
    for (const cmd of commands) {
      const icon = TAB_MENU_ICONS[cmd];
      expect(icon).toBeDefined();
      expect(typeof icon).not.toBe('string');
      expect(icon).not.toBe(false);
    }
  });

  it('exports full and deduplicated Element Plus icon collections without overlapping builtin names', () => {
    expect(ALL_ELEMENT_ICONS.length).toBeGreaterThan(200);
    expect(EXTRA_ELEMENT_ICONS.length).toBeGreaterThan(150);
    expect(EXTRA_ELEMENT_ICONS.length).toBeLessThan(ALL_ELEMENT_ICONS.length);
    expect(ALL_ELEMENT_ICONS.some(item => item.name === 'Setting')).toBe(true);
    expect(EXTRA_ELEMENT_ICONS.some(item => item.name === 'Setting')).toBe(false);
    expect(EXTRA_ELEMENT_ICONS.some(item => item.name === 'OfficeBuilding')).toBe(true);
  });
});
