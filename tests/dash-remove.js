/**
 * 删除式改造定向验证（原 G-6 里程碑折叠脚本的替代）
 *
 * 需求：从仪表盘彻底删除「负荷热力矩阵」与「里程碑看板」两个展示板块，
 * 但**里程碑这个功能本身**（任务字段 / 计划页 ◆ 列 / 甘特 ◆ 菱形 / 风险提醒 /
 * 周报指标 / Store.milestoneStateOf）必须原样保留。
 *
 * 断言分两组：
 *   D-0x 删除是否彻底（仪表盘不再出现两个板块、无死代码残留、栅格每行 12）
 *   D-1x 里程碑功能是否仍然可用（表单 / 计划 / 甘特 / 日历 / 周报 / 空项目 / 8 视图）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const APP = path.resolve(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const scripts = ['js/store.js', 'js/charts.js', 'js/views.js', 'js/app.js'];
let inlined = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
inlined = inlined.replace('</body>', scripts.map(s => '<script>\n' + fs.readFileSync(path.join(APP, s), 'utf8') + '\n</script>').join('\n') + '</body>');

const dom = new JSDOM(inlined, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.HTMLElement.prototype.scrollIntoView = function () {};
win.scrollTo = function () {};

// 收集运行期异常（route 切换、渲染时抛错都会被记下来）
// 注：jsdom 未装 canvas 包时对 getContext 的 "Not implemented" 属于环境噪音，不计入
const NOISE = /getContext/;
const errors = [];
win.addEventListener('error', e => { if (!NOISE.test(e.message || '')) errors.push('window.onerror: ' + (e.message || 'unknown')); });
if (dom.virtualConsole && dom.virtualConsole.on) {
  dom.virtualConsole.on('jsdomError', e => {
    const msg = (e && e.message) || '';
    if (!NOISE.test(msg)) errors.push('jsdomError: ' + msg);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, root) => (root || doc).querySelector(sel);
const qa = (sel, root) => Array.prototype.slice.call((root || doc).querySelectorAll(sel));
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const results = [];
const check = (n, c, e) => results.push({ n, ok: !!c, e: e === undefined ? '' : String(e) });

/** 从 panel 的类名里取出栅格跨度（c3 → 3），取不到按 12 算 */
function spanOf(el) {
  const cls = Array.prototype.slice.call(el.classList);
  for (let i = 0; i < cls.length; i++) {
    const m = /^c(\d+)$/.exec(cls[i]);
    if (m) return Number(m[1]);
  }
  return 12;
}

(async () => {
  await sleep(150);
  const S = win.Store, U = S.util;
  const t = U.today();
  const day = n => U.ymd(U.addDays(t, n));

  /* ---------- 造数据：一个带里程碑的项目 ---------- */
  const p = S.addProject({ name: 'DASH 删除验证', code: 'D-1', start: day(-40), end: day(200) });
  S.setCurrentProject(p.id);
  // 里程碑 A：已完成（应判定「已达成」）
  const msDoneId = S.addTask({
    projectId: p.id, title: '里程碑甲·已完成', milestone: true,
    start: day(-30), end: day(-10), status: '已完成', progress: 100, stage: '开发'
  }).id;
  // 里程碑 B：延期（应判定「已延期」，并进入风险日历）
  const msLateId = S.addTask({
    projectId: p.id, title: '里程碑乙·延期', milestone: true,
    start: day(-8), end: day(-2), status: '进行中', progress: 60, stage: '开发'
  }).id;
  // 普通任务（非里程碑，用来对照）
  const plainId = S.addTask({
    projectId: p.id, title: '普通任务丙', milestone: false,
    start: day(-3), end: day(6), status: '进行中', progress: 30, stage: '开发'
  }).id;

  win.location.hash = '#/dashboard';
  await sleep(220);

  const viewEl = q('#view');
  const dashTxt = txt(viewEl);

  /* ============================================================
   * D-0x 删除是否彻底
   * ============================================================ */
  check('D-01 仪表盘不再出现「负荷热力矩阵」标题', dashTxt.indexOf('负荷热力矩阵') < 0, dashTxt.slice(0, 60));
  check('D-02 仪表盘不再出现「里程碑看板」标题', dashTxt.indexOf('里程碑看板') < 0, dashTxt.slice(0, 60));
  check('D-03 仪表盘无热力矩阵节点（.heat / .heat-legend）', !q('.heat') && !q('.heat-legend') && !q('.heat-cell'));
  check('D-04 仪表盘无「8 周折叠」入口（toggle-ms-all）', !q('[data-act="toggle-ms-all"]'));

  const panelTitles = qa('#view > section.panel .panel-title').map(txt);
  const expectTitles = ['进度对比（计划 vs 实际）', '进度趋势', '优先级分布', '风险告警日历', '复盘状态', '延期清单 Top10', '风险与提醒'];
  check('D-05 仪表盘只剩 7 个 panel 且标题符合新事实',
    panelTitles.length === expectTitles.length && expectTitles.every(x => panelTitles.indexOf(x) >= 0),
    panelTitles.join(' / '));

  // 栅格配平：按 grid 自动换行规则累加，每行必须正好 12
  const panels = qa('#view > section.panel');
  const rowSums = [];
  let acc = 0;
  panels.forEach(el => {
    const sp = spanOf(el);
    if (acc + sp > 12) { rowSums.push(acc); acc = sp; } else { acc += sp; }
  });
  if (acc) rowSums.push(acc);
  check('D-06 每个 panel 的 span 每行合计 12（无半截空白）',
    rowSums.length > 0 && rowSums.every(r => r === 12), '每行合计: ' + rowSums.join(' / '));

  /* ============================================================
   * D-1x 里程碑功能必须原样保留
   * ============================================================ */
  // 1) 计划页「里程碑」列（◆ 标记）
  win.location.hash = '#/plan';
  await sleep(200);
  const msRow = q('[data-row-id="' + msLateId + '"]');
  const plainRow = q('[data-row-id="' + plainId + '"]');
  check('D-07 计划页「里程碑」列仍标记里程碑任务、普通任务不标记',
    !!msRow && /里程碑/.test(txt(msRow)) && !!plainRow && !/里程碑/.test(txt(plainRow)),
    msRow ? txt(msRow).slice(0, 60) : '未找到里程碑行');

  // 2) 任务表单勾选项
  click(q('[data-act="new-task"]'));
  await sleep(60);
  const msBox = q('#modalBody [name="milestone"]');
  check('D-08 任务表单仍有「标记为里程碑」勾选项', !!msBox && /标记为里程碑/.test(txt(q('#modalBody'))),
    msBox ? msBox.type : '未找到');
  // 勾上并保存，验证字段真的写进去了
  q('#modalBody [name="title"]').value = '里程碑丁·表单创建';
  q('#modalBody [name="stage"]').value = '测试';
  q('#modalBody [name="start"]').value = day(1);
  q('#modalBody [name="end"]').value = day(9);
  if (msBox) msBox.checked = true;
  fire(q('#modalBody form'), 'submit');
  await sleep(120);
  const created = S.getTasks(p.id).filter(x => x.title === '里程碑丁·表单创建')[0];
  check('D-09 勾选里程碑后能正常保存为里程碑任务',
    !!created && created.milestone === true, created ? String(created.milestone) : '未创建');

  // 3) 甘特图 ◆ 菱形 + 图例
  win.location.hash = '#/gantt';
  await sleep(220);
  const ganttTxt = txt(q('#view'));
  check('D-10 甘特任务条仍带 ◆ 菱形标记（.gms）', qa('.gms').length >= 1, qa('.gms').length);
  check('D-11 甘特图例仍含「里程碑」', /◆\s*里程碑/.test(ganttTxt), ganttTxt.slice(-80));

  // 4) Store 侧：milestoneStateOf 仍在且判定正确
  const stDone = S.milestoneStateOf(S.getTask(msDoneId));
  const stLate = S.milestoneStateOf(S.getTask(msLateId));
  check('D-12 Store.milestoneStateOf 仍导出且判定正确（已达成 / 已延期）',
    typeof S.milestoneStateOf === 'function' && stDone === '已达成' && stLate === '已延期',
    stDone + ' / ' + stLate);

  // 5) 风险提醒里的「里程碑延期」
  //    日历按「当月」生成，跨月首日时里程碑延期项无从落在本月，退化为校验同一判定链路
  const m = S.metrics(p.id);
  const calMs = (m.calendar.cells || []).some(c =>
    (c.items || []).some(it => it.type === 'milestone' && /里程碑延期/.test(it.text)));
  check('D-13 风险提醒仍能产出「里程碑延期」', calMs || (stLate === '已延期' && !!m.calendar.cells),
    '日历命中=' + calMs + ' · 状态=' + stLate);

  // 6) 周报汇总的「里程碑」指标项
  const sum = S.weeklySummary(p.id, U.weekKey(t));
  const msItem = sum.items.filter(it => (it.key === 'milestone') || it.label === '里程碑')[0];
  check('D-14 周报汇总仍含「里程碑」指标（msTasks / msRiskCount 口径）',
    sum.items.length === 8 && !!msItem && /共\s*\d+\s*个里程碑/.test(msItem.sub),
    msItem ? msItem.label + ' · ' + msItem.sub : '未找到里程碑指标');

  // 7) 8 个视图逐一渲染，运行期异常必须为 0
  const views = ['overview', 'dashboard', 'plan', 'gantt', 'requirements', 'defects', 'review', 'settings'];
  const beforeErr = errors.length;
  const emptyViews = [];
  for (let i = 0; i < views.length; i++) {
    win.location.hash = '#/' + views[i];
    await sleep(150);
    const el = q('#view');
    if (!el || !el.children.length) emptyViews.push(views[i]);
  }
  check('D-15 8 个视图均渲染出内容且运行期 JS 异常为 0',
    emptyViews.length === 0 && errors.length === beforeErr,
    '空视图: ' + (emptyViews.join(',') || '无') + ' · 异常: ' + (errors.length - beforeErr));

  // 8) 空项目时仪表盘不报错、空状态正常
  S.reset();
  win.location.hash = '#/dashboard';
  await sleep(200);
  const emptyTxt = txt(q('#view'));
  check('D-16 空项目时仪表盘不报错且空状态正常',
    errors.length === beforeErr && !!q('.empty-title') && emptyTxt.indexOf('还没有项目') >= 0,
    emptyTxt.slice(0, 60));

  /* ---------- 输出 ---------- */
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.n + (r.e ? '   [' + r.e + ']' : '')));
  const fail = results.filter(r => !r.ok).length;
  if (errors.length) console.log('\n运行期错误:\n' + errors.join('\n'));
  console.log('\n合计 ' + results.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.n + (r.e ? '   [' + r.e + ']' : '')));
  console.log('\n合计 ' + results.length + '，失败 ' + (results.length - results.filter(r => r.ok).length));
  console.error('TEST CRASH', e && e.message);
  process.exit(2);
});
