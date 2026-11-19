import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import App from '@/App.vue';

/**
 * 前端骨架基础冒烟测试，验证根组件可离线挂载与确定性卸载。
 *
 * @author Ateng
 * @since 2026-11-19
 */
describe('App skeleton smoke', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders application title cleanly', () => {
    wrapper = mount(App);
    expect(wrapper.text()).toContain('ateng-solid 管理后台');
  });
});
