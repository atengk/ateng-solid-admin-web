# ADR-0005: 检索复杂度分级单行收口与表格弹性封顶滚动架构

- **状态**：`Accepted`（上游 [`ateng-ui#380`](https://github.com/atengk/ateng-ui/issues/380) 已于 `19f79a7` / `1365732` 闭环并经本地 `yalc` 联调；`admin-web` 全站 12 个列表页已同步收口并通过本地四合一门禁，`dev` 分支已放行提交，合入 `main` 前待 npm 锁版）
- **日期**：2026-11-26
- **作者**：Ateng
- **关联范围**：`ateng-ui#380`、`ateng-solid-admin-web` 全站 12 个系统列表页（8 个单分页表 + 2 个无分页树表 + 2 个分栏页）

---

## 1. 背景

在第一阶段实机走查与交互对齐中，列表检索区与表格高度策略暴露两处跨全站的体验割裂：

1. **检索区 3 项条件尴尬折行与全站状态分裂**：
   - `AtengQueryForm` 默认按自身 `clientWidth` 响应断列（`1200~1920px: 3 列`、`≥1920px: 4 列`），并预留 1 格给操作区（`maxVisibleCount = cols - 1`）。扣除 `228px` 侧栏与内边距后，主流桌面屏（`1280px`–`1920px`）容器宽度多落入 `992~1920px`（`2~3` 列），导致只有 3 个字段的页面（如 `/system/menu`）在 `defaultCollapsed = true` 时隐藏第 3 个高频条件，而在 `defaultCollapsed = false` 时第 1 行被 3 个输入框占满、`[查询][重置]` 掉到第 2 行且右侧仍残留无意义的 `收起` 按钮；
   - 全站 13 张表在 `defaultCollapsed` 上出现 6 处 `false` 与 7 处 `true` 的分裂配置，与既有一刀切折叠文档冲突。
2. **表格高度「硬铺满」与「整页滚」两难**：
   - `AtengTable` 当前默认 `autoHeight = false` 随内容无限撑高，在每页 50/100 条或无分页树表全展开时触发 `AdminLayout` `<main>` 外层整页滚动，表头、工具栏与底部分页栏滚出视口；
   - 而 `AtengTable` 现有的 `:auto-height="true"` 绑定 `<el-table :height="calculatedHeight">`，在只有 1~3 条数据或空态时会强行拉伸出大片空白并把分页栏钉在屏底，视觉空荡。

---

## 2. 备选方案对比

### 2.1 检索区展开/收起与列数

| 维度 | 方案 A（采纳） | 方案 B（否决） | 方案 C（否决） |
| :--- | :--- | :--- | :--- |
| **分级策略** | **按条件数与容器宽度分级**：全宽 ≤3 项默认展开且不显示折叠按钮，配 `:cols` 单行排开；窄分栏例外与 ≥4 项多条件保留 `defaultCollapsed = true`（首行展示 + `展开`） | 全站一刀切 `defaultCollapsed = true`（3 项页也隐藏第 3 项） | 全站一刀切 `defaultCollapsed = false`（5~6 项日志页也全摊开） |
| **单行收口** | 3 项页显式配 `md/lg/xl: 4`、2 项页配 `sm/md: 3, lg/xl: 4`，保证 1280px+ 桌面单行容纳“条件 + 查询/重置” | 保留默认 3 列，接受 `[查询][重置]` 孤立换至第 2 行 | 强制窄分栏（`dict` 左栏 44% 宽）也展开占 3 行 |

### 2.2 表格高度与滚动模式

| 维度 | 方案 A（采纳） | 方案 B（否决） | 方案 C（否决） |
| :--- | :--- | :--- | :--- |
| **高度语义** | **弹性封顶（`max-height`）**：少数据紧包随数据走；超出视口剩余高度时封顶并表内纵向滚动，固定表头、工具栏与分页栏 | **固定铺满（`:auto-height="true"` / `:height`）**：少数据时卡片强行撑满至屏幕底部留大片空白 | **维持整页滚动（`autoHeight: false`）**：数据多时表头、检索区与分页栏随外层 `<main>` 滚出视口 |
| **改造边界** | 遵循 Zero Workaround 向 [`ateng-ui#380`](https://github.com/atengk/ateng-ui/issues/380) 提单新增 `autoHeightMode?: 'fixed' \| 'max'`（默认 `'fixed'` 兼容），上层统一消费 | 在业务层写死 `calc(100vh - xxx)` CSS 补丁绕过 `AtengTable` | 仅在部分页面试行，造成各列表滚动行为割裂 |

---

## 3. 核心决策

1. **检索复杂度分级与桌面单行收口**：
   - **精简检索（≤3 项且容器够宽）**：`/system/menu`、`/system/role`、`/system/post`、`/system/config`、`/system/dept`、`/system/online`、`/system/tenant-package` 及 `/system/dict` 右栏明细统一设 `:default-collapsed="false"` 与 `:show-collapse="false"`；全宽 3 项页配置 `:cols="{ xs: 1, sm: 2, md: 4, lg: 4, xl: 4 }"`，2 项页配置 `:cols="{ xs: 1, sm: 3, md: 3, lg: 4, xl: 4 }"`，确保桌面端单行完成检索排布且不出现冗余折叠按钮；
   - **复杂检索与窄分栏例外**：`/system/dict` 左栏（44% 窄分栏 3 项）及 ≥4 项页面（`user` 4 项、`tenant` 4 项、`login-log` 5 项、`oper-log` 6 项）维持 `:default-collapsed="true"` 与 `:collapsed-rows="1"`，首行保留高频检索字段，低频条件收起至 `展开 ▾`。
2. **全站 12 页弹性封顶表内滚动（`ateng-ui#380`）**：
   - 桌面横排态下，全站 **8 个单分页表 + 2 个无分页树表（`menu`/`dept`）+ 2 个分栏页（`user`/`dict`）**统一传入 `:auto-height="16"` 与 `auto-height-mode="max"`；`user`/`dict` 横向分栏态外层容器收紧为 `h-full min-h-0`，确保 `UserDeptSidebar` 与双面板表格各自独立在视口内滚动不撑爆外层；
   - 当视口处于移动端（`<768px`）或 `user`/`dict` 垂直堆叠态时，关闭 `auto-height`（传 `false`）并退回自然流整页滚动，避免上下多段小框嵌套滚动。
3. **底座扩展向后兼容契约（`ateng-ui#380`）**：
   - 新增 `autoHeightMode?: 'fixed' | 'max'`，默认保留 `'fixed'` 不破坏上游已有消费者；
   - 要求底座在计算可用高度时计入 `.at-table__surface` 底部边框宽度并协同 `#query` 展开/收起、树表无分页与全屏切换重算。

---

## 4. 下游影响

- 已同步更新 [`CONTEXT.md`](../../CONTEXT.md) 词条、根仓 [总览交互规范](https://github.com/atengk/ateng-solid/blob/dev/docs/specs/prd/00-overview-and-ux-standards.md) §3.1–§3.2、[认证与在线会话 PRD](https://github.com/atengk/ateng-solid/blob/dev/docs/specs/prd/01-auth-and-workspace.md) 及 [`styling-and-ateng-ui.md`](../agents/styling-and-ateng-ui.md) §2.3；
- 已将 [`ateng-ui#380`](https://github.com/atengk/ateng-ui/issues/380) 登记入 [底层基础设施待增强清单](https://github.com/atengk/ateng-solid/blob/dev/docs/specs/foundation-enhancements-checklist.md)（`U16`）；上层已通过 `src/composables/useListTableLayout.ts` 完成全站 12 个业务页（13 张表）改造与 `ListTableLayout.spec.ts` 验收，`dev` 分支允许携带本地 `yalc` 联调提交，合入 `main` 与发版前须按 [foundation-first-gate.md](../agents/foundation-first-gate.md) 锁定正式 npm 版本。
