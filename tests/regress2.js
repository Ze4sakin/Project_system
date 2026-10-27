/**
 * 第二轮 QA 修复的定向回归脚本
 * 覆盖：S-1（状态-进度联动）、G-1（稳定编号）、G-8（缺陷新字段）、
 *       G-4（需求变更次数）、G-6（里程碑折叠）、G-3（清除筛选）、G-2（全局搜索）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP = path.resolve(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const scripts = ['js/store.js', 'js/charts.js', 'js/views.js', 'js/app.js'];
let inlined = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
inlined = inlined.replace('</body>', scripts.map(s =>
  '<script>\n' + fs.readFileSync(path.join(APP, s), 'utf8') + '\n</script>').join('\n') + '</body>');

const errors = [];
const dom = new JSDOM(inlined, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true
});
const win = dom.window;
const doc = win.document;
win.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
win.HTMLElement.prototype.scrollIntoView = function () {};
win.scrollTo = function () {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, root) => (root || doc).querySelector(sel);
const qa = (sel, root) => Array.prototype.slice.call((root || doc).querySelectorAll(sel));
const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true, cancelable: true }));
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const setVal = (el, v) => { el.value = v; fire(el, 'input'); fire(el, 'change'); };
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
}
function log(msg) { console.log(msg); }

(async () => {
  await sleep(120);
  const S = win.Store;

  /* ============================================================
   * S-1 状态与进度联动 —— 定向回归
   * ============================================================ */
  log('\n===== S-1 状态-进度联动定向回归 =====');
  const p = S.addProject({ name: 'S1回归项目', start: '2026-01-05', end: '2026-12-31' });

  // 场景 1：已完成 / 100% → 改「已取消」，不传 progress
  let t1 = S.addTask({ projectId: p.id, title: 'S1-A', status: '已完成', progress: '100', start: '2026-01-05', end: '2026-02-05' });
  log('新建后 t1: status=' + t1.status + ' progress=' + t1.progress);
  const u1 = S.updateTask(t1.id, { status: '已取消' });
  log('场景1 改「已取消」后实际读到: status=' + u1.status + ' progress=' + u1.progress);
  check('S-1 场景1 显式 status 生效（已取消）', u1.status === '已取消', u1.status);
  check('S-1 场景1 progress 未被隐式改写', u1.progress === 100, u1.progress);

  // 场景 2：已完成 / 100% → 改「进行中」，不传 progress（进度保持原值）
  let t2 = S.addTask({ projectId: p.id, title: 'S1-B', status: '已完成', progress: 100 });
  const u2 = S.updateTask(t2.id, { status: '进行中' });
  log('场景2 已完成→进行中后: status=' + u2.status + ' progress=' + u2.progress);
  check('S-1 场景2 status=进行中', u2.status === '进行中', u2.status);
  check('S-1 场景2 progress 保持原值 100', u2.progress === 100, u2.progress);

  // 场景 3：只改进度到 100 → 自动已完成
  let t3 = S.addTask({ projectId: p.id, title: 'S1-C', status: '进行中', progress: 40 });
  const u3 = S.updateTask(t3.id, { progress: 100 });
  log('场景3 只改进度=100 后: status=' + u3.status + ' progress=' + u3.progress);
  check('S-1 场景3 进度=100 自动置已完成', u3.status === '已完成', u3.status);

  // 场景 4：只改状态为已完成（不传进度）→ 进度补 100
  let t4 = S.addTask({ projectId: p.id, title: 'S1-D', status: '进行中', progress: 30 });
  const u4 = S.updateTask(t4.id, { status: '已完成' });
  log('场景4 只改状态=已完成 后: status=' + u4.status + ' progress=' + u4.progress);
  check('S-1 场景4 状态已完成补进度 100', u4.status === '已完成' && u4.progress === 100, u4.status + '/' + u4.progress);

  // 场景 5：同时改状态为已完成 + 进度 60（两者都显式）→ 不覆盖进度
  let t5 = S.addTask({ projectId: p.id, title: 'S1-E', status: '进行中', progress: 30 });
  const u5 = S.updateTask(t5.id, { status: '已完成', progress: 60 });
  log('场景5 同时传 status=已完成 progress=60 后: status=' + u5.status + ' progress=' + u5.progress);
  check('S-1 场景5 同时显式传入时互不覆盖', u5.status === '已完成' && u5.progress === 60, u5.status + '/' + u5.progress);

  /* ============================================================
   * G-1 稳定编号（需求 / 缺陷）
   * ============================================================ */
  log('\n===== G-1 编号稳定性 =====');
  const r1 = S.addRequirement({ projectId: p.id, title: '需求甲', status: '已通过', priority: 'P1' });
  const r2 = S.addRequirement({ projectId: p.id, title: '需求乙', status: '已通过', priority: 'P1' });
  const r3 = S.addRequirement({ projectId: p.id, title: '需求丙', status: '已通过', priority: 'P1' });
  const codesBefore = S.getRequirements(p.id).map(r => S.reqCode(r)).join(' ');
  log('删除前编号: ' + codesBefore);
  check('G-1 删除前编号 REQ-01 REQ-02 REQ-03', codesBefore === 'REQ-01 REQ-02 REQ-03', codesBefore);
  S.deleteRequirement(r1.id);
  const codesAfter = S.getRequirements(p.id).map(r => S.reqCode(r)).join(' ');
  log('删除第 1 条后编号: ' + codesAfter);
  check('G-1 删除第 1 条后编号仍稳定 REQ-02 REQ-03', codesAfter === 'REQ-02 REQ-03', codesAfter);
  S.addRequirement({ projectId: p.id, title: '需求丁', status: '已通过', priority: 'P1' });
  const codesNew = S.getRequirements(p.id).map(r => S.reqCode(r)).join(' ');
  log('再新增一条后编号: ' + codesNew);
  check('G-1 新增取最大序号+1（REQ-04）', codesNew === 'REQ-02 REQ-03 REQ-04', codesNew);

  const d1 = S.addDefect({ projectId: p.id, title: '缺陷甲', severity: '严重', status: '待修复' });
  const d2 = S.addDefect({ projectId: p.id, title: '缺陷乙', severity: '一般', status: '待修复' });
  log('缺陷编号: ' + S.defectCode(d1) + ' ' + S.defectCode(d2));
  check('G-1 缺陷编号 BUG-01 BUG-02',
    S.defectCode(d1) === 'BUG-01' && S.defectCode(d2) === 'BUG-02', S.defectCode(d1) + ' ' + S.defectCode(d2));
  S.deleteDefect(d1.id);
  log('删缺陷甲后: ' + S.getDefects(p.id).map(d => S.defectCode(d)).join(' '));
  check('G-1 删缺陷后编号稳定 BUG-02', S.getDefects(p.id).map(d => S.defectCode(d)).join(' ') === 'BUG-02');

  /* ============================================================
   * G-8 缺陷新字段（复现步骤 / 环境 / 关联任务）
   * ============================================================ */
  log('\n===== G-8 缺陷字段 =====');
  const d3 = S.addDefect({
    projectId: p.id, title: '缺陷丙', severity: '致命', status: '待修复',
    steps: '1. 打开页面\n2. 点击提交', env: 'Chrome 120 / Win11', relatedTaskId: t3.id
  });
  const d3r = S.getDefect(d3.id);
  log('读回: env=' + d3r.env + ' | steps=' + JSON.stringify(d3r.steps) + ' | relatedTaskId=' + d3r.relatedTaskId);
  check('G-8 env 落库', d3r.env === 'Chrome 120 / Win11', d3r.env);
  check('G-8 steps 保留换行', d3r.steps.indexOf('\n') > 0, d3r.steps && d3r.steps.length);
  check('G-8 relatedTaskId 落库', d3r.relatedTaskId === t3.id, d3r.relatedTaskId);

  /* ============================================================
   * G-4 需求变更次数（有复盘快照时才算）
   * ============================================================ */
  log('\n===== G-4 指标 =====');
  let m = S.metrics(p.id);
  log('reqChanged=' + m.reqChanged + ' baseline=' + m.reqChangedBaseline);
  check('G-4 无快照时不虚报变更数', m.reqChanged === 0 && m.reqChangedBaseline === false,
    m.reqChanged + '/' + m.reqChangedBaseline);
  const snap = S.buildSnapshot(p.id);
  const rv = S.saveReview({
    projectId: p.id, week: '2026-W02',
    whatDone: '基线', blocked: '', nextOne: '下周',
    snapshot: snap
  });
  log('复盘快照已写入: ' + (rv && rv.id) + ' | reqStatus 条目 ' +
    Object.keys((rv && rv.snapshot && rv.snapshot.reqStatus) || {}).length);
  S.updateRequirement(r2.id, { status: '已上线' });
  m = S.metrics(p.id);
  log('建立快照并把 1 条需求改为已上线后 reqChanged=' + m.reqChanged);
  check('G-4 有快照后能识别 1 条需求状态变更', m.reqChanged === 1, m.reqChanged);

  /* ============================================================
   * UI：G-3 清除筛选 / G-6 里程碑折叠 / G-2 全局搜索
   * ============================================================ */
  await sleep(30);
  log('\n===== UI 回归 =====');
  win.location.hash = '#/requirements';
  await sleep(150);
  const selStatus = q('#view select[data-filter="status"]');
  check('G-7 需求筛选含归属/来源下拉',
    !!q('#view select[data-filter="owner"]') && !!q('#view select[data-filter="source"]'));
  if (selStatus) {
    setVal(selStatus, '已通过');
    await sleep(100);
    const clearBtn = q('#view [data-act="clear-filter-req"]');
    check('G-3 有筛选即出现「清除筛选」', !!clearBtn && /清除筛选/.test(txt(clearBtn)), txt(clearBtn));
    if (clearBtn) {
      click(clearBtn);
      await sleep(100);
      check('G-3 点击后筛选复位且按钮消失', !q('#view [data-act="clear-filter-req"]'));
    }
  } else {
    check('G-3 找到需求状态筛选', false, '未找到 select');
  }

  // 需求/缺陷表里编号应为 seq 派生
  const reqCodesUi = qa('#view tbody tr[data-row-id] .cell-clip').map(txt).join(' ');
  log('需求表首列片段: ' + reqCodesUi.slice(0, 60));

  // G-6（删除式改造后）：仪表盘不再有里程碑看板 / 负荷热力矩阵
  win.location.hash = '#/dashboard';
  await sleep(160);
  const dashTxt = txt(q('#view'));
  log('仪表盘是否还含两个已删板块: 里程碑看板=' + /里程碑看板/.test(dashTxt) +
    ' 负荷热力矩阵=' + /负荷热力矩阵/.test(dashTxt));
  check('G-6 仪表盘已移除里程碑看板与负荷热力矩阵',
    !/里程碑看板/.test(dashTxt) && !/负荷热力矩阵/.test(dashTxt) &&
    !q('[data-act="toggle-ms-all"]') && !q('.heat'), dashTxt.slice(0, 40));

  // G-2 全局搜索
  const gsInput = q('#globalSearchInput');
  check('G-2 顶栏存在全局搜索框', !!gsInput, gsInput && gsInput.getAttribute('placeholder'));
  if (gsInput) {
    setVal(gsInput, '需求乙');
    await sleep(140);
    const box = q('#gsResults');
    const items = qa('.gs-item', box);
    log('搜索结果条目数: ' + items.length + ' | 文案: ' + txt(box).slice(0, 80));
    check('G-2 输入后出分组结果', items.length > 0, items.length);
    if (items.length) {
      const hitId = items[0].getAttribute('data-id');
      click(items[0]);
      await sleep(220);
      const row = q('[data-row-id="' + hitId + '"]');
      check('G-2 点击结果跳到对应视图并高亮行', !!row && row.classList.contains('hl'),
        row ? row.className : '未找到行');
    }
    setVal(gsInput, 'zzz不存在zzz');
    await sleep(140);
    check('G-2 空结果提示「无匹配」', /无匹配/.test(txt(q('#gsResults'))), txt(q('#gsResults')));
    setVal(gsInput, '');
    await sleep(80);
  }

  // 刷新按钮
  check('G-2 状态条有刷新按钮', !!q('#btnRefresh'), txt(q('#btnRefresh')));
  if (q('#btnRefresh')) {
    click(q('#btnRefresh'));
    await sleep(100);
    check('刷新后无异常', errors.length === 0, errors.join(' / '));
  }

  /* ============================================================
   * 汇总
   * ============================================================ */
  const fail = results.filter(r => !r.ok);
  log('\n===== 结果 =====');
  results.forEach(r => {
    log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.extra !== '' ? '   [' + r.extra + ']' : ''));
  });
  log('\n合计 ' + results.length + ' 条，通过 ' + (results.length - fail.length) + '，失败 ' + fail.length);
  if (errors.length) log('JS 异常: ' + errors.join(' | '));
  process.exit(fail.length ? 1 : 0);
})();
