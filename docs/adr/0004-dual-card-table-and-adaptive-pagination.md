# ADR-0004: 列表页上下双卡分体容器与自适应分页栏架构

- **状态**：`Accepted`（上游 [`ateng-ui#379`](https://github.com/atengk/ateng-ui/issues/379) 已于 `ee55b3b` / `d255cd8` 闭环并经本地 `yalc` 联调；`dev` 分支已放行提交，合入 `main` 前待 npm 锁版）
- **日期**：2026-11-26
- **作者**：Ateng
- **关联范围**：`ateng-ui`（`AtengTable`、`AtengQueryForm`、`AtengExcelFeedback`）、`ateng-solid-admin-web` 全局样式与全部 12 个系统列表页（10 个分页表 + 2 个树表）

---

## 1. 背景

在实机走查与全站页面审计中，剥离可选 `theme-pro.css`（详见 [ADR-0001](./0001-tailwindcss-without-preflight-and-theme-pro.md)）后的 `AtengTable` + `AtengQueryForm` 组合暴露出以下结构性体验与对齐问题：

1. **上下边缘错位与四边 `0px` 贴死**：`AtengQueryForm` 自带内边距与底部间距，而 `AtengTable` 根容器设白底且 `padding: 0`、无圆角无边框；`.at-table__pagination` 仅有 `padding: 12px 0 0 0; justify-content: flex-end;`。导致检索卡底隙被表格白底吞并，工具栏、`el-table`、`操作` 列与底部分页条（尤其是「前往 [1] 页」的末字「页」）左右下 `0px` 贴边，且右侧表格与左栏部门树面板（`8px` 圆角 + `1px` 细边框 + 内边距）风格割裂。
2. **分页信息密度失衡与局部覆盖分裂**：全站分页控件全部压在右下角右对齐（与 `AtengPageSkeleton` 左总右控骨架不符）、缺少 `.tabular-nums` 等宽与 `flex-wrap` 防溢出，且 `0` 条空列表与只有 `1` 页时仍展示完整「前往 1 页」跳转；同时 `/system/dict` 双栏两表各自覆盖了不一致的 `pagination-layout`。

---

## 2. 备选方案对比

| 维度 | 方案 A（采纳） | 方案 B（否决） | 方案 C（否决） |
| :--- | :--- | :--- | :--- |
| **容器形态** | **上下双卡分体**：`AtengQueryForm` 与 `AtengTable` 表格-分页区（`.at-table__surface`）各自成卡，统一 `8px` 圆角、`1px` 细边框与 `16px` 内边距 | 单白卡合并（给 `.at-table` 四周加 `16px` 内边距并消去查询卡独立白底） | 仅微调 `.at-table__pagination` 内边距，维持上下不齐的 `0px` 表格外框 |
| **单页收敛** | `total === 0` 自动收起分页栏；`total > 0` 且总页数 `<= 1` 时仅隐藏冗余 `jumper`，保留左 `共 N 条` 与右 `[10条/页] < 1 >` | 直接开启 Element Plus `hide-on-single-page`（切换至更大 `pageSize` 缩成 1 页后将永久丢失容量选择器与总条数） | 永远展示完整 6 件套（单页仍显示无意义 `前往 1 页`） |
| **改造边界** | 先在上游 `ateng-ui`（`#379`）完成结构/自适应能力并保留向后兼容开关，上层仅通过轻量令牌与统一布局消费 | 在 `admin-web` 使用全局 `!important` 魔改 `.at-table__*` 内部 DOM | 仅在截图涉及的用户/角色两页做局部补丁 |

---

## 3. 核心决策

1. **上下双卡分体结构**：由 `ateng-ui#379` 将 `AtengTable` 根背景设为透明、新增 `.at-table__surface` 包裹工具栏、表格主体与底部分页栏，提供标准内边距、细边框与圆角令牌；`AtengQueryForm` 对齐一致细边框与圆角变量，确保全站单列列表、树表及 `AtengSplitLayout` 双栏页卡片层级 100% 统一。
2. **两端分布与自适应收敛分页栏**：采用“总条数置左（`共 N 条`）+ 翻页/容量/跳转控件组置右”，强制 `.tabular-nums` 等宽排版与 `flex-wrap: wrap` 换行兜底；按 `total === 0` 退隐、`totalPages <= 1` 收起 `jumper` 规则自适应渲染。
3. **全站统一收口与零 `!important` 视觉对齐**：上游 `ateng-ui#379` 落地后，在 `src/styles/tokens.css` 与 `src/styles/main.css` 统一绑定 `--at-table-card-border` / `--at-table-card-radius` / `--at-table-query-gap` / `--at-query-form-*` 与零 `!important` 的 `.el-pagination` 视觉/焦环变量，同步移除 `dict/index.vue` 与 `DictDataPanel.vue` 的手写 `pagination-layout` 差异覆盖，全部交由 `AtengTable` 窄容器自适应管理。

---

## 4. 下游影响

- 已同步维护根仓 [00-overview-and-ux-standards.md](https://github.com/atengk/ateng-solid/blob/dev/docs/specs/prd/00-overview-and-ux-standards.md) §3.1–§3.2、[foundation-enhancements-checklist.md](https://github.com/atengk/ateng-solid/blob/dev/docs/specs/foundation-enhancements-checklist.md)（`U15`）及前端 [styling-and-ateng-ui.md](../agents/styling-and-ateng-ui.md)；
- 上游 [`ateng-ui#379`](https://github.com/atengk/ateng-ui/issues/379) 本地联调闭环已完成，`dev` 分支可直接携带 `yalc` 联调提交，合入 `main` 与发版前须按 [foundation-first-gate.md](../agents/foundation-first-gate.md) 锁定正式 npm 版本。
