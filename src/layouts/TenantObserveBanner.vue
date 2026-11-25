<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ElButton, ElIcon } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';
import { useTenantStore } from '@/stores/tenant';

/**
 * 跨租户观察态 36px 琥珀金全宽通栏警示条（坐落于 AtengTabsNav 与主内容区之间）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'TenantObserveBanner' });

const router = useRouter();
const tenantStore = useTenantStore();

async function handleResetToPlatform(): Promise<void> {
  await tenantStore.resetToPlatform(router);
}
</script>

<template>
  <div
    v-if="tenantStore.isObservingTenant"
    data-testid="tenant-observe-banner"
    role="alert"
    class="solid-observe-banner flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs"
  >
    <div class="flex min-w-0 items-center gap-2">
      <el-icon :size="14" class="shrink-0"><WarningFilled /></el-icon>
      <span class="truncate">
        当前正处于跨租户视角：
        <strong class="font-semibold">{{ tenantStore.activeTenantName }}</strong>
        <span class="ml-1 font-mono-data opacity-85">
          (X-Tenant-Id: {{ tenantStore.activeTenantId }})
        </span>
        ，平台专属菜单已自动隔离隐藏
      </span>
    </div>

    <el-button
      size="small"
      data-testid="tenant-observe-reset-btn"
      :loading="tenantStore.switching"
      @click="handleResetToPlatform"
    >
      返回平台默认租户
    </el-button>
  </div>
</template>

<style scoped>
.solid-observe-banner {
  background-color: var(--solid-warning-soft);
  border-bottom: 1px solid var(--solid-warning-border);
  color: var(--solid-warning);
}
</style>
