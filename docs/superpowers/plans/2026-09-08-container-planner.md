# Container Planner Implementation Plan

**Goal:** 实现可在本地浏览器操作的纸箱散装原型。
**Architecture:** React 控制输入与结果，纯 TypeScript 计算/校验，Three.js 查看器只消费结果。
**Tech Stack:** React, Vite, TypeScript, Three.js, Vitest, Playwright。
**Spec:** ../../design.md

## Global Constraints
内部毫米、千克；X 柜长、Y 柜宽、Z 向上；最大 1500 箱、30 个 SKU，有限运行时间；本地处理。

## Task 1 — model / solver / validation
- [x] 创建 src/domain/types.ts 定义稳定输入输出接口。
- [x] tests/packing.test.ts 先测试：1000mm 立方柜装 500mm 箱恰好 8 个、8kg 上限不能装超、直立不允许高度换轴、层数受限。
- [x] src/domain/packing.ts 导出 pack(container,cargo):PackingResult、validateInput(container,cargo):string[]、validateResult(result):ValidationReport。
- [x] 使用同规格完整支撑堆垛和二维空间切分生成方案，多排序取最大已装体积；未装货物有数量/原因。
- [x] 独立验证器发现越界、重叠、非法方向、超层数、缺失支撑、数量/ID 不匹配和超重。
- [x] 测试必须运行并通过，不与 UI 模块耦合。

## Task 2 — viewer / editor
- [x] src/domain/sample.ts 提供模拟货物和可编辑柜型。
- [x] src/components/ContainerViewer.tsx 消费 PackingResult，映射业务 Z-up 至 Three.js Y-up，清理 WebGL 资源。
- [x] src/App.tsx 输入编辑、计算、结果过期、指标、箱体选择、分层、文件导入导出与错误反馈。
- [x] src/styles.css 响应式工具布局，表格和移动端无横向页面溢出。
- [x] 使用真实浏览器检查主流程与 3D 渲染，不把页面状态伪装为实际结果。

## Task 3 — review / handoff
- [x] npm test；npm run build；npm run test:ui。
- [x] 检查桌面和移动端截图，修复可见问题。
- [x] 独立代理审查算法/校验与交互，修复实质缺陷。
- [x] README 中文使用步骤、数据模型、限制、Vercel 构建方式；保存本地 Git 检查点。

## Decisions
用户没有现有工程；新建独立仓库，不改动用户目录现有代码。
无内置 image_gen；使用代码原生工具界面，无生成图片依赖。
首版用 TS 算法保证本地可用。原先讨论的 Python 库保留为后续适配选项，未宣称已集成。

## Execution log
- Task 1：代理 packing_engine 实现并通过 29 项几何/约束/篡改/压力测试。
- Task 2：根代理完成 React 编辑器、Web Worker、3D 查看器、导入导出、移动端。
- 独立 review_core 审查没有发现常规干货柜范围内阻断问题；自定义尺寸视角边界已用随柜尺寸变化的 camera near/far/distance 修正。
- 浏览器插件不可用，使用 Playwright Chromium。首轮发现移动端隐藏说明导致按钮无障碍名称变化，已添加显式 aria-label；视口变更后会重新适配相机。
- 图像生成不可用，未声称与生成概念图对照；实际桌面和移动端截图直接检查。
