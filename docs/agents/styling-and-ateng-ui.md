# TailwindCSS v4 + `Precision Slate & Cobalt` 令牌与 `ateng-ui` 接入守则 (styling-and-ateng-ui.md)

> **适用时机**：编写页面布局、主题样式、`src/styles/*`，或接入 `@atengk/element-plus` / `@atengk/vue` 核心组件前必读。
> **视觉真源**：`Precision Slate & Cobalt` 令牌与方案 A 布局定义于根仓 `docs/specs/prd/design-system.md` 与 `00-overview-and-ux-standards.md`（前端 ADR 见 [`docs/adr/0001-tailwindcss-without-preflight-and-theme-pro.md`](../adr/0001-tailwindcss-without-preflight-and-theme-pro.md)）。

---

## 1. TailwindCSS v4（禁用 Preflight）与自有令牌导入顺序

1. **严禁引入 Preflight**：本项目使用 TailwindCSS v4 + `@tailwindcss/vite`，在 `src/styles/main.css` 仅显式导入 `@import "tailwindcss/theme.css";` 与 `@import "tailwindcss/utilities.css";`，严禁导入 `tailwindcss/preflight.css` 或总入口 `@import "tailwindcss";`（Preflight 会清空 `button` 背景、标题边距与 `svg` 对齐，破坏 Element Plus 外观）。
2. **脱离 `theme-pro.css` 默认皮肤与固定导入序**：
   - `element-plus/dist/index.css`、`element-plus/theme-chalk/dark/css-vars.css` ➔ `@atengk/element-plus/style.css` ➔ 自有设计令牌 `src/styles/tokens.css` ➔ Tailwind v4 `theme.css` / `utilities.css`。
   - 不绑定 `@atengk/element-plus/theme-pro.css` 默认靛紫皮肤，由 `src/styles/tokens.css` 定义 `--solid-*` 语义令牌并双向映射至 `--el-*` 与 Tailwind `@theme`（同时 100% 复用 `@atengk/core`/`@atengk/vue` 无头状态机与 `@atengk/element-plus` 组件契约）。
3. **语义色值、暗黑模式与等宽数字**：
   - Tailwind 仅负责页面/区块级布局与间距，严禁用 Tailwind 工具类魔改 `.el-*`/`.at-*` 内部 DOM；局部自定义样式必须 `<style scoped>`，禁全局 `!important`。
   - 暗黑模式声明 `@custom-variant dark (&:where(.dark, .dark *));`，跟随 `html.dark` 切换（Light `#1D4ED8` / Dark `#3B82F6` 深钴蓝焦点）；全站颜色/圆角/阴影绑定 `var(--solid-*)` / `var(--el-*)`，禁页面硬编码 Hex。
   - 表格 ID、统计数字、时间戳、IP 与分页数字统一附加 `font-variant-numeric: tabular-nums`。

---

## 2. `@atengk/*` 组件接入实测避坑速查

1. **菜单图标解析**：直接向 `AtengProLayout` / `ProMenu` 传入 `:icon-resolver` 回调，将后端菜单 `icon` 字符串映射为 `@element-plus/icons-vue` 组件，不篡改后端菜单数据结构。
2. **多标签页 + `<KeepAlive>` 联动**：
   - 用 `@atengk/vue` `useTabsNav()` 驱动页签，主体 `<router-view v-slot="{ Component }">` 包裹 `<KeepAlive :include="cachedViews">`（`cachedViews` 直接取自 `useTabsNav` 返回的计算属性）。
   - **事件差异防坑**：`AtengTabsNav` 单标签关闭仅派发 `tabClose`，批量关闭命令（关闭其他/全部）同时派发 `tabClose` 与 `update:tabs`，须由容器收口至 `useTabsNav` 单一数据源。
3. **分页表格与查询表单协同**：
   - 标准组合：`usePagination`（`@atengk/vue`）+ `AtengQueryForm` + `AtengTable`。
   - **防双重请求**：当 `AtengQueryForm` 嵌套在已传 `:pagination` 的 `<AtengTable #query>` 内时，表单仅传 `:model="pagination.query" :search-loading="pagination.loading"`，避免重置时触发重复请求。
   - 树形表格直接向 `<AtengTable>` 透传 `:tree-props`、`row-key="id"`、`:show-pagination="false"`。
4. **字典与枚举双轨加载**：
   - `install(app, { dictProvider })` 仅注册单查 `provider`；批量拉取须额外调用 `DictManager.setBatchProvider(...)`，分别对接动态字典 `/admin/system/dict/data/type/...` 与静态枚举 `/admin/system/enums/...`。
   - **枚举适配防坑**：前端枚举适配层将后端 `OptionItem`（`{ code, label, disabled, extra }`）映射为 `DictItem`（`{ label, value, ... }`），并将后端 `listClass === 'default'` 归一化为 `''`（`AtengDictTag` 不接受 `'default'`）；列表用 `AtengDictTag`，表单用 `AtengDictSelect` / `AtengDictRadio` / `AtengDictCheckbox`。
5. **验证码、上传与 Excel 导入导出**：
   - 图形验证码：`<AtengCaptcha type="image" :refresh="loadCaptcha" />`（`refresh` 是 **Prop 回调**，不是 `@refresh` 事件）。
   - 非分片上传：`<AtengUpload :http-request="..." />`。
   - 导入错误反馈用 `AtengExcelFeedback`（渲染 `rowNum`、`columnName`、`errorMessage` 三列）；导出用 `AtengExcelExport`（支持直传 `Blob` 提取 `Content-Disposition` 文件名）。

> 若接入中发现 `@atengk/*` 通用能力缺失或缺陷，按 [`foundation-first-gate.md`](./foundation-first-gate.md) 停工提单（涉及未发版增量特性 `U5~U8` 本地联调须在合入前锁回 npm 正式版）。
