# 断言脚本（回归用）

这 10 个脚本是开发阶段与 QA 三轮复验时用的 jsdom 断言集，共 **233 条断言**，全部针对 `../app/` 的 Store 层与页面渲染做验证。

> 改动记录（外观功能）：新增 `appearance.js`（32 条），覆盖默认主题/动效、
> 设置页外观面板结构、主题切换、动效开关、localStorage 持久化、旧备份兼容与 reset。
> 原有 201 条断言保持不变。

> 改动记录（删除式改造）：已从仪表盘删除「负荷热力矩阵」与「里程碑看板」两个板块，
> 原来的 `g6.js`（里程碑 8 周折叠 5 条）随之失效，已改写为 `dash-remove.js`
> （16 条：两个板块删干净 + 里程碑功能仍可用），`test.js` 同步把「有热力矩阵」改为两条反向断言（72 → 73）。

## 依赖

```bash
# 方式一：在本目录装一份
npm i jsdom

# 方式二：复用封装工程的依赖（本仓库已有 build/package.json 声明 jsdom）
cd ../build && npm install
# 之后运行时把 NODE_PATH 指向它
```

脚本里的应用路径是**相对解析**的（`path.resolve(__dirname, '..', 'app')`），克隆到任意目录都能直接跑，无需改代码。

## 运行

```bash
# 依赖装在 tests/ 下时
node test.js

# 复用 build/node_modules 时（Windows Git Bash）
export NODE_PATH="$PWD/../build/node_modules"
node test.js

# 复用 build/node_modules 时（PowerShell）
$env:NODE_PATH = "$PWD\..\build\node_modules"; node test.js
```

| 脚本 | 断言数 | 覆盖内容 |
|---|---|---|
| `test.js` | 73 | 主链路：CRUD / 弹窗 / 校验 / 路由 / 持久化 / 复盘 |
| `s1.js` | 9 | S-1 状态-进度联动 |
| `r1.js` | 18 | R-1 只改标题不改状态（A/B/C 三组） |
| `regress2.js` | 27 | G-1~G-8 回归（编号稳定 / 全局搜索 / 刷新等） |
| `dash-remove.js` | 16 | 删除式改造：仪表盘已删两个板块 + 里程碑功能仍在（原 g6.js） |
| `g8.js` | 5 | 缺陷表单新字段 |
| `g1mig.js` | 6 | 旧数据 seq 回填迁移 |
| `g2keys.js` | 3 | 全局搜索快捷键 |
| `backup.js` | 44 | 数据备份导出/导入（结构 / 校验 / 脏数据 / 覆盖恢复 / 下载） |
| `appearance.js` | 32 | 外观功能（主题切换 / 动效开关 / 持久化 / 旧备份兼容） |
| **合计** | **233** | — |

## 注意

- 这些是**断言脚本**，不是测试框架；输出靠 `console.log` 的 PASS/FAIL 计数。
- 浏览器端行为（动画、`backdrop-filter`、真实点击）不在这套脚本覆盖范围内，那部分由 QA 用无头 Edge + CDP 验证，结论见 `../docs/qa/`。
- `test.js` 里有两处断言依赖「S-1 语义」：只改进度 → 自动置已完成；显式改状态 → 进度保持原值。改动规则时这两条要同步更新。
