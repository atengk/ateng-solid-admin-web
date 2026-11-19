# 贡献指南 (Contributing Guide)

感谢你参与 `ateng-solid-admin-web` 管理后台前端工程的研发与贡献！

---

## 1. 分支与开发模型

本仓库统一遵循 **`main`（稳定发布只读）+ `dev`（活跃开发）双分支** 模型：

1. 激活本地 Git Hooks（含 `commit-msg` 与 `pre-commit`）并基于 `dev` 拉取分支：
   ```bash
   git config core.hooksPath .githooks
   git checkout dev
   git pull origin dev
   git checkout -b feat/your-feature-name
   ```
2. 开发前请仔细阅读 [`AGENTS.md`](./AGENTS.md)、[`.agents/rules/contracts.md`](./.agents/rules/contracts.md) 与 [`.agents/rules/styling-and-ateng-ui.md`](./.agents/rules/styling-and-ateng-ui.md)；
3. 提交前必须通过四合一验证门禁（Node 22+、pnpm 11+）：
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```
4. 向本仓库 `dev` 分支发起 **Pull Request**。

---

## 2. Commit 提交规范

统一遵循 Conventional Commits：`<type>(<scope>): <清晰中文描述>`（推荐 `scope`：`api`、`auth`、`router`、`layout`、`system`、`styles`、`docs`、`ci`）。

```bash
# 交互式向导（Windows PowerShell / CMD 可直接用 bash 运行）
bash scripts/commit.sh

# 非交互式（先精准 git add 目标文件）
git add <file-path>
bash scripts/commit.sh -t feat -s auth -m "接入管理端登录与图形验证码交互" -y
```

---

## 3. Pull Request 与文档门禁

- 新增页面模块、公共 API（`src/api/*`）、环境变量或全局组件配置，须同步更新对应文档与 Vitest 单测；
- PR 标题须符合 Conventional Commits，推荐采用 **Squash and merge** 合入 `dev`。

---

## 4. 发版流程

仅允许在干净同步的 `main` 分支通过 GitHub Actions 网页端 `workflow_dispatch`、原生 `git tag vX.Y.Z` 或 `bash scripts/release.sh` 发起发版。
