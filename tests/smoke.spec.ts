import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import AtengElementPlus from '@atengk/element-plus';
import { createAppRouter } from '@/router';
import App from '@/App.vue';

/**
 * 根组件冒烟测试：验证 ElConfigProvider 中文语言包与路由视图可离线挂载并确定性卸载。
 *
 * @author Ateng
 * @since 2026-11-19
 */
describe('App root smoke', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    localStorage.clear();
    sessionStorage.clear();
  });

  it('mounts ElConfigProvider with router-view cleanly', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    await router.push('/login');
    await router.isReady();

    wrapper = mount(App, {
      global: {
        plugins: [pinia, router, ElementPlus, AtengElementPlus],
      },
    });
    await flushPromises();

    expect(wrapper.find('h1').text()).toContain('登录管理后台');
  });
});
