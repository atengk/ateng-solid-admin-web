# 分诊标签词表 (Triage Labels)

工程技能通过 5 个标准分诊角色管理工单状态。本文件定义这些角色与当前仓库（`atengk/ateng-solid-admin-web`）GitHub Issues 实际标签的 1:1 映射：

| 技能标准角色 | 本仓库实际标签 | 含义与流转说明 |
| :--- | :--- | :--- |
| `needs-triage` | `needs-triage` | 待维护者评估前端需求边界与底层 `ateng-ui` 依赖情况 |
| `needs-info` | `needs-info` | 等待提报者补充页面交互、接口契约或复现步骤 |
| `ready-for-agent` | `ready-for-agent` | 规格完全明确且无未闭环底座阻塞，可直接由 AI Agent 执行 |
| `ready-for-human` | `ready-for-human` | 涉及视觉创意、强交互体验决策或人工审批，须人类工程师处理 |
| `wontfix` | `wontfix` | 经评估超出范围、不采纳或与既定前端架构冲突 |

当技能指令要求应用对应分诊角色时，统一使用上表“本仓库实际标签”列中的精确标签字符串。
