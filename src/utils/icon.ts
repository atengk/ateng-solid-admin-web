import type { Component } from 'vue';
import type { IconItem, TabMenuIcons } from '@atengk/element-plus';
import * as ElementPlusIcons from '@element-plus/icons-vue';
import { Back, CircleClose, Close, DocumentDelete, Refresh, Right } from '@element-plus/icons-vue';

/**
 * `@atengk/element-plus` AtengIconSelect 内建 DEFAULT_ICONS 名称集合（自动附带中文标签与拼音检索）。
 */
const BUILTIN_ICON_SELECT_NAMES = new Set<string>([
  'Search',
  'Edit',
  'Delete',
  'Plus',
  'Minus',
  'Check',
  'Close',
  'Refresh',
  'Setting',
  'Filter',
  'Download',
  'Upload',
  'Lock',
  'Unlock',
  'Key',
  'View',
  'Hide',
  'CopyDocument',
  'Share',
  'Link',
  'Operation',
  'Tools',
  'HomeFilled',
  'Menu',
  'User',
  'UserFilled',
  'Avatar',
  'Folder',
  'FolderOpened',
  'Document',
  'Tickets',
  'Management',
  'Files',
  'Grid',
  'List',
  'Monitor',
  'DataLine',
  'DataBoard',
  'DataAnalysis',
  'TrendCharts',
  'Cpu',
  'Bell',
  'Message',
  'ChatDotRound',
  'Warning',
  'InfoFilled',
  'SuccessFilled',
  'CircleCheck',
  'CircleClose',
  'QuestionFilled',
  'Star',
  'Calendar',
  'Clock',
  'Timer',
  'Picture',
]);

/**
 * 菜单与页签图标映射表（严禁通过对象原型链索引，避免原型键名误命中）。
 */
const EXACT_ICON_MAP = new Map<string, Component>();
const NORMALIZED_ICON_MAP = new Map<string, Component>();

function normalizeIconKey(raw: string): string {
  return raw.replace(/[-_\s]/g, '').toLowerCase();
}

function isValidIconComponent(candidate: unknown): candidate is Component {
  return (typeof candidate === 'object' && candidate !== null) || typeof candidate === 'function';
}

for (const [key, component] of Object.entries(ElementPlusIcons)) {
  if (key === 'default' || !isValidIconComponent(component)) {
    continue;
  }
  EXACT_ICON_MAP.set(key, component);
  NORMALIZED_ICON_MAP.set(normalizeIconKey(key), component);
}

/**
 * 全量 `@element-plus/icons-vue` 图标元数据集合。
 */
export const ALL_ELEMENT_ICONS: IconItem[] = Array.from(
  EXACT_ICON_MAP.entries(),
  ([name, component]) => ({
    name,
    component,
  }),
);

/**
 * 剔除 `AtengIconSelect` 已内建图标后的扩展 `@element-plus/icons-vue` 集合（避免检索时渲染重复 key）。
 */
export const EXTRA_ELEMENT_ICONS: IconItem[] = ALL_ELEMENT_ICONS.filter(
  item => !BUILTIN_ICON_SELECT_NAMES.has(item.name),
);

/**
 * AtengTabsNav 上下文菜单与快捷操作线性图标映射（替换底层默认表情符号）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const TAB_MENU_ICONS: TabMenuIcons = {
  refresh: Refresh,
  close: Close,
  closeOthers: CircleClose,
  closeLeft: Back,
  closeRight: Right,
  closeAll: DocumentDelete,
};

/**
 * 根据后端菜单配置的图标名解析为 `@element-plus/icons-vue` 线性图标组件。
 *
 * @param name 后端菜单下发的图标名称（支持 PascalCase、kebab-case 或带 `el-icon-` 前缀）
 * @returns 匹配的图标组件；为空或未命中时安全返回 `undefined`
 */
export function resolveMenuIcon(name?: string): Component | undefined {
  if (!name || typeof name !== 'string') {
    return undefined;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return undefined;
  }
  const candidate = trimmed.startsWith('el-icon-') ? trimmed.slice('el-icon-'.length) : trimmed;
  return EXACT_ICON_MAP.get(candidate) ?? NORMALIZED_ICON_MAP.get(normalizeIconKey(candidate));
}
