# ateng-solid-admin-web

PC 管理后台前端应用上下文，承载多租户认证登录、动态菜单路由、RBAC 权限管控与系统运营管理交互。

## Language

### 认证与多租户

**管理端会话 (Admin Session)**:
面向后台管理端（`loginType = "admin"`）的独立登录凭据与当前用户信息，通过请求头 `satoken-admin` 传递。
_Avoid_: 普通 Token、前台会话、`Authorization` 混用

**平台超级管理员 (Super Admin)**:
归属平台默认租户（`tenantId = "0"`）且拥有角色编码 `super_admin` 的全局治理身份，具备跨租户视角切换能力。
_Avoid_: `admin`（作为超管免检角色名）、普通管理员

**工作租户视角 (Active Tenant)**:
当前前端请求通过 `X-Tenant-Id` 传递的业务租户标识（字符串形式的 64 位雪花 ID，默认 `"0"`）；普通用户固定锁定归属租户，仅平台超管可受控切换。
_Avoid_: 租户数字 ID（`number`）、硬编码租户编码作为主键

**租户套餐 (Tenant Package)**:
平台向租户授予的菜单与功能边界集合，限制租户下角色可分配的最大权限范围。
_Avoid_: 权限组、角色模板

### 路由、菜单与权限

**权限菜单节点 (Menu Node)**:
后端下发并驱动前端侧边栏、动态路由与按钮显隐的树形节点，严格分为目录（`M`）、菜单页（`C`）与按钮权限（`F`）三类。
_Avoid_: 权限项与路由混称、前端硬编码完整菜单

**三段式权限码 (Permission Code)**:
统一采用 `<域>:<资源>:<动作>`（如 `system:user:create`）的小写冒号权限标识，用于按钮级控制。
_Avoid_: 同义异名动作后缀（如 `add`/`del`/`edit` 与 `create`/`delete`/`update` 混用）

**页签缓存视图 (Cached View)**:
由多标签页状态与路由 `keepAlive` 元数据共同维护的组件名集合，用于 `<KeepAlive>` 精准保活与刷新卸载。
_Avoid_: 全局无条件缓存全部路由

### 字典与数据展示

**静态枚举字典 (Static Enum)**:
后端不可运营变更的代码强类型状态选项（来源于 `/admin/system/enums`），与可后台增删改的动态业务字典分工互补。
_Avoid_: 将代码强类型枚举重复录入动态字典表

**动态业务字典 (Dynamic Dict)**:
由运营人员在后台维护的键值选项集合（`sys_dict_type` / `sys_dict_data`），通过 `DictManager` 统一缓存渲染。
_Avoid_: 前端组件内硬编码魔法数字下拉项

**内存真明文 (In-Memory Plaintext)**:
前端表单与 Store 状态层始终持有原始业务字段值，敏感信息掩码仅发生在展示渲染阶段。
_Avoid_: 在表单编辑状态中直接将手机号/邮箱改写为带星号字符串
