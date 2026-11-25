<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElTooltip } from 'element-plus';
import { Delete, Edit, Key } from '@element-plus/icons-vue';
import type { UserVO } from '@/api/system/user';
import {
  RESET_PWD_SUPER_FORBIDDEN_TIP,
  resolveUserRowProtection,
} from '@/views/system/user/userHelper';

/**
 * 用户表格行操作列组件：
 * 收口单行保护计算（超管与当前登录用户自身边界），消除表格模板重复求值与非空断言。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'UserRowActions' });

const props = defineProps<{
  /** 当前列表行用户实体。 */
  row: UserVO;
  /** 当前登录用户主键。 */
  currentUserId?: string;
  /** 是否处于平台租户超管视角（允许修改内置超管基础信息）。 */
  allowPlatformSuperEdit: boolean;
}>();

const emit = defineEmits<{
  /** 触发编辑用户抽屉事件。 */
  (e: 'edit', row: UserVO): void;
  /** 触发重置密码弹窗事件。 */
  (e: 'reset-password', row: UserVO): void;
  /** 触发单个用户删除确认事件。 */
  (e: 'delete', row: UserVO): void;
}>();

const protection = computed(() =>
  resolveUserRowProtection(props.row, props.currentUserId, props.allowPlatformSuperEdit),
);
</script>

<template>
  <div class="inline-flex items-center justify-center gap-1">
    <el-tooltip
      :content="protection.editDisableReason"
      :disabled="protection.canEdit"
      placement="top"
    >
      <span>
        <el-button
          v-permission="'system:user:update'"
          :data-testid="`user-edit-btn-${row.id}`"
          type="primary"
          link
          size="small"
          :disabled="!protection.canEdit"
          :icon="Edit"
          @click="emit('edit', row)"
        >
          编辑
        </el-button>
      </span>
    </el-tooltip>

    <el-tooltip
      :content="RESET_PWD_SUPER_FORBIDDEN_TIP"
      :disabled="protection.canResetPassword"
      placement="top"
    >
      <span>
        <el-button
          v-permission="'system:user:update'"
          :data-testid="`user-reset-pwd-btn-${row.id}`"
          type="primary"
          link
          size="small"
          :disabled="!protection.canResetPassword"
          :icon="Key"
          @click="emit('reset-password', row)"
        >
          重置密码
        </el-button>
      </span>
    </el-tooltip>

    <el-tooltip
      :content="protection.disableReason"
      :disabled="protection.mutableStatusOrDelete"
      placement="top"
    >
      <span>
        <el-button
          v-permission="'system:user:delete'"
          :data-testid="`user-delete-btn-${row.id}`"
          type="danger"
          link
          size="small"
          :disabled="!protection.mutableStatusOrDelete"
          :icon="Delete"
          @click="emit('delete', row)"
        >
          删除
        </el-button>
      </span>
    </el-tooltip>
  </div>
</template>

<style scoped></style>
