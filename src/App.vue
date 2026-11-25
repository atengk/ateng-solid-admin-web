<script setup lang="ts">
import { ElConfigProvider } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs';

/**
 * 管理后台根组件：统一挂载 Element Plus 中文语言配置与顶层路由视图容器。
 *
 * @author Ateng
 * @since 2026-11-19
 */
</script>

<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<style scoped></style>
