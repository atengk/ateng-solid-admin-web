<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ElAvatar,
  ElButton,
  ElIcon,
  ElMessage,
  ElSkeleton,
  ElTabPane,
  ElTabs,
  ElTag,
  type UploadRequestOptions,
} from 'element-plus';
import { Loading, RefreshRight, Upload, Warning } from '@element-plus/icons-vue';
import { AtengDescriptions, AtengDescriptionsItem, AtengUpload } from '@atengk/element-plus';
import { getPersonalProfile, uploadProfileAvatar, type PersonalProfileVO } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { withDictPreload } from '@/utils/dict';
import { resolveContextualErrorMessage } from '@/utils/http';
import ProfileBasicForm from '@/views/profile/components/ProfileBasicForm.vue';
import ProfilePasswordForm from '@/views/profile/components/ProfilePasswordForm.vue';

/**
 * 个人中心双栏视图（/profile）：
 * 左栏消费 AtengDescriptions 渲染脱敏信息与真明文复制，并集成 AtengUpload 直传本人头像；
 * 右栏分设内存真明文基本资料维护与强制重登改密页签。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'Profile' });

type ProfileTabKey = 'basic' | 'password';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_ACCEPT = '.jpg,.jpeg,.png,.webp';
const AVATAR_LIMIT_HINT = '仅支持 JPG、PNG、WEBP 格式且大小不超过 2MB 的图片';
const SKELETON_DELAY_MS = 120;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const profile = ref<PersonalProfileVO | null>(null);
const loading = ref<boolean>(false);
const initialLoadDone = ref<boolean>(false);
const showSkeleton = ref<boolean>(false);
const profileError = ref<string>('');
const avatarUploading = ref<boolean>(false);
const avatarFailed = ref<boolean>(false);
const avatarError = ref<string>('');
const activeTab = ref<ProfileTabKey>('basic');
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

const isInitialLoading = computed<boolean>(
  () => profile.value === null && (!initialLoadDone.value || loading.value),
);

function clearSkeletonTimer(): void {
  if (skeletonTimer !== null) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }
}

watch(
  () => route.query.tab,
  rawTab => {
    activeTab.value = rawTab === 'password' ? 'password' : 'basic';
  },
  { immediate: true },
);

function handleInnerTabChange(tabName: string | number): void {
  const normalized: ProfileTabKey = tabName === 'password' ? 'password' : 'basic';
  const currentQueryTab: ProfileTabKey = route.query.tab === 'password' ? 'password' : 'basic';
  if (normalized === currentQueryTab) {
    return;
  }
  const nextQuery = { ...route.query };
  if (normalized === 'password') {
    nextQuery.tab = 'password';
  } else {
    delete nextQuery.tab;
  }
  void router.replace({ path: route.path, query: nextQuery });
}

const displayName = computed<string>(
  () => profile.value?.nickname || authStore.user?.nickname || profile.value?.username || '管理员',
);

const avatarInitial = computed<string>(() => displayName.value.slice(0, 1).toUpperCase() || '管');

const resolvedAvatarSrc = computed<string | undefined>(() => {
  if (avatarFailed.value) {
    return undefined;
  }
  const url = profile.value?.avatar ?? authStore.user?.avatar;
  return url && url.trim() ? url : undefined;
});

const overviewData = computed(() => {
  const current = profile.value;
  if (!current) {
    return {
      tenantDisplay: '--',
      deptDisplay: '--',
      postDisplay: '--',
      phone: '',
      email: '',
      createTime: '--',
      lastLoginDisplay: '--',
    };
  }
  const tenantDisplay = authStore.tenantEnabled
    ? `${current.tenantName} (${current.tenantId})`
    : '平台默认租户';
  const lastLoginDisplay =
    current.loginIp || current.loginDate
      ? `${current.loginIp || '--'} · ${current.loginDate || '--'}`
      : '首次登录管理台';

  return {
    tenantDisplay,
    deptDisplay: current.deptName?.trim() || '--',
    postDisplay: current.postNames.length > 0 ? current.postNames.join(' / ') : '--',
    phone: current.phone ?? '',
    email: current.email ?? '',
    createTime: current.createTime || '--',
    lastLoginDisplay,
  };
});

async function loadProfile(): Promise<void> {
  if (loading.value) {
    return;
  }
  loading.value = true;
  profileError.value = '';
  clearSkeletonTimer();
  if (profile.value === null) {
    skeletonTimer = setTimeout(() => {
      if (loading.value && profile.value === null) {
        showSkeleton.value = true;
      }
    }, SKELETON_DELAY_MS);
  }
  try {
    const loaded = await withDictPreload(['sys_user_gender'], () => getPersonalProfile());
    profile.value = loaded;
    avatarFailed.value = false;
    authStore.updateUserSummary({
      nickname: loaded.nickname,
      avatar: loaded.avatar ?? null,
    });
  } catch (error) {
    profileError.value = resolveContextualErrorMessage(
      error,
      '获取个人资料失败，请检查网络连接后重试',
    );
  } finally {
    initialLoadDone.value = true;
    clearSkeletonTimer();
    showSkeleton.value = false;
    loading.value = false;
  }
}

function handleAvatarLoadError(): boolean {
  avatarFailed.value = true;
  return true;
}

function handleAvatarInvalid(): void {
  avatarError.value = AVATAR_LIMIT_HINT;
}

async function uploadAvatarRequest(options: UploadRequestOptions): Promise<unknown> {
  avatarUploading.value = true;
  avatarError.value = '';
  try {
    const res = await uploadProfileAvatar(options.file);
    avatarFailed.value = false;
    if (profile.value) {
      profile.value = { ...profile.value, avatar: res.avatarUrl };
    }
    authStore.updateUserSummary({ avatar: res.avatarUrl });
    ElMessage.success('头像已更新');
    return res;
  } catch (error) {
    // 上传失败保持既有头像不变，并提示明确的格式与体积约束原因
    avatarError.value = resolveContextualErrorMessage(error, AVATAR_LIMIT_HINT);
    throw error;
  } finally {
    avatarUploading.value = false;
  }
}

onMounted(() => {
  void loadProfile();
});

onBeforeUnmount(() => {
  clearSkeletonTimer();
});
</script>

<template>
  <section
    data-testid="profile-page"
    class="flex flex-col gap-4 min-[960px]:flex-row min-[960px]:items-start"
  >
    <!-- 左栏：只读身份概览与头像直传 -->
    <aside
      data-testid="profile-overview-card"
      class="flex w-full shrink-0 flex-col gap-4 rounded-[var(--solid-radius-lg)] border border-border bg-surface p-5 min-[960px]:w-[340px]"
    >
      <div class="flex flex-col items-center gap-3 border-b border-border-subtle pb-4 text-center">
        <el-avatar
          :size="72"
          :src="resolvedAvatarSrc"
          :alt="`${displayName}头像`"
          class="solid-profile-avatar"
          @error="handleAvatarLoadError"
        >
          {{ avatarInitial }}
        </el-avatar>

        <div>
          <h1 class="m-0 text-base font-semibold text-ink">{{ displayName }}</h1>
          <div class="mt-0.5 font-mono-data text-xs text-ink-secondary">
            {{ profile?.username || authStore.user?.username || '--' }}
          </div>
        </div>

        <div class="flex min-h-[24px] flex-wrap items-center justify-center gap-1.5">
          <el-tag
            v-for="role in profile?.roles ?? []"
            :key="role"
            size="small"
            :type="role === 'super_admin' ? 'primary' : 'info'"
          >
            {{ role }}
          </el-tag>
        </div>

        <AtengUpload
          :chunk="false"
          :accept="AVATAR_ACCEPT"
          :max-size="AVATAR_MAX_BYTES"
          :show-file-list="false"
          :disabled="avatarUploading"
          :http-request="uploadAvatarRequest"
          @type-reject="handleAvatarInvalid"
          @size-exceed="handleAvatarInvalid"
        >
          <span
            :class="[
              'inline-flex items-center gap-1.5 rounded-[var(--solid-radius-sm)] border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-regular transition-colors',
              avatarUploading
                ? 'cursor-not-allowed opacity-60'
                : 'cursor-pointer hover:border-primary hover:text-primary',
            ]"
          >
            <el-icon :size="13" :class="{ 'is-loading': avatarUploading }">
              <Loading v-if="avatarUploading" />
              <Upload v-else />
            </el-icon>
            <span>{{ avatarUploading ? '上传中...' : '更换头像' }}</span>
          </span>
        </AtengUpload>

        <div
          v-if="avatarError"
          data-testid="profile-avatar-error"
          role="alert"
          class="flex items-center gap-1 text-xs text-danger"
        >
          <el-icon :size="13"><Warning /></el-icon>
          <span>{{ avatarError }}</span>
        </div>
      </div>

      <div v-if="isInitialLoading" data-testid="profile-overview-loading" class="min-h-[238px]">
        <el-skeleton v-if="showSkeleton" :rows="6" animated />
      </div>

      <AtengDescriptions
        v-else
        :data="overviewData"
        :column="1"
        :border="true"
        size="small"
        empty-text="--"
      >
        <AtengDescriptionsItem prop="tenantDisplay" label="所属租户" />
        <AtengDescriptionsItem prop="deptDisplay" label="所属部门" />
        <AtengDescriptionsItem prop="postDisplay" label="所属岗位" />
        <AtengDescriptionsItem
          prop="phone"
          label="手机号码"
          mask="phone"
          :copyable="true"
          class="tabular-nums"
        />
        <AtengDescriptionsItem
          prop="email"
          label="电子邮箱"
          mask="email"
          :copyable="true"
          class="tabular-nums"
        />
        <AtengDescriptionsItem prop="createTime" label="创建时间" class="tabular-nums" />
        <AtengDescriptionsItem prop="lastLoginDisplay" label="最近登录" class="tabular-nums" />
      </AtengDescriptions>
    </aside>

    <!-- 右栏：基本资料维护与修改密码双页签 -->
    <div
      v-loading="showSkeleton"
      class="min-w-0 flex-1 rounded-[var(--solid-radius-lg)] border border-border bg-surface p-5"
    >
      <div
        v-if="profileError"
        data-testid="profile-load-error"
        role="alert"
        class="mb-4 flex items-center justify-between gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2 text-[13px] text-[var(--solid-danger)]"
      >
        <span class="flex items-center gap-2">
          <el-icon :size="15"><Warning /></el-icon>
          <span>{{ profileError }}</span>
        </span>
        <el-button
          data-testid="profile-retry-btn"
          size="small"
          type="danger"
          plain
          :icon="RefreshRight"
          :loading="loading"
          @click="loadProfile"
        >
          重新加载
        </el-button>
      </div>

      <el-tabs
        v-model="activeTab"
        :class="
          isInitialLoading
            ? 'pointer-events-none opacity-0'
            : 'opacity-100 transition-opacity duration-150'
        "
        @tab-change="handleInnerTabChange"
      >
        <el-tab-pane label="基本资料" name="basic">
          <ProfileBasicForm :profile="profile" :loading="loading" @saved="loadProfile" />
        </el-tab-pane>

        <el-tab-pane label="修改密码" name="password" lazy>
          <div data-testid="profile-password-panel">
            <ProfilePasswordForm />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </section>
</template>

<style scoped>
.solid-profile-avatar {
  --el-avatar-bg-color: var(--solid-primary-soft);
  --el-avatar-text-color: var(--solid-primary);
  font-size: 24px;
  font-weight: 600;
}
</style>
