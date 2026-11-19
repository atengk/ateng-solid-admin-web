# 领域文档消费与维护规范 (Domain Docs)

本仓库（`ateng-solid-admin-web`）为单一 Vue 3.5 + Vite SPA 应用，采用 **单上下文（Single-Context）** 领域文档结构，规范工程技能在探索和修改代码前如何读取和维护词汇表与架构决策记录（ADR）。

---

## 1. 探索与修改代码前必读

1. **根目录领域词汇表 [`CONTEXT.md`](../../CONTEXT.md)**：集中定义管理后台前端专属业务术语与 `_Avoid_` 禁用反模式词。严格恪守“纯词汇表（Glossary）”定位，仅描述概念是什么，不堆砌组件实现细节或配置代码。
2. **架构决策记录 [`docs/adr/`](../adr/README.md)**：查阅 TailwindCSS 无 Preflight 混用（ADR-0001）、手写强类型 API 与 `ateng-ui` 集成（ADR-0002）等核心决策。

---

## 2. 目录布局（Single-Context）

```text
ateng-solid-admin-web/
├── CONTEXT.md                          # 前端单一领域词汇表
├── docs/
│   ├── adr/                            # 前端架构决策记录 (ADR-0001 ~ N)
│   ├── agents/                         # Agent 技能协作配置
│   └── specs/                          # 前端工程约定与视图路由契约规范
└── src/                                # Vue 3.5 源码
```

---

## 3. 术语对齐与 ADR 治理规则

- **词汇表强一致**：命名路由、Store、API 模型、权限标识、Issue 标题与测试名称时，统一使用 [`CONTEXT.md`](../../CONTEXT.md) 中确立的标准术语，避免使用 `_Avoid_` 列出的同义异名。
- **内联演进**：新领域概念一旦确立，立即内联更新根目录 `CONTEXT.md`。
- **ADR 冲突显式声明**：仅在满足“难以逆转 + 缺上下文令人费解 + 存在真实权衡”三条件时新建 ADR；若方案与既有 ADR 冲突，必须显式指出（如 `> _与 ADR-0001 存在冲突，重审原因：..._`），严禁静默覆盖。
