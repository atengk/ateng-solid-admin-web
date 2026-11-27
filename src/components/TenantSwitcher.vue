<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElIcon, ElInput, ElMessage, ElPopover, type PopoverInstance } from 'element-plus';
import { ArrowDown, Check, OfficeBuilding, Search } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import { DEFAULT_PLATFORM_TENANT_NAME } from '@/layouts/layoutHelper';
import { DEFAULT_TENANT_ID } from '@/utils/http';

/**
 * 顶栏租户切换与租户归属展示组件（超管可检索切换，普通租户仅只读展示，单租户关闭时整体不渲染）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'TenantSwitcher' });

interface TenantCandidateItem {
  id: string;
  tenantName: string;
  tenantCode?: string;
}

const router = useRouter();
const authStore = useAuthStore();
const tenantStore = useTenantStore();

const popoverRef = ref<PopoverInstance>();
const popoverVisible = ref<boolean>(false);
const keyword = ref<string>('');
const loadingOptions = ref<boolean>(false);

const candidateTenants = computed<TenantCandidateItem[]>(() => {
  const list: TenantCandidateItem[] = [
    {
      id: DEFAULT_TENANT_ID,
      tenantName: DEFAULT_PLATFORM_TENANT_NAME,
      tenantCode: '000000',
    },
    ...tenantStore.tenantOptions.filter(option => option.id !== DEFAULT_TENANT_ID),
  ];

  const normalized = keyword.value.trim().toLowerCase();
  if (!normalized) {
    return list;
  }

  return list.filter(
    item =>
      item.tenantName.toLowerCase().includes(normalized) ||
      item.id.toLowerCase().includes(normalized) ||
      (item.tenantCode?.toLowerCase().includes(normalized) ?? false),
  );
});

async function ensureTenantOptionsLoaded(): Promise<void> {
  if (!tenantStore.isSuperAdminTenantSwitchAllowed || loadingOptions.value) {
    return;
  }
  loadingOptions.value = true;
  try {
    await tenantStore.loadTenantOptions();
  } catch (error) {
    console.warn('[TenantSwitcher] 加载可切换租户列表失败，已保留当前默认选项', error);
  } finally {
    loadingOptions.value = false;
  }
}

onMounted(() => {
  if (tenantStore.isSuperAdminTenantSwitchAllowed && tenantStore.tenantOptions.length === 0) {
    void ensureTenantOptionsLoaded();
  }
});

watch(popoverVisible, opened => {
  if (opened) {
    keyword.value = '';
    // 每次打开切换浮层均静默刷新可切换租户列表，确保新建/改名/停删租户即时同步
    void ensureTenantOptionsLoaded();
  }
});

async function handleSelectTenant(targetTenantId: string): Promise<void> {
  popoverVisible.value = false;
  if (targetTenantId === tenantStore.activeTenantId || tenantStore.switching) {
    popoverRef.value?.hide();
    return;
  }
  popoverRef.value?.hide();
  const switched = await tenantStore.switchTenant(targetTenantId, router);
  if (switched) {
    ElMessage.success(`已切换工作租户为 ${tenantStore.activeTenantName}`);
  }
}
</script>

<template>
  <template v-if="authStore.tenantEnabled">
    <el-popover
      v-if="tenantStore.isSuperAdminTenantSwitchAllowed"
      ref="popoverRef"
      v-model:visible="popoverVisible"
      trigger="click"
      placement="bottom-end"
      :width="260"
      :teleported="false"
    >
      <template #reference>
        <button
          type="button"
          data-testid="tenant-switch-trigger"
          :disabled="tenantStore.switching"
          :class="[
            'inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[var(--solid-radius-md)] border px-2.5 text-xs transition-colors',
            tenantStore.isObservingTenant
              ? 'solid-tenant-pill--observing font-semibold'
              : 'border-border bg-surface-subtle text-ink hover:border-primary',
          ]"
        >
          <el-icon :size="13"><OfficeBuilding /></el-icon>
          <span class="max-w-[120px] truncate">{{ tenantStore.activeTenantName }}</span>
          <span class="font-mono-data text-[11px] opacity-75">
            ({{ tenantStore.activeTenantId }})
          </span>
          <el-icon :size="11" class="opacity-70"><ArrowDown /></el-icon>
        </button>
      </template>

      <div class="flex flex-col gap-2">
        <el-input
          v-model="keyword"
          size="small"
          clearable
          placeholder="搜索租户名称或编码"
          :prefix-icon="Search"
        />

        <div class="max-h-56 overflow-y-auto">
          <div v-if="candidateTenants.length === 0" class="py-3 text-center text-xs text-ink-muted">
            {{ loadingOptions ? '正在加载租户...' : '无匹配租户' }}
          </div>

          <button
            v-for="item in candidateTenants"
            :key="item.id"
            type="button"
            :data-testid="`tenant-option-${item.id}`"
            class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--solid-radius-sm)] border-none bg-transparent px-2.5 py-1.5 text-left text-[13px] text-ink-regular transition-colors hover:bg-surface-subtle hover:text-ink"
            @click="handleSelectTenant(item.id)"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-medium">{{ item.tenantName }}</span>
              <span class="font-mono-data text-[11px] text-ink-muted">{{ item.id }}</span>
            </span>
            <el-icon
              v-if="item.id === tenantStore.activeTenantId"
              :size="14"
              class="shrink-0 text-primary"
            >
              <Check />
            </el-icon>
          </button>
        </div>
      </div>
    </el-popover>

    <span
      v-else
      data-testid="tenant-readonly-capsule"
      aria-readonly="true"
      class="inline-flex h-[30px] items-center gap-1.5 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-2.5 text-xs text-ink-regular select-none"
    >
      <el-icon :size="13"><OfficeBuilding /></el-icon>
      <span class="max-w-[140px] truncate">{{ tenantStore.activeTenantName }}</span>
    </span>
  </template>
</template>

<style scoped>
.solid-tenant-pill--observing {
  background-color: var(--solid-warning-soft);
  border-color: var(--solid-warning-border);
  color: var(--solid-warning);
}
</style>
