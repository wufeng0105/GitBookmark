# AGENTS.md — AI 辅助开发约定

面向在本仓库工作的 AI 编码助手。人类贡献者看 [README](README.md)（含「项目约定」一节的完整术语字典与注释规范，此处不重复）；本文只收录 AI 容易踩的架构约束、禁区与验证纪律。

## 命令与验证纪律

- `npm test` — Vitest 全量测试；任何代码改动后必须全绿
- `npm run lint` — ESLint；改完跑，0 告警交付
- `npx tsc --noEmit` — 类型检查（strict 全开 + noUnusedLocals/noUnusedParameters）
- `npm run build` — 产出 `dist/`；改动 `manifest.json` 或入口文件后必须验证构建

一次交付 = 上述四项全绿。禁止为迁就实现修改测试断言；断言失败先怀疑实现。

## 架构速览

三个运行面：`src/popup/`（弹窗）、`src/manage/`（管理页单页应用，无路由库）、`src/background/index.ts`（service worker，**唯一存储写者**）。UI 与后台只经 `sendMessage` 通信，消息契约由 `src/lib/types.ts` 的 `MessagePayloadMap` 与 `MessageReturnMap` 双表钉死——**新增 action 必须同时补两张表**，否则编译不过。共享常量在 `src/shared/constants.ts`；纯逻辑与 IO 原语在 `src/lib/`（不 import React）。

分层方向不可逆：`shared → lib → hooks → components/pages → entries`。设置页组件把版式约定固化在 API 里（`Panel` 的 `secondary`/`primary` 槽、`FieldRow` 的说明对齐），新增模块沿用同一落位规则，见 README「项目约定」。

## 硬性禁区

- **不要在 UI 层直接读写 `chrome.storage`。** 写队列持有在 background 上下文，UI 直写会产生跨上下文的读-改-写竞态；UI 只允许 import `lib/storage.ts` 中的纯函数（如 `bookmarkId`），数据读写一律走消息。
- **不要让 `lib/` 反向依赖 `hooks/` 或组件。** 发现可复用纯函数时下沉到 `lib/`，而不是让低层引用高层。
- **设置的唯一写入路径是 `updateSettings(patch, source)`**（`src/lib/storage.ts`），只提交变更字段的 patch，禁止整对象覆盖式写入。
- **分类只能出自 `CATEGORY_TAXONOMY`**（`src/lib/deepseek.ts`，8 大类 37 小类）；调整分类只改这一张表，prompt 由它生成。
- **manifest 权限保持最小集**（当前 `storage`/`activeTab`/`contextMenus` + 三个 host_permissions）；新增权限必须同步更新 README 的「权限说明」。

## 已知债务标记

`react-hooks/set-state-in-effect` 的 8 处 `eslint-disable-next-line` 是显式技术债，每处注释了豁免理由与重构方向。消除债务的方式 = 完成对应重构 + 删除该条豁免注释，由 lint 保证没有遗漏；禁止新增无理由的 suppression。
