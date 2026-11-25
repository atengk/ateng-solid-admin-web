<script setup lang="ts">
import { computed } from 'vue';
import { ElAlert, ElButton, ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';
import { AtengDialog } from '@atengk/element-plus';
import type { CreateTenantVO } from '@/api/system/tenant';
import { buildTenantInitCopyText } from '@/views/system/tenant/tenantHelper';

/**
 * 新建租户 4 步原子初始化完成后的登录指引凭据一次性回显弹窗（500px）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'TenantInitCredentialDialog' });

const props = defineProps<{
  /**
   * 弹窗显示状态（v-model）。
   */
  modelValue: boolean;
  /**
   * 后端返回的租户初始化凭据摘要。
   */
  credential: CreateTenantVO | null;
}>();

const emit = defineEmits<{
  /**
   * 弹窗显示状态更新事件。
   */
  (e: 'update:modelValue', value: boolean): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

async function handleCopyCredential(): Promise<void> {
  if (!props.credential) {
    return;
  }
  const text = buildTenantInitCopyText(props.credential);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ElMessage.success('已复制租户初始化登录信息');
      return;
    }
    ElMessage.warning('当前环境不支持自动剪贴板写入，请手动复制上方编码与账号');
  } catch {
    ElMessage.warning('剪贴板写入被拒绝，请手动复制上方编码与账号');
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    title="租户初始化完成"
    width="480px"
    :show-cancel="false"
    confirm-text="完成"
  >
    <div v-if="credential" data-testid="tenant-init-credential-dialog" class="flex flex-col gap-3">
      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="已完成顶级部门、内置角色 tenant_admin 及默认管理员初始化"
      />

      <div
        class="flex flex-col gap-2 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-3 text-[13px]"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-ink-secondary">租户 ID</span>
          <span class="font-mono-data text-ink">{{ credential.tenantId }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-ink-secondary">租户名称</span>
          <span class="font-medium text-ink">{{ credential.tenantName }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-ink-secondary">登录租户编码</span>
          <span class="font-mono-data font-semibold text-brand">{{ credential.tenantCode }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-ink-secondary">租户管理员账号</span>
          <span class="font-mono-data font-semibold text-ink">{{ credential.adminUsername }}</span>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2">
        <p class="m-0 text-xs text-ink-secondary">
          初始密码按您刚才设置的值生效，该管理员首次登录工作台将提示修改初始密码。
        </p>
        <el-button
          data-testid="tenant-init-copy-btn"
          type="primary"
          plain
          size="small"
          :icon="CopyDocument"
          @click="handleCopyCredential"
        >
          一键复制登录信息
        </el-button>
      </div>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
