## 变更说明
<!-- 请简要说明此 PR 解决的问题、涉及的页面/组件或 API 对齐范围 -->

## 关联 Issue
- 修复/关联: close #

## 变更类型
- [ ] `feat`: 新增页面或功能
- [ ] `fix`: 缺陷修复
- [ ] `docs`: 文档变动
- [ ] `style`: 样式/格式调整
- [ ] `refactor`: 代码重构
- [ ] `perf`: 性能优化
- [ ] `test`: Vitest 单测补充或修改
- [ ] `build`: 依赖、Vite 或构建配置变动
- [ ] `ci`: CI/CD 流水线变动
- [ ] `chore`: 其他日常维护

## 前端自检清单
- [ ] 提交信息与 PR 标题符合 Conventional Commits 规范
- [ ] 业务主外键 ID 类型统一声明为 `string`，已对接 `@atengk/core` 与后端 DTO/VO
- [ ] 样式遵循 TailwindCSS（禁 Preflight）+ `--el-*`/`--at-*` CSS 变量，无硬编码 Hex 色值，暗黑模式正常
- [ ] 无生产裸 `any`，所有副作用（监听器/定时器/Observer）均已成对销毁
- [ ] 本地已通过 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
