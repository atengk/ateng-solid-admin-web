<script setup lang="ts">
import { DEFAULT_TENANT_ID } from '@/utils/http';

/**
 * 登录页左侧深岩品牌面板组件（>= 960px 展示）：
 * 呈现框架定位、核心安全基线特性以及当前运行时租户模式标识。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'LoginBrandPanel' });

interface Props {
  /** 是否开启多租户模式 */
  tenantEnabled: boolean;
}

defineProps<Props>();

const KERNEL_BASELINES = [
  '支持单租户零侵入默认态（000000）与多租户运行时隔离切换',
  '前哨一次一密图形验证码、账号/IP 双维度防爆破锁定倒计时',
  'RBAC 细粒度动态菜单路由、5 级数据权限与操作/登录双审计',
];
</script>

<template>
  <aside
    class="solid-login-aside hidden flex-col justify-between gap-6 border-r border-border px-8 py-9 min-[960px]:flex"
  >
    <div>
      <div class="flex items-center gap-2.5">
        <span
          class="solid-brand-badge inline-flex h-8 w-8 items-center justify-center rounded-[var(--solid-radius-md)] bg-primary text-sm font-bold"
        >
          S
        </span>
        <span class="text-[15px] font-semibold tracking-tight">ateng-solid</span>
      </div>

      <h2 class="mt-6 mb-2 text-xl font-semibold">企业级多租户管理后台核心框架</h2>
      <p class="solid-login-aside-sub m-0 text-[13px] leading-relaxed">
        基于统一认证、可开关 SaaS 多租户隔离与严格前后端契约校验构筑的标准工程管理底座。
      </p>

      <ul class="mt-6 flex list-none flex-col gap-3 p-0">
        <li
          v-for="item in KERNEL_BASELINES"
          :key="item"
          class="solid-login-spec-item flex items-start gap-2.5 rounded-[var(--solid-radius-md)] px-3 py-2.5 text-[13px] leading-snug"
        >
          <span class="solid-login-spec-dot mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </div>

    <div class="solid-login-aside-foot flex items-center justify-between pt-3.5 text-xs">
      <span class="font-mono-data">v0.1.0</span>
      <span>
        {{ tenantEnabled ? 'SaaS 多租户模式已开启' : `单租户默认态 (${DEFAULT_TENANT_ID})` }}
      </span>
    </div>
  </aside>
</template>

<style scoped>
.solid-brand-badge {
  color: var(--solid-brand-panel-on-primary);
}

.solid-login-aside {
  background-color: var(--solid-brand-panel-bg);
  color: var(--solid-brand-panel-text);
}

.solid-login-aside-sub {
  color: var(--solid-brand-panel-text-secondary);
}

.solid-login-spec-item {
  background-color: var(--solid-brand-panel-card);
  border: 1px solid var(--solid-brand-panel-border);
  color: var(--solid-brand-panel-text);
}

.solid-login-spec-dot {
  background-color: var(--solid-brand-panel-dot);
}

.solid-login-aside-foot {
  border-top: 1px solid var(--solid-brand-panel-border);
  color: var(--solid-brand-panel-text-muted);
}
</style>
