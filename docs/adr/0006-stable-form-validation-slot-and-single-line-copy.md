# ADR-0006: 非行内表单绝对定位固定校验槽位与单行文案收口

- **状态**：`Accepted`
- **日期**：2026-11-27
- **作者**：Ateng
- **关联范围**：`src/styles/main.css`、`/login`、个人中心及全站 `AtengDialog` / `AtengDrawer` 表单

---

## 1. 背景

在排查登录页（`/login`）与弹窗/抽屉表单“校验出错时容器被拉长、校验通过后又缩回”的视觉抖动问题时，核实直接根因位于业务仓 `src/styles/main.css`，而非底层 `ateng-ui` 或 Element Plus：

1. **底层原本是稳态设计**：Element Plus 原生为 `.el-form-item` 预留 `margin-bottom: 18px`（`large` 为 `22px`），并将 `.el-form-item__error` 设为 `position: absolute; top: 100%; left: 0;`，使单行校验报错落在既有间距槽位内；`@atengk/element-plus` 的 `style.css`、`theme-pro.css`、`AtengDialog` 与 `AtengDrawer` 均未改变该定位机制。
2. **此前流式覆写的副作用**：提交 `a7ea121` 为避免 `DeptFormDialog` 等窄双列内长校验文案折行遮挡下一行输入以及弹窗末行报错被裁切，在 `src/styles/main.css` 全局设置了 `.el-form:not(.el-form--inline) .el-form-item__content .el-form-item__error { position: static; ... }` 并压缩弹窗末行 `margin-bottom: 6px`。虽然消除了折行遮挡，但导致**全站所有非行内表单**每次校验报错都在既有 `margin-bottom` 之外额外撑高约 `21px~38px` 文档流高度，通过后又瞬间回弹（引发登录卡片伸缩、下方控件位移与弹窗内容跳动）。

---

## 2. 备选方案与权衡

| 维度 | 方案 A：恢复绝对定位固定槽位 + 宽列/单行文案收口（采纳） | 方案 B：全局 `position: static` 流式占位（否决） | 方案 C：强制 `text-overflow: ellipsis` 单行截断（否决） |
| :--- | :--- | :--- | :--- |
| **高度稳定性** | **0px 高度跳动**：常规单行报错完全落在预留 `20px` 槽位内，卡片与按钮位置静止 | 每次校验显隐均拉伸并回弹 `21px+`，导致整页或弹窗抖动 | 0px 跳动，但长校验提示末尾被省略号隐藏 |
| **可读性与防遮挡** | 通过放宽窄列与精简超长文案，让错误规则**完整单行展示**、不折行不遮挡 | 不遮挡，但以全站布局剧烈跳动为代价 | 窄容器下用户看不到完整校验规则（如字数/字符集要求） |
| **改造成本与边界** | 收口在 `ateng-solid-admin-web` 内实现，不侵入 `ateng-ui` 底座 | 需持续在各容器补偿末行边距且无法解决跳动本质问题 | 需额外维护悬浮提示，体验割裂 |

---

## 3. 核心决策

1. **恢复绝对定位固定槽位（严禁再全局启用 `position: static`）**：
   - 在 [`src/styles/main.css`](../../src/styles/main.css) 移除 `.el-form-item__error` 的 `position: static` 与弹窗末行 `margin-bottom: 6px` 压缩规则；
   - 仅针对 `.el-form:not(.el-form--inline):not(.at-query-form)` 设定 `--el-form-item-margin-bottom: 20px`（`--el-form-item--large` 保留 `22px`、`AtengQueryForm` 维持其自有 `16px` 间距），配合 `.el-form-item__error { padding-top: 3px; line-height: 1.3; }`（总高约 `18.6px < 20px`），让单行报错与 `<PasswordPolicyChecklist>` 下方报错均稳妥落在预留槽位中；
   - 为 `.at-dialog__content .el-form:not(.el-form--inline)` 增加 `padding-bottom: 1px;`，阻止最后一个 `.el-form-item` 的 `20px` 下边距穿透塌陷，确保 `AtengDialog` `<el-scrollbar>` 内末行报错完整可见且不触发多余滚动条；保留 `.el-form p { margin-bottom: 0; }`。
2. **宽列排版与单行校验文案守则**：
   - 保持 `DeptFormDialog` 的 `640px` PRD 弹窗宽度不变，将部门名称、负责人、联系电话、电子邮箱调整为全宽单列排版（仅保留 `显示排序 + 部门状态` 短控件双列），消除约 `196px` 超窄列；
   - 精简 `deptHelper.ts`、`DictTypeFormDialog.vue` 与 `useLoginAuth.ts` 中超过常规单行宽度的极少数校验提示文案，保证在桌面端及窄屏下完整单行呈现，不使用 `ellipsis` 截断。

---

## 4. 下游影响

- 已同步更新 [`docs/agents/styling-and-ateng-ui.md`](../agents/styling-and-ateng-ui.md) §2.6；
- 本次变更完全收口在 `ateng-solid-admin-web` 应用层，不修改 `ateng-ui`；若后续多个上层项目均依赖通用弹窗滚动画布末行留白兜底，再按根仓 `foundation-first-gate.md` 单独向 `ateng-ui` 提 Issue 评估下沉 `AtengDialog`。
