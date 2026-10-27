# QA 独立验证报告 · app/ 原生前端交付

验证人：Edward（QA）
被测对象：`E:/Project_System/app/`（index.html 87 / style.css 1812 / store.js 1474 / charts.js 350 / views.js 1087 / app.js 1305）
需求基准：`E:/Project_System/docs/PRD-项目管理系统.md`（v1.2）
测试产物：`E:/Project_System/qa-tmp/`（cdp.js + suite.js ~ suite6.js + 7 张截图 + raw-report.json）
执行环境：Windows + Microsoft Edge（Chromium）`--headless=new`，CDP 驱动真实 UI 事件，Node v22（零第三方依赖，自写 CDP 客户端）

---

## 结论

```
结论：CONDITIONAL PASS
用户 6 条约束：5/6 通过（第 5 条「完全对齐需求」未达成；「禁止脑补」这半句达成）
发现缺陷：致命 0 个 / 严重 3 个 / 一般 14 个
```

- 断言总数 **252**，通过 **244**，失败 **8**（其中 5 条对应真实缺陷，3 条是我断言口径过严，已在下文标明）
- 5 次页面加载（含 3 次刷新 / 1 次 reduced-motion 模拟加载）全程 **0 个 JS 异常、0 条 console 报错**
- 转 PASS 的条件：修掉 **S-1**（状态与进度联动覆盖用户选择）即可功能验收通过；**S-2 / S-3** 属 PRD P0 未实现，需主理人裁决是否在本次范围（若确认不在范围，改记为「未实现·非本次范围」，结论可直接 PASS）

---

## 一、用户 6 条硬性约束逐条判定

| # | 约束 | 判定 | 依据 |
|---|---|---|---|
| 1 | 严禁写死虚假列表数据；默认空列表；提交后才有数据；示例数据最多 1 条且标注可删除 | **PASS** | `grep -rniE 'SEED\|mockData\|demoData\|sampleData\|示例数据\|样例数据'` 零命中；首屏 `projects/tasks/requirements/defects/reviews` 全为 0；5 个模块全部渲染空状态引导文案；清空数据后回到全空（0/0/0/0/0） |
| 2 | 完整实现新增/编辑/单删/批删/必填校验/提交后自动刷新 | **PASS** | 四类实体（项目/任务/需求/缺陷）新增、编辑、单行删除（含二次确认取消/确认两路）、批量删除（勾选 2 条→按钮显示「批量删除 (2)」→确认删 2 条）、必填校验（空提交 3 条错误、结束日早于开始日、阻塞未填原因）、提交后 DOM 行数即时刷新，全部实测通过 |
| 3 | 所有交互组件必须绑定事件，不得有无效按钮；弹窗能关、表单能提交 | **PASS** | 遍历 8 个视图，渲染出的全部 `data-act` / `data-nav` 标识逐个对照 `app.js` 处理分支 + 逐个真实点击冒烟：**0 异常、0 无效**；弹窗 ×/Esc/遮罩 三种关闭方式均通过（`hidden` + `.modal-mask[hidden]{display:none}` 生效，`computed display:none`）；表单 4 类均可提交 |
| 4 | 数据用内存数组做临时仓库，增删改直接操作数组，前端自闭环 | **PASS** | `store.js` L54-66 `state = {projects:[],tasks:[], ...}` 为唯一真源；所有 CRUD 先 `push/filter/assign` 操作数组再 `persist()`；刷新后数据仍在（重载 3 次验证：项目名/任务/需求/缺陷/复盘手写内容/设置项全部保留） |
| 5 | 禁止脑补需求外组件/额外菜单/无关弹窗；页面结构/字段/按钮**完全对齐**需求 | **FAIL**（前半达成、后半未达成） | 「无脑补」达成：全站仅 1 个弹窗容器、菜单恰好 8 项、无 PRD 外菜单。但「完全对齐」未达成：甘特图 5 个 P0 功能点未实现、计划页内联编辑被弹窗取代、KPI 四卡定义被改写、需求筛选缺 2 项、缺陷表单缺 4 字段（详见 S-2/S-3/G-4/G-7/G-8） |
| 6 | 交付需说明测试流程 | — | 按分工由主理人负责，未验证 |

---

## 二、缺陷清单

### S-1【严重·功能缺陷】状态与进度联动会强制覆盖用户显式选择的状态

**现象**
把一条进度已 100% 的任务在编辑弹窗里把状态改成「已取消」或「进行中」，保存后状态被**静默改回「已完成」**，用户的选择丢失。

**复现步骤**
1. 计划页 → 新增任务 → 进度填 `100`（或状态选「已完成」）→ 创建（此时状态=已完成、进度=100，符合预期）
2. 点该行【编辑】→ 状态下拉选「已取消」→ 点【保存修改】
3. 期望：状态 = 已取消，进度 = 100
4. 实际：状态 = 已完成，进度 = 100（弹窗关闭、toast 提示"任务已更新"，但数据没变）
5. 同样操作把状态改为「进行中」→ 仍被改回「已完成」

**证据**（页面内断言输出）
```
【怀疑缺陷】把已完成任务改为「已取消」应保持已取消
  actual={"status":"已完成","progress":100}  expected={"status":"已取消","progress":100}
【怀疑缺陷】把已完成任务改为「进行中」应保持进行中（PRD 允许手动回退）
  actual={"status":"已完成","progress":100}  expected={"status":"进行中","progress":100}
【缺陷复现】进度 100% + 状态「已取消」被强制改回「已完成」
  actual={"status":"已完成","progress":100}  expected={"status":"已取消","progress":100}
```
同一根因在 stage5 与 stage6 两次独立复现，2/2 命中。

**定位线索**
`js/store.js` L398-412 `updateTask()`：
```js
405:    if (n.status === '已完成') n.progress = 100;
406:    else if (n.progress >= 100) n.status = '已完成';   // ← 命中此分支，覆盖用户在表单里选的状态
```
`js/store.js` L385-396 `addTask()` 有同样两行（L390-391），新建时选「已取消」+ 进度 100 也会被改成「已完成」。

**影响**
- 违反 PRD F1 规则「**允许手动回退**」；
- 「已取消」状态在进度 100% 的任务上不可达，而 `metrics()` / `planProgressAt()` 会**跳过「已取消」任务**（store.js L695、L858）—— 即"取消一个已完成任务"这条最常用的业务动作失效，直接影响进度与延期口径。
- 修复建议：只在「状态未被改动」时才做 `progress>=100 → 已完成` 的推导，例如比较 `patch.status === undefined`，或改为「进度改为 100 才推状态」。

---

### S-2【严重·PRD P0 未实现】甘特图实质只读：5 个 P0 功能点缺失

**现象** 甘特页只能"看"，PRD F2 规定的核心交互全部没有。用户点击/拖拽任务条无任何反应。

**证据**（页面内结构采集 + 静态检索）
```
ganttHasDragBar : false      // .gbar 上没有 draggable / data-drag
ganttZoomControls: 0         // 时间轴内没有任何 data-act 控件（无日/周/月档位切换）
```
```
grep -rniE 'mousedown|pointerdown|dragstart|draggable|ondrag|dependency|依赖|基线' app/js/*.js
  → 仅命中注释里的"无依赖"与折线图例文案"计划基线"，无任何事件绑定代码
```

**PRD 对照**（F2，优先级 P0）

| PRD 功能点 | 实现 |
|---|---|
| 1 双栏布局 + 同步滚动 | ✅ |
| 2 日/周/月三档切换 | ❌ 只有周刻度，无切换控件 |
| 3 拖拽排期（拖条移动/改工期/回写字段） | ❌ 完全未实现 |
| 4 依赖箭头 FS + 冲突标红 | ❌ 未实现 |
| 5 关键路径描边 | ❌ 未实现 |
| 6 基线灰条对比 | ❌ 未实现 |
| 7 今日线 / 过期斜纹 | ✅ 今日线有；过期仅换红色，无斜纹 |
| 8 里程碑独立泳道 | ⚠️ 菱形内联在任务条上，无单独泳道 |
| 9 进度填充 + 状态配色 | ✅ |

**定位线索** `js/views.js` L549-690 `gantt()` 纯渲染函数，不带任何事件；`js/app.js` `bindEvents()` 内无 gantt 相关监听。

---

### S-3【严重·PRD 明显偏离】计划页无表格内联编辑，改为弹窗

**现象** 改任务任一字段（进度、状态、工时）都必须点【编辑】打开居中弹窗，与 PRD 的轻量原则直接冲突。

**证据**
```
planHasInlineEdit : false    // .data-table 内无 [contenteditable]
planRowsDraggable : false    // 行不可拖拽
```
**PRD 原文**（F1 功能点 3）：「**内联编辑**：除描述外所有字段在列表内直接改，**不弹窗**（轻量原则关键点）。」
**定位线索** `js/app.js` L505-582 `openEntityForm()` 全走 `openModal`；`views.js` L516-535 `taskRow()` 每行只有【编辑】【删除】两个 link-btn，无可编辑单元格。

---

### G-1【一般】需求/缺陷编号由数组下标生成，删除或新增后编号重排

**现象** 需求编号 `REQ-01/02/03` 在删除第一条后变成 `REQ-01/02`（原 REQ-02 变成 REQ-01）；缺陷编号按创建时间**倒序**取下标，导致最新的缺陷是 `BUG-01`，且每新增一条所有旧编号全部后移。

**证据**
```
before=["REQ-01","REQ-02","REQ-03"]  after=["REQ-01","REQ-02"]  剩余=["需求二","需求三"]
缺陷编号（按创建时间倒序渲染）: ["BUG-01","BUG-02"]   // 创建顺序是 缺陷一 → 缺陷二
```
**定位线索** `js/views.js` L698 `all.map(function (r, i) { return { r: r, code: S.reqCode(r, i) }; })`；`js/store.js` L461-463 `reqCode(req,index)`；`js/views.js` L823 `'BUG-' + U.pad(i + 1)`。编号未落到实体字段上，只是渲染期的序号。

---

### G-2【一般·PRD 6.6 偏离】顶栏缺「全局搜索」，状态条缺「刷新按钮」

**证据**
```
【PRD 6.6 对照】顶栏元素: ["SELECT:projectSelect","BUTTON:btnNewProjectTop"]
【PRD 6.6 对照】状态条: 数据更新时间 2026-10-26 13:45 当前项目 筛选项目 Esc 关闭弹窗 · / 聚焦搜索
状态条按钮: []
```
PRD 6.6 规定顶栏 = 项目切换器、健康度灯、**全局搜索**、时间、设置入口；状态条 = 数据刷新时间、**刷新按钮**、快捷键提示。实测顶栏只有 2 个控件、状态条 0 个按钮。
**定位线索** `index.html` L20-44（topbar）、L55-61（statusbar）。

---

### G-3【一般·体验】关键字筛选仍有匹配结果时没有「清除筛选」入口

**现象** `清除筛选` 按钮只在"0 条匹配"的空状态里渲染。当搜索框有内容但仍能搜到结果时，页面上没有任何一键清除入口，用户只能手动删字符（无 × 清空图标）。
**证据**
```
【观察】关键字有匹配时是否存在「清除筛选」入口: hasClearWhenMatched=false
0 条匹配时出现「清除筛选」按钮: true（点击后恢复 2 行、搜索框清空）
```
**定位线索** `js/views.js` L481-487：`clear-filter-plan` 按钮在 `!list.length` 分支内。

---

### G-4【一般·PRD F5.2 偏离】仪表盘四张 KPI 卡的定义被改写

**证据**（实测卡内容）
```
整体进度   23.8%  计划 100% · 偏差 -76.2 pp          ✅ 与 PRD 一致
延期任务数  1个    阻塞 0 个 · 占未完成 50%            ⚠️ PRD 是「任务概览：总数/已完成/进行中/未开始/延期/阻塞」
需求覆盖率  0%     已通过 2 个 · 已排期 0 个            ⚠️ PRD 是「需求概览：已通过/已上线/覆盖率/变更次数」
缺陷存量    0个    致命 0 · 严重 0 · 本周新增 1         ⚠️ 缺 PRD 要求的「本周关闭」
```
缺失的用户可见指标：任务总数 / 进行中 / 未开始 计数、「本周关闭缺陷数」、「需求变更次数」（后者 F3.6 整体未实现）。
**定位线索** `js/views.js` L321-347（四个 `kpiCard({...})`）。

---

### G-5【一般·PRD 6.7 偏离】图表交互全部缺失（只画不交互）

| PRD 条款 | 要求 | 实现 |
|---|---|---|
| 6.7.2 热力矩阵 | 点击弹出玻璃浮层显示该周任务清单 | ❌ 只有 `data-tip` 文本提示；hover `scale(1.12)` ✅ |
| 6.7.3 折线图 | hover 十字准线 + 玻璃浮层（周次/计划/实际/偏差） | ❌ 无（`grep crosshair\|准线` 零命中） |
| 6.7.5 风险日历 | 点击滑出当日事件列表（translateX 320ms） | ❌ 只有 hover `scale(1.06)` + `data-tip` |
| 6.7.6 KPI 卡 | 数值变更时滚动计数 600ms | ❌ 数值直出，无插值 |

**定位线索** `js/charts.js` L242-269（heat）、L295-320（calendar）；`js/app.js` 无对应 click 处理分支。

---

### G-6【一般·PRD F5.5 偏离】里程碑看板未限定「未来 8 周」

**证据** 建了 2026-11-15 与 **2027-06-30**（远超 8 周）两个里程碑，看板两个都列出：
```
【PRD F5.5 对照】里程碑看板列出项: ["里程碑-近期","里程碑-远期"]  状态=["按期","按期"]
```
**定位线索** `js/store.js` L1019-1024：`m.milestones = tasks.filter(t => t.milestone)...` 无时间窗过滤。

---

### G-7【一般·PRD F3.1 偏离】需求筛选缺「负责人」「来源」两项

**证据** `reqFilters = ["priority","status","kw"]`；PRD F3.1 要求「按状态/优先级/**负责人**/**来源**筛选，支持关键词搜索」。
**定位线索** `js/views.js` L726-730（只有 2 个 `selectBox`）。

---

### G-8【一般·PRD F4.1 偏离】缺陷表单缺 4 个字段

**证据** 实测表单字段：`["title","severity","status","owner","foundVersion","relatedReqId"]`
PRD F4.1 要求：标题、严重级别、**复现步骤**、发现版本、**环境**、指派人、关联需求/**关联任务**、**附件（截图）**。缺 复现步骤 / 环境 / 关联任务 / 附件。
**定位线索** `js/app.js` L313-322 `FORMS.bug.fields`。

---

### G-9【一般·PRD F1.7 偏离】批量操作只有「批量删除」

**证据** `planBatchActions = ["new-task","batch-del-task","toggle-group"]`
PRD F1.7 要求「批量指派负责人、批量改期（顺延 N 天）、批量改状态」—— 三项全缺。
**定位线索** `js/views.js` L466-478（toolbar 只有 `batch-del-task`）。

---

### G-10【一般·PRD F6 偏离】设置中心只有 3 块

**证据** `settingsPanels = ["项目基础信息","复盘规则","危险区"]`（代码注释自陈"F6 简版"）
PRD F6（P0）要求：项目设置、**状态自定义**、**字段自定义**、提醒规则、复盘规则、**模板管理**、**数据与导出（Excel/CSV + 数据字典）**。
**定位线索** `js/views.js` L1004-1046 `settings()`。

---

### G-11【一般·PRD 7.5/7.6 偏离】性能分级降级与"降光效"未实现

**证据**
```
grep -rn 'requestIdleCallback|hardwareConcurrency|fps|FPS' app/js/*.js
  → 仅命中注释 "30fps"，无 FPS 采样、无分级降级、无 requestIdleCallback 挂载
```
PRD 7.5 要求 FPS 45–55 → L3 降 15fps、FPS<45 → 关闭 L3、FPS<30 → 关闭 L2；L3 需在 `requestIdleCallback` 挂载不阻塞 LCP；7.6 要求 `hardwareConcurrency ≤ 2` 降级 + 「降光效」开关。

---

### G-12【一般·PRD 7.2.6 偏离】交互唤醒时 sin 振幅用倍数缩放，不是「降至 1px」

**证据** `js/app.js` L1209-1212：`Motion.setAmpScale(0.45)`，振幅 2/3/4px × 0.45 = **0.9 / 1.35 / 1.8px**；PRD 7.2.6 明确「L2 元素 sin 振幅降至 **1px**」。实际效果可用，但不符合字面规范。

---

### G-13【一般·文案与布局不符】复盘「手写三栏」实际是纵向三行

**证据** `style.css` L1486 `.write-grid { display:flex; flex-direction:column; gap:14px; }` → 3 个 textarea 全宽纵向堆叠（截图 `06-review.png` 可见）；而面板标题写「手写三栏（每栏 ≤ 500 字，全空也能保存）」。

---

### G-14【一般·视觉】多数据页面内容不撑满视口，下方大片空白

**证据** 截图 `05-gantt.png`：甘特图面板只占视口上 1/3，下方约 60% 为纯背景；`03-plan-table.png`（缺陷页 1 行数据）同样。非崩溃性问题，但"驾驶舱"观感偏空。

---

## 三、实测通过项（正向证据汇总）

**功能**
- 首屏真·空：`projects/tasks/requirements/defects/reviews` = 0/0/0/0/0；5 个模块空状态文案齐备：`还没有任务` / `还没有任务可以排期` / `需求池还是空的` / `还没有登记缺陷` / `还没有任何复盘记录`
- 新建项目：空提交 → 弹窗**不关** + 3 条错误（name/start/end）→ 补齐 → 创建成功、弹窗关闭、toast「项目已创建」、顶栏切换器同步
- 新建任务 3 条拦截规则全部生效：空提交（title/start/end 三错）、`结束日不得早于开始日`、`状态为阻塞时必须填写阻塞原因`
- 编辑任务：表单正确回填（标题/进度/状态/开始日）→ 保存后 Store 与列表 DOM **立即**反映（`任务A-已改名` + `55%`）
- 单行删除：二次确认 → **取消不删**（条数不变）→ **确认才删**（4→3，行数同步 3，toast「任务已删除」）
- 批量删除：勾选 2 条 → 按钮文案变 `批量删除 (2)` 并由 disabled 转启用 → 确认弹窗写明「将删除已勾选的 2 条」、按钮「删除 2 条」→ 确认后精确删 2 条、勾选态清空、幸存者正确
- 弹窗关闭：`×` / `Esc` / 点击遮罩 三条路径全部有效
- 刷新持久化：重载 4 次，项目名/任务/需求标题/缺陷标题/复盘手写正文/`reviewDay=3` 全部保留；`localStorage['projsys.v1']` 与内存一致
- 仪表盘：4 张 KPI 卡 + 双环 + 折线 + 热力矩阵 + 优先级 4 行 + 风险日历 27 格 + 里程碑 + 复盘状态 + 风险提醒；**改一条任务进度后 KPI 主数值 `before ≠ after`** 且 `progress=100` 自动置「已完成」
- 复盘闭环：保存 → 时间线出现 1 条 → 快照含 8 项要点 → 展开看到手写正文 → 编辑回填原文 → 再存是**更新而非新增**（count 恒为 1）→ 删除（二次确认）→ 回到空状态；`reviewMarkdown()` 输出 >300 字符，含 `| 指标 | 数值 |` 表格、手写反思正文、快照指标行，UI 导出按钮实际触发 `a.click()` 下载
- 设置页：`form[data-form="settings"]` 名称为空拦截（`请填写项目名称`）、结束日早于开始日拦截（`不得早于`）、正常保存后 5 个字段全部落库 + toast；`reset-data` 二次确认后 5 个集合归零、localStorage 同步归零、回到总览空状态；清空后可**再次**新建项目（自闭环）
- 删除项目级联：确认文案「…任务、需求、缺陷、复盘会一并删除」→ 内存与 localStorage 双双归零
- 统计口径：工时加权实际进度 `9/10 = 90%`（空工时按 1 计）；需求覆盖率 `已排期已通过/已通过 = 1/2 = 50%`，草稿不计；关闭缺陷写入 `closedAt`、存量 −1、本周关闭 +1、严重存量 −1；删除任务后需求 `taskIds` 自动清理、覆盖率随之降为 0
- 筛选：搜索「登录」→ 1 行且内容正确、**焦点不丢、光标在末尾**；按状态筛选 1 行；`check-all` 只勾选**筛选后**结果（1 条，不是全部 3 条）
- 安全性：任务标题填 `<img src=x onerror="window.__XSS__=1">恶意标题` → 列表与仪表盘均**未执行脚本**、未注入 `img`，按原文转义显示

**按钮全覆盖审计**
- 渲染出的全部 `data-act`：`new-project / open-project / edit-project / del-project / new-task / edit-task / del-task / batch-del-task / toggle-group / check-all / check-row / new-req / edit-req / del-req / batch-del-req / new-bug / edit-bug / del-bug / batch-del-bug / save-review / export-review / fill-blocked / toggle-only-written / focus-write / reset-data` —— 与 `app.js` `switch(act)` 的 `case` 集合逐一比对，**无遗漏**
- 渲染出的全部 `data-nav`：总览/仪表盘/计划/甘特/需求/缺陷/复盘/设置 —— 全部命中 `navTo` 白名单
- 直接绑定的 3 个按钮：`#modalClose`、`#btnNewProjectTop`、设置页 `button[type=submit]` —— 均有 `addEventListener`
- 逐个真实点击冒烟（危险操作 `reset-data` 跳过）：**0 异常、0 无效果**

**视觉与动效**
- 背景三层齐备：`fire-band fire-a` + `fire-band fire-b` + `particle-canvas` + `grid-floor`（实际 4 个元素/3 层）；`.bg-layer { pointer-events: none }` 实测 `computed = none`
- 粒子 canvas 可正常 `getContext('2d')`，数量 60–80（代码 `Math.max(60, Math.min(80, n))`），限 30fps，DPR ≤ 2
- **全站无 `width/height/top/left/box-shadow` 过渡**：遍历全部 `cssRules` 的 `transition-property` 校验，结果为空数组 ✅（PRD 7.1 硬规则）
- 12 个 `@keyframes` 逐个审计：全部只动 `transform` / `opacity` / `stroke-dashoffset` ✅
- 面板光晕呼吸：`::after` `animationName=breathe`、`duration=3.5s`、`timing=ease-in-out`、`iteration=infinite` ✅；`--t-breathe: 3.5s` ✅；相邻面板 `animation-delay: -0.6s / -1.2s / -1.9s` ✅
- 面板 sin 缓动：13 个 `.sin` 元素被**同一 rAF 循环**写入内联 `transform`，同一时刻各元素位移互不相同（`-0.98 / -1.6 / -1.71 / -0.4 px`）→ 相位错开、波浪式 ✅
- 透视图标：`perspective: 520px` + `svg { transform: matrix3d(0.9703…) }`（= `rotateY(14deg)`）✅
- `will-change` 同屏 4 个（`.fire-band`×2 / `.grid-floor` / `.view`）≤ PRD 上限 8 ✅
- `prefers-reduced-motion: reduce` **功能性实测**（CDP `Emulation.setEmulatedMedia` 真实模拟）：`matchMedia(...).matches=true`、`.fire-a/.grid-floor/.particle-canvas` 全部 `display:none`、所有 `.sin` 内联 `transform` 为空（sin 归零）、**降级后仍可正常新建任务**（功能可用）✅
- 焦点环：`outline: 2px solid var(--amber-500); outline-offset: 2px` ✅

---

## 四、我实际执行过的验证手段清单

**1. 静态检查（grep，`E:/Project_System/app`）**
| 检查项 | 命令要点 | 结果 |
|---|---|---|
| 外链/模块 | `grep -rnoE 'https?://\|cdn\.\|type="module"\|import[ {]\|require\('` | 唯 1 命中为 `index.html:81` 的注释「禁止 type="module"」；`performance.getEntriesByType('resource')` 实测 4 个资源全为 `file://` |
| 硬编码种子数据 | `grep -rniE 'SEED\|seed\|mockData\|demoData\|sampleData\|const x=[{\|示例数据\|样例数据'` | 零命中 |
| 拖拽/内联编辑/依赖/基线 | `grep -rniE 'mousedown\|pointerdown\|dragstart\|draggable\|baseline\|依赖\|contenteditable\|dblclick'` | 仅注释与图例文案，**功能确未实现** |
| 性能降级 | `grep -rn 'requestIdleCallback\|hardwareConcurrency\|fps'` | 仅注释，未实现 |
| transition 属性 | 提取全部 `transition:` 声明 | 只含 transform/opacity/stroke-dashoffset/background-color/border-color/filter |
| keyframes 属性 | 逐个展开 12 个 `@keyframes` | 只含 transform/opacity/stroke-dashoffset |
| will-change / focus-visible / [hidden] | 逐条 grep | 3 处 will-change；focus-visible 2px 暖金+2px offset；`.modal-mask[hidden]{display:none}`、`.tip[hidden]{display:none}` 均存在 |

**2. 真实浏览器 E2E（核心手段）**
自写零依赖 CDP 客户端（Node 22 内置 `fetch` + `WebSocket`）驱动 Edge `--headless=new`：
- 启动 `--remote-debugging-port` → `/json/list` 取 target → `Runtime.enable` / `Log.enable` / `Page.enable`
- `Runtime.evaluate` 注入页面内断言脚本；所有交互走**真实 DOM 事件**：`el.click()`、`el.value=` + `dispatchEvent(new Event('input'/'change'))`、`KeyboardEvent('Escape')`、`MouseEvent('click')` 于遮罩
- `Page.navigate` 重载 4 次验证持久化；`Emulation.setEmulatedMedia` 模拟 reduced-motion；`Emulation.setDeviceMetricsOverride 1680×1050`
- 订阅 `Runtime.exceptionThrown` / `Runtime.consoleAPICalled` / `Log.entryAdded` 收集全部报错
- 6 个测试阶段（`suite.js` → `suite6.js`），**共 252 条断言**

**3. 断言覆盖矩阵（252 条，实测计数）**
| 阶段 | 内容 | 断言数 | 失败 |
|---|---|---|---|
| S1 `suite.js` | 首屏/静态/约束1/项目CRUD/任务3条校验/编辑/单删取消+确认/批删/弹窗3种关闭/仪表盘KPI联动/需求/缺陷/复盘CRUD+导出/设置/按钮全覆盖审计/视觉动效/localStorage | 141 | 0 |
| S2 `suite2.js` | 重载持久化、全 `data-act` 逐个冒烟点击、清空全部数据、清空后重建 | 20 | 0 |
| S3 `suite3.js` | 空状态面板标题、动效实测（呼吸 3.5s / sin 单 rAF / rAF 频率 / will-change 计数）、PRD 结构采集、复盘落盘 | 20 | 0 |
| S4 `suite4.js` | 复盘重载验证、`prefers-reduced-motion` 真实模拟降级 + 降级后功能可用 | 12 | 0 |
| S5 `suite5.js` | 状态联动找茬、编号稳定性、XSS、级联删除、搜索/筛选/焦点、check-all 边界、PRD 6.6 对照、工时聚合口径 | 31 | 7 |
| S6 `suite6.js` | 清除筛时机、已取消可达性、缺陷关闭链路、覆盖率口径、任务删除清理关联、KPI vs F5.2、里程碑 8 周窗、总览 F13 | 28 | 1 |
| **合计** | | **252** | **8** |

**4. 截图取证（`E:/Project_System/qa-tmp/`）**
`01-overview-empty.png`（首屏空状态，证明确无假数据）、`02-project-form-validation.png`（空提交 3 条错误提示、弹窗未关）、`03-plan-table.png`、`04-dashboard.png`、`05-gantt.png`、`06-review.png`、`07-delete-confirm.png`。已人工逐张目视检查（由多模态读图确认无元素重叠/文字截断/图表渲染失败）。

**5. 代码走查**
通读 6 个源文件全部 6115 行（store.js / charts.js / views.js / app.js / index.html / style.css 关键段落），逐条比对 PRD 第 3/4/6/7 章。

---

## 五、我没能验证的项（诚实说明）

| 项 | 为什么没验 | 影响 |
|---|---|---|
| 真实帧率（60fps / 掉帧判定 / PRD 7.5 FPS 分级） | headless 下 rAF 被浏览器节流（实测 500ms 仅 4 次回调），无法测 FPS | G-11 只能凭代码走查判"未实现"，无法给"实际跑多少帧"的数据；需真机非 headless 复测 |
| 粒子视觉效果（30fps 平滑度、DPR≤2 清晰度、数量观感） | canvas 合成不可视，截图只能看到光点；未做像素级采样 | 只验证了 canvas 存在、`getContext('2d')` 成功、代码里 60–80 与 30fps 限制正确 |
| hover 类交互（卡片聚焦、图标回正、优先条聚焦、热力格放大、日历格放大） | CDP 只发合成 click，无法可靠复现真实鼠标轨迹做视觉断言 | 仅核对了 CSS 规则与 `app.js` 的 `mouseover` 委托代码存在，未做视觉验证 |
| 剪贴板实际写入内容 | headless 无剪贴板授权，`navigator.clipboard.writeText` 会走 fallback `execCommand` | 改为直接断言 `Store.reviewMarkdown()` 返回值（>300 字符 + 表格 + 手写 + 快照），并验证 `a.click()` 被调用；**未验证 .md 文件字节是否真的落盘** |
| 甘特图 1000 任务性能（PRD 7.5 FPS≥45） | 未做压力测试构造 | 未验证 |
| 移动端 / 窄视口响应式（<1280px 单列流式） | 只跑了 1680×1050 一种视口 | `@media` 规则存在（1440/1600/1280 断点），但未实测布局 |
| 像素级视觉对齐（6.2 的 30+ 色值、6.8 字号表逐条比对） | 抽样验证为主 | 只核对了核心 token（ember/amber/cyan/green/text 系列）与布局栅格跨度 |
| 跨浏览器（Chrome / Firefox / Safari）、macOS | 只有 Windows + Edge(Chromium) | Chromium 内核下通过，其他内核未验证 |
| 无障碍（读屏器、键盘全流程 Tab 走查、对比度实测值） | 未接读屏器，未测实际对比度数值 | 只验证了 `focus-visible` 样式、`role="dialog"` `aria-modal` `aria-label` 属性存在 |

---

## 六、给工程师的修复优先级建议

1. **P0** `store.js` L405-407 / L390-392：状态联动不要覆盖用户显式传入的 `status`（`patch.status === undefined` 时才推导）→ 修完 S-1，功能验收即可 PASS
2. **P1** 需求/缺陷编号落库为实体字段（`store.js` 新增 `code` 字段，按项目内自增序号生成，不随删除/排序变化）→ G-1
3. **P1** 甘特图与内联编辑：若确认在本次范围，需补 F2.2/F2.3/F2.4/F2.5/F2.6 与 F1.3；若不在范围，请在交付说明中明确标注"未实现·非本次范围"→ S-2 / S-3
4. **P2** 顶栏全局搜索 + 状态条刷新按钮（PRD 6.6）→ G-2
5. **P2** 搜索框常驻「清除」入口（输入非空即显示 ×）→ G-3
6. **P2** 复盘「手写三栏」文案改为「手写三块」或把布局改成 3 列 → G-13（成本最低，建议顺手改）
