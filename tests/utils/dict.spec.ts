import { describe, expect, it, vi } from 'vitest';
import { DictManager } from '@atengk/element-plus';
import { adminHttpClient } from '@/utils/http';
import { normalizeTagType, setupDictManager } from '@/utils/dict';

/**
 * 双轨（静态枚举 + 动态字典）分发器与 Tag 样式归一化单元测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */
describe('dual-track DictManager & tagType normalizer', () => {
  it('normalizes Element Plus tag types and strips default or invalid values to undefined', () => {
    expect(normalizeTagType('primary')).toBe('primary');
    expect(normalizeTagType(' success ')).toBe('success');
    expect(normalizeTagType('warning')).toBe('warning');
    expect(normalizeTagType('danger')).toBe('danger');
    expect(normalizeTagType('info')).toBe('info');
    expect(normalizeTagType('')).toBeUndefined();
    expect(normalizeTagType('   ')).toBeUndefined();
    expect(normalizeTagType('default')).toBeUndefined();
    expect(normalizeTagType('DEFAULT')).toBeUndefined();
    expect(normalizeTagType('purple')).toBeUndefined();
    expect(normalizeTagType(null)).toBeUndefined();
    expect(normalizeTagType(undefined)).toBeUndefined();
  });

  it('routes lowerCamelCase enums to /admin/system/enums and snake_case dicts to /dict/data/type', async () => {
    setupDictManager();
    const getSpy = vi.spyOn(adminHttpClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/admin/system/enums/dataScopeType') {
        return [
          { code: 1, label: '全部数据权限', disabled: false, extra: { tagType: 'primary' } },
          { code: 5, label: '仅本人数据权限', disabled: false, extra: { listClass: 'default' } },
        ];
      }
      if (url === '/admin/system/dict/data/type/sys_user_gender') {
        return [
          {
            id: '1',
            dictType: 'sys_user_gender',
            dictLabel: '男',
            dictValue: '0',
            tagType: 'primary',
            cssClass: 'gender-male',
            sort: 1,
            isDefault: 0,
            status: 0,
          },
          {
            id: '2',
            dictType: 'sys_user_gender',
            dictLabel: '未知',
            dictValue: '2',
            tagType: 'default',
            cssClass: '',
            sort: 3,
            isDefault: 1,
            status: 1,
          },
        ];
      }
      return [];
    });

    const scopeItems = await DictManager.loadDict('dataScopeType');
    const genderItems = await DictManager.loadDict('sys_user_gender');

    expect(getSpy).toHaveBeenNthCalledWith(1, '/admin/system/enums/dataScopeType');
    expect(getSpy).toHaveBeenNthCalledWith(2, '/admin/system/dict/data/type/sys_user_gender');
    expect(scopeItems).toEqual([
      {
        label: '全部数据权限',
        value: 1,
        disabled: false,
        tagType: 'primary',
        cssClass: undefined,
        raw: { code: 1, label: '全部数据权限', disabled: false, extra: { tagType: 'primary' } },
      },
      {
        label: '仅本人数据权限',
        value: 5,
        disabled: false,
        tagType: undefined,
        cssClass: undefined,
        raw: { code: 5, label: '仅本人数据权限', disabled: false, extra: { listClass: 'default' } },
      },
    ]);
    expect(genderItems).toHaveLength(2);
    expect(genderItems[0]).toMatchObject({
      label: '男',
      value: '0',
      disabled: false,
      tagType: 'primary',
      cssClass: 'gender-male',
    });
    expect(genderItems[1]).toMatchObject({
      label: '未知',
      value: '2',
      disabled: true,
      tagType: undefined,
      cssClass: undefined,
    });
  });

  it('splits batch preload into /enums/batch for static enums and concurrent /dict fetches, honoring clearCache', async () => {
    setupDictManager();
    const postSpy = vi
      .spyOn(adminHttpClient, 'post')
      .mockImplementation(async (_url: string, data?: unknown) => {
        expect(data).toEqual(['commonStatus', 'menuType']);
        return {
          commonStatus: [{ code: 0, label: '正常', extra: { tagType: 'success' } }],
          menuType: [{ code: 'C', label: '菜单', extra: { tagType: 'info' } }],
        };
      });
    const getSpy = vi.spyOn(adminHttpClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/admin/system/dict/data/type/sys_yes_no') {
        return [
          {
            id: '10',
            dictType: 'sys_yes_no',
            dictLabel: '是',
            dictValue: 'Y',
            tagType: 'success',
            sort: 1,
            isDefault: 0,
            status: 0,
          },
        ];
      }
      if (url === '/admin/system/enums/commonStatus') {
        return [{ code: 1, label: '停用', extra: { tagType: 'danger' } }];
      }
      return [];
    });

    const preloaded = await DictManager.preload(['commonStatus', 'sys_yes_no', 'menuType']);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('/admin/system/enums/batch', ['commonStatus', 'menuType']);
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('/admin/system/dict/data/type/sys_yes_no');
    expect(preloaded.commonStatus).toHaveLength(1);
    expect(preloaded.commonStatus?.[0]?.value).toBe(0);
    expect(preloaded.sys_yes_no?.[0]?.label).toBe('是');

    // 命中内存缓存时不发网络请求
    const cached = await DictManager.loadDict('commonStatus');
    expect(cached[0]?.label).toBe('正常');
    expect(getSpy).toHaveBeenCalledTimes(1);

    // 清理单个键后重新拉取生效
    DictManager.clearCache('commonStatus');
    const refreshed = await DictManager.loadDict('commonStatus');
    expect(refreshed[0]?.label).toBe('停用');
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
