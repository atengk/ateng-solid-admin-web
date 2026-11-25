<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElAlert, ElButton, ElTag } from 'element-plus';
import { AtengDialog } from '@atengk/element-plus';
import type { TenantPackageShrinkPreviewVO } from '@/api/system/tenant-package';

/**
 * 租户套餐菜单缩减影响范围二次确认弹窗（520px）：
 * 在执行破坏性跨租户 sys_role_menu 裁剪前明示被移除菜单标题与受影响关联租户清单。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'PackageShrinkConfirmDialog' });

const MAX_COLLAPSED_TITLES = 6;

const props = defineProps<{
  /** 弹窗显示状态（v-model）。 */
  modelValue: boolean;
  /** 后端返回的缩减影响范围预览数据。 */
  preview: TenantPackageShrinkPreviewVO | null;
  /** 用户确认后执行的异步保存裁剪动作（返回 true 关闭弹窗）。 */
  confirmAction: () => Promise<boolean>;
}>();

const emit = defineEmits<{
  /** 弹窗显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 用户取消缩减保存事件。 */
  (e: 'cancel'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const showAllRemoved = ref<boolean>(false);

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      showAllRemoved.value = false;
    }
  },
);

const visibleRemovedTitles = computed<string[]>(() => {
  const all = props.preview?.removedMenuTitles ?? [];
  if (showAllRemoved.value || all.length <= MAX_COLLAPSED_TITLES) {
    return all;
  }
  return all.slice(0, MAX_COLLAPSED_TITLES);
});

const hiddenRemovedCount = computed<number>(() => {
  const total = props.preview?.removedMenuTitles.length ?? 0;
  return total > MAX_COLLAPSED_TITLES ? total - MAX_COLLAPSED_TITLES : 0;
});
</script>

<template>
  <AtengDialog
    v-model="visible"
    title="套餐权限缩减影响确认"
    width="520px"
    confirm-text="确认缩减并裁剪权限"
    cancel-text="取消"
    :before-confirm="confirmAction"
    @cancel="emit('cancel')"
  >
    <div v-if="preview" data-testid="pkg-shrink-confirm-dialog" class="flex flex-col gap-3">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="`本次移除了 ${preview.removedMenuTitles.length} 项菜单，将同步裁剪 ${preview.affectedTenantCount} 个关联租户下全部角色的越界权限`"
      />

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs font-medium text-ink-secondary">
          <span>被移除的菜单与权限节点</span>
          <el-button
            v-if="hiddenRemovedCount > 0"
            type="primary"
            link
            size="small"
            @click="showAllRemoved = !showAllRemoved"
          >
            {{ showAllRemoved ? '收起' : `展开其余 ${hiddenRemovedCount} 项` }}
          </el-button>
        </div>
        <div
          class="flex flex-wrap gap-1.5 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-2.5"
        >
          <el-tag
            v-for="(title, index) in visibleRemovedTitles"
            :key="`${title}-${index}`"
            size="small"
            type="danger"
          >
            {{ title }}
          </el-tag>
          <el-tag
            v-if="!showAllRemoved && hiddenRemovedCount > 0"
            size="small"
            type="info"
          >
            +{{ hiddenRemovedCount }} 项
          </el-tag>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-ink-secondary">
          受影响的关联租户（共 <span class="tabular-nums">{{ preview.affectedTenantCount }}</span> 个）
        </span>
        <div
          class="flex max-h-[160px] flex-wrap gap-1.5 overflow-y-auto rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-2.5"
        >
          <el-tag
            v-for="tenant in preview.affectedTenants"
            :key="tenant.id"
            size="small"
            type="warning"
          >
            {{ tenant.tenantName }}
            <span class="font-mono-data">({{ tenant.tenantCode }})</span>
          </el-tag>
        </div>
      </div>

      <p class="m-0 text-xs text-ink-secondary">
        保存后将在事务内同步裁剪上述租户下全部角色的越界菜单权限，并立即刷新相关租户权限缓存，确认继续保存？
      </p>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
