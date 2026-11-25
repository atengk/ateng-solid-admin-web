<script setup lang="ts">
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import { Moon, Sunny } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';

/**
 * 顶栏明暗主题快速切换按钮（联动 useAppStore().setThemeMode 与 Precision Slate & Cobalt 双态令牌）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'ThemeToggle' });

const appStore = useAppStore();

const isDark = computed<boolean>(() => appStore.activeTheme === 'dark');
const actionLabel = computed<string>(() => (isDark.value ? '切换至浅色模式' : '切换至深色模式'));

function handleToggleTheme(): void {
  appStore.setThemeMode(isDark.value ? 'light' : 'dark');
}
</script>

<template>
  <button
    type="button"
    data-testid="theme-toggle-btn"
    :aria-label="actionLabel"
    :title="actionLabel"
    class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--solid-radius-md)] border border-transparent bg-transparent text-ink-regular transition-colors hover:bg-surface-subtle hover:text-ink"
    @click="handleToggleTheme"
  >
    <el-icon :size="16">
      <Sunny v-if="isDark" />
      <Moon v-else />
    </el-icon>
  </button>
</template>

<style scoped></style>
