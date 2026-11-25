import type { FormRules } from 'element-plus';
import type { MenuTreeVO } from '@/api/system/menu';
import type { MenuType } from '@/api/types';
import {
  EXTERNAL_URL_PATTERN,
  findMenuNodeById,
  PERMS_PATTERN,
  ROOT_MENU_ID,
  ROUTE_NAME_PATTERN,
} from '@/views/system/menu/menuHelper';

/**
 * 菜单新增/编辑动态表单校验规则构造器（按当前节点类型与外链开关动态判别）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export interface MenuRuleContext {
  getMenuType: () => MenuType;
  getIsExternal: () => boolean;
  getMenuTree: () => MenuTreeVO[];
}

/**
 * 构建菜单表单动态校验规则表。
 *
 * @param ctx 表单当前节点类型、外链标识与完整菜单树读取上下文
 * @returns 适配 Element Plus ElForm 的规则对象
 */
export function buildMenuFormRules(ctx: MenuRuleContext): FormRules {
  return {
    parentId: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (ctx.getMenuType() === 'F') {
            if (!trimmed || trimmed === ROOT_MENU_ID) {
              callback(new Error('按钮权限必须挂载在页面菜单下'));
              return;
            }
            const parentNode = findMenuNodeById(ctx.getMenuTree(), trimmed);
            if (parentNode && parentNode.menuType !== 'C') {
              callback(new Error('按钮权限仅允许挂载在页面菜单（C）下'));
              return;
            }
          } else if (!trimmed) {
            callback(new Error('请选择上级节点'));
            return;
          }
          callback();
        },
        trigger: 'change',
      },
    ],
    title: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 1 || trimmed.length > 50) {
            callback(new Error('显示名称长度须在 1~50 个字符之间'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    path: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const menuType = ctx.getMenuType();
          if (menuType === 'F') {
            callback();
            return;
          }
          const trimmed = (value ?? '').trim();
          if (!trimmed || trimmed.length > 255) {
            callback(new Error('请输入合法路由路径或外链地址（不超过 255 个字符）'));
            return;
          }
          if (menuType === 'C' && ctx.getIsExternal() && !EXTERNAL_URL_PATTERN.test(trimmed)) {
            callback(new Error('外链地址必须以 http:// 或 https:// 开头'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    name: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (ctx.getMenuType() !== 'C' || ctx.getIsExternal()) {
            callback();
            return;
          }
          const trimmed = (value ?? '').trim();
          if (!trimmed || trimmed.length > 64 || !ROUTE_NAME_PATTERN.test(trimmed)) {
            callback(new Error('路由组件名须为大驼峰 PascalCase（如 SysDept）'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    component: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (ctx.getMenuType() !== 'C' || ctx.getIsExternal()) {
            callback();
            return;
          }
          const trimmed = (value ?? '').trim();
          if (!trimmed || trimmed.length > 255) {
            callback(new Error('请输入前端视图组件路径（如 system/dept/index）'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    perms: [
      {
        validator: (_rule, value: string, callback) => {
          const menuType = ctx.getMenuType();
          if (menuType === 'M') {
            callback();
            return;
          }
          const trimmed = (value ?? '').trim();
          if (menuType === 'F' && !trimmed) {
            callback(new Error('按钮权限节点必须填写权限标识'));
            return;
          }
          if (trimmed && (trimmed.length > 100 || !PERMS_PATTERN.test(trimmed))) {
            callback(new Error('权限标识须为三段式小写格式（如 system:dept:create）'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    sort: [
      { required: true, type: 'number', message: '请输入显示排序（0~9999）', trigger: 'blur' },
    ],
  };
}
