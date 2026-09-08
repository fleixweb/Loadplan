# 标准案例与算法对比实施计划

用户在认可“标准案例＋现有/开源算法对比”的下一步后要求继续实现。

## 目标与范围
在现有本地页面加入标准案例、手算依据、两算法对比、切换查看和一键案例检查。
保持原有保守同规格同朝向完整支撑模型，独立校验不放宽。
引入 MIT maxrects-packer 2.7.3 作为柜底二维矩形排布器，以原创适配层生成逐箱三维结果。
不是把二维库宣传为完整三维装柜算法，不声称开源方案一定更优。

## 数据契约
- ComparisonRun: id ('baseline'|'maxrects'), label, elapsedMs, result (PackingResult|null), error (string|undefined)。
- compareAlgorithms(container,cargo): ComparisonRun[]，两算法使用同一输入快照，独立计时（含本次结果校验），错误互不吞并。
- StandardCase: id,title,description,proof,container,cargo,expectedCount (number|null)。
- runCaseSuite(): SuiteEntry[]，记录各案例各算法数量、计时、规则校验和手算符合状态；样例无确切最优预期只能标为“仅规则校验”。

## Tasks
- [x] 1. 在 tests/maxrects.test.ts 先定义已知几何/载重/朝向/支撑测试，观察失败；src/domain/maxrects.ts 与 comparison.ts 实现真实开源适配和比较。
- [x] 2. src/domain/cases.ts 增加规则立方体8箱、层数4箱、载重3箱、直立0箱、侧放1箱、门宽0箱、混装6箱、虚构业务450箱（无最优预期），tests/cases.test.ts 验证独立手算结果及套件错误处理。
- [x] 3. Worker 增加 compare/suite 任务；UI 新增案例入口、比较表、明确两算法名称/开源来源、查看结果和过期处理。运行中的编辑禁用，超时有反馈。
- [x] 4. 浏览器测试案例加载、比较切换、套件运行、修改后过期禁用、导出正确来源、移动布局；类型/构建/单测/独立审查。
- [x] 5. 更新文档、第三方许可说明、本地 Git 检查点，保留现有本地开发入口。

## 验收原则
不通过独立校验的方案仍显示诊断，不可导出，不自动成为“更好方案”。
比较的是当前方法找到的方案，手算最优仅适用于有数学证明的规则案例。
时间是当前设备单次执行耗时，不是性能基准。无后台/数据库或业务数据上传。
