import { ref } from 'vue';
import { defineStore } from 'pinia';
import { tryOnScopeDispose } from '@atengk/vue';
import {
  initTheme,
  type ActiveTheme,
  type ThemeManager,
  type ThemeMode,
} from '@atengk/element-plus';

/**
 * 本地持久化 UI 偏好存储键常量（严禁存入任何敏感令牌或业务数据）。
 */
export const THEME_MODE_STORAGE_KEY = 'solid-theme-mode';
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'solid-sidebar-collapsed';
export const SHOW_TABS_STORAGE_KEY = 'solid-show-tabs';

let sharedThemeManager: ThemeManager | null = null;

function readBooleanPreference(key: string, defaultValue: boolean): boolean {
  if (typeof localStorage === 'undefined') {
    return defaultValue;
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeBooleanPreference(key: string, value: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 存储空间受限或无权限时静默忽略
  }
}

/**
 * 按全局配置初始化（或复用）ateng-ui 主题控制器。
 * 刻意不传入 themeColor，保留 tokens.css 静态定义 Light/Dark 双主色切换。
 *
 * @returns 主题生命周期控制器实例
 * @author Ateng
 * @since 2026-11-25
 */
export function initAppTheme(): ThemeManager {
  if (!sharedThemeManager) {
    sharedThemeManager = initTheme({
      storageKey: THEME_MODE_STORAGE_KEY,
      defaultMode: 'light',
      listenSystemPreference: true,
    });
  }
  return sharedThemeManager;
}

/**
 * 释放并重置共享主题控制器引用（供 app.dispose 与测试生命周期清理调用）。
 */
export function cleanupAppTheme(): void {
  if (sharedThemeManager) {
    sharedThemeManager.cleanup();
    sharedThemeManager = null;
  }
}

/**
 * 管理后台全局 UI 偏好与布局协调 Pinia Setup Store。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const useAppStore = defineStore('app', () => {
  const manager = initAppTheme();

  const sidebarCollapsed = ref<boolean>(
    readBooleanPreference(SIDEBAR_COLLAPSED_STORAGE_KEY, false),
  );
  const themeMode = ref<ThemeMode>(manager.getMode());
  const activeTheme = ref<ActiveTheme>(manager.getActiveTheme());
  const showTabsBar = ref<boolean>(readBooleanPreference(SHOW_TABS_STORAGE_KEY, true));
  const isMobile = ref<boolean>(false);
  const commandPaletteVisible = ref<boolean>(false);

  let tabsResetHandler: (() => void) | null = null;
  let mediaQueryList: MediaQueryList | null = null;
  let mediaChangeListener: (() => void) | null = null;

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaChangeListener = () => {
      activeTheme.value = initAppTheme().getActiveTheme();
    };
    mediaQueryList.addEventListener('change', mediaChangeListener);
  }

  /**
   * 切换或显式设置侧边栏折叠状态，并持久化至 localStorage。
   *
   * @param val 可选显式布尔值，省略时对当前状态取反
   */
  function toggleSidebar(val?: boolean): void {
    const next = typeof val === 'boolean' ? val : !sidebarCollapsed.value;
    sidebarCollapsed.value = next;
    writeBooleanPreference(SIDEBAR_COLLAPSED_STORAGE_KEY, next);
  }

  /**
   * 切换 Light / Dark / Auto 主题模式并同步更新生效主题计算结果。
   *
   * @param mode 目标主题模式
   */
  function setThemeMode(mode: ThemeMode): void {
    const activeManager = initAppTheme();
    activeManager.setMode(mode);
    themeMode.value = activeManager.getMode();
    activeTheme.value = activeManager.getActiveTheme();
  }

  /**
   * 设置多标签页栏显隐偏好，并持久化至 localStorage。
   *
   * @param val 是否显示多页签栏
   */
  function setShowTabsBar(val: boolean): void {
    showTabsBar.value = val;
    writeBooleanPreference(SHOW_TABS_STORAGE_KEY, val);
  }

  /**
   * 更新当前视口是否处于移动端断点（< 768px）。
   *
   * @param val 是否移动端视口
   */
  function setMobile(val: boolean): void {
    isMobile.value = val;
  }

  /**
   * 切换或显式设置快捷命令搜索面板显隐状态。
   *
   * @param val 可选显式布尔值
   */
  function toggleCommandPalette(val?: boolean): void {
    commandPaletteVisible.value = typeof val === 'boolean' ? val : !commandPaletteVisible.value;
  }

  /**
   * 注册多页签状态机“清理除 affix 外页签”回调（由 AdminLayout 挂载时注入，保持单一数据源）。
   *
   * @param handler 页签重置回调；传 null 解除注册
   */
  function registerTabsResetHandler(handler: (() => void) | null): void {
    tabsResetHandler = handler;
  }

  /**
   * 触发清理除固定工作台之外的全部非固定页签（切租户或会话失效时调用）。
   */
  function resetNonAffixTabs(): void {
    tabsResetHandler?.();
  }

  /**
   * 释放主题监听与系统媒体查询订阅，防止内存泄漏。
   */
  function dispose(): void {
    if (mediaQueryList && mediaChangeListener) {
      mediaQueryList.removeEventListener('change', mediaChangeListener);
      mediaQueryList = null;
      mediaChangeListener = null;
    }
    tabsResetHandler = null;
    cleanupAppTheme();
  }

  tryOnScopeDispose(dispose);

  return {
    sidebarCollapsed,
    themeMode,
    activeTheme,
    showTabsBar,
    isMobile,
    commandPaletteVisible,
    toggleSidebar,
    setThemeMode,
    setShowTabsBar,
    setMobile,
    toggleCommandPalette,
    registerTabsResetHandler,
    resetNonAffixTabs,
    dispose,
  };
});
