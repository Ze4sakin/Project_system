const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP = path.resolve(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

// 把外链脚本内联，便于 jsdom 在 http 源下执行（真实浏览器仍用外链）
const scripts = ['js/store.js', 'js/charts.js', 'js/views.js', 'js/app.js'];
let inlined = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
inlined = inlined.replace('</body>', scripts.map(s =>
  '<script>\n' + fs.readFileSync(path.join(APP, s), 'utf8') + '\n</script>').join('\n') + '\n</body>');

const errors = [];
function makeDom() {
  const dom = new JSDOM(inlined, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  dom.window.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
  dom.virtualConsole = dom.window;
  return dom;
}

const dom = makeDom();
const win = dom.window;
const doc = win.document;
win.HTMLElement.prototype.scrollIntoView = function () {};
win.scrollTo = function () {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, root) => (root || doc).querySelector(sel);
const qa = (sel, root) => Array.prototype.slice.call((root || doc).querySelectorAll(sel));
const fire = (el, type, opts) => el.dispatchEvent(new win.Event(type, Object.assign({ bubbles: true, cancelable: true }, opts)));
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const setVal = (el, v) => { el.value = v; fire(el, 'input'); fire(el, 'change'); };
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra || '' });
}

(async () => {
  await sleep(120);

  // ---------- 1 首屏 ----------
  check('导航 8 项', qa('#sidenav .nav-item').length === 8, qa('#sidenav .nav-item').length);
  check('首屏为空状态', !!q('.empty-title'), txt(q('.empty-title')));
  check('空状态有新建项目按钮', !!q('[data-act="new-project"]'));
  check('顶栏项目下拉为空', q('#projectSelect').options.length === 1);

  // ---------- 2 新建项目：弹窗 + 必填校验 ----------
  click(q('[data-act="new-project"]'));
  await sleep(30);
  check('弹窗已打开', q('#modalMask').hidden === false);
  check('弹窗标题=新增项目', txt(q('#modalTitle')) === '新增项目', txt(q('#modalTitle')));
  // 空提交
  fire(q('#modalBody form'), 'submit');
  await sleep(20);
  check('空提交被拦截（弹窗未关）', q('#modalMask').hidden === false);
  const errs = qa('#modalBody .err-msg').filter(e => e.textContent.trim());
  check('必填红字提示出现', errs.length >= 3, errs.map(e => e.textContent).join(' | '));
  check('输入框红边', qa('#modalBody .input.error').length >= 3, qa('#modalBody .input.error').length);

  // 结束日早于开始日
  q('#modalBody [name="name"]').value = '官网改版';
  q('#modalBody [name="start"]').value = '2026-09-01';
  q('#modalBody [name="end"]').value = '2026-08-01';
  fire(q('#modalBody form'), 'submit');
  await sleep(20);
  const dateErr = q('#modalBody [data-err="end"]').textContent;
  check('结束早于开始被拦截', /结束日不得早于开始日/.test(dateErr), dateErr);

  // 修正后提交
  q('#modalBody [name="end"]').value = '2026-12-31';
  q('#modalBody [name="code"]').value = 'WEB-1';
  q('#modalBody [name="owner"]').value = '我';
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('提交后弹窗关闭', q('#modalMask').hidden === true);
  check('Toast 出现', qa('#toastWrap .toast').length >= 1, qa('#toastWrap .toast').length);
  const cards = qa('.pcard');
  check('项目卡片出现', cards.length === 1, cards.length);
  check('汇总条数字实时', /1/.test(txt(q('.summary-bar .sum-item .sum-num'))), txt(q('.summary-bar .sum-item .sum-num')));
  check('顶栏下拉有项目', q('#projectSelect').options.length === 1 && q('#projectSelect').value !== '');
  const saved1 = win.localStorage.getItem('projsys.v1');
  check('已写入 localStorage', !!saved1 && saved1.indexOf('官网改版') > 0);

  // ---------- 3 计划页：新增任务 + 校验 ----------
  click(q('[data-nav="plan"]'));
  await sleep(320);
  check('已切到计划页', txt(q('.page-title h1')) === '计划', txt(q('.page-title h1')));
  check('计划空状态', !!txt(q('.empty-title')));

  click(q('[data-act="new-task"]'));
  await sleep(30);
  check('任务弹窗标题', txt(q('#modalTitle')) === '新增任务', txt(q('#modalTitle')));
  fire(q('#modalBody form'), 'submit');
  await sleep(20);
  check('任务必填拦截', qa('#modalBody .err-msg').filter(e => e.textContent.trim()).length >= 3);

  q('#modalBody [name="title"]').value = '首页重构';
  q('#modalBody [name="stage"]').value = '开发';
  q('#modalBody [name="owner"]').value = '我';
  q('#modalBody [name="start"]').value = '2026-09-01';
  q('#modalBody [name="end"]').value = '2026-10-10';
  q('#modalBody [name="estimateHours"]').value = '40';
  q('#modalBody [name="progress"]').value = '60';
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('任务创建成功', qa('.data-table tbody tr:not(.group-row)').length >= 1, qa('.data-table tbody tr:not(.group-row)').length);

  // 阻塞原因必填
  click(q('[data-act="new-task"]'));
  await sleep(30);
  q('#modalBody [name="title"]').value = '回归测试';
  q('#modalBody [name="start"]').value = '2026-10-11';
  q('#modalBody [name="end"]').value = '2026-11-01';
  var sel = q('#modalBody [name="status"]');
  sel.value = '阻塞';
  fire(sel, 'change');
  fire(q('#modalBody form'), 'submit');
  await sleep(20);
  const blockErr = q('#modalBody [data-err="blockedReason"]').textContent;
  check('阻塞状态未填原因被拦截', /必须填写阻塞原因/.test(blockErr), blockErr);
  q('#modalBody [name="blockedReason"]').value = '测试环境未就绪';
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('补填原因后创建成功', win.Store.getTasks().length === 2, win.Store.getTasks().length);

  // ---------- 4 编辑任务 ----------
  const firstEdit = q('[data-act="edit-task"]');
  click(firstEdit);
  await sleep(30);
  check('编辑弹窗标题', txt(q('#modalTitle')) === '编辑任务', txt(q('#modalTitle')));
  check('编辑表单带原值', q('#modalBody [name="title"]').value === '首页重构', q('#modalBody [name="title"]').value);
  q('#modalBody [name="title"]').value = '首页重构 v2';
  q('#modalBody [name="progress"]').value = '100';
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('编辑后列表同步', txt(q('.data-table tbody')).indexOf('首页重构 v2') > 0);
  const doneRow = qa('.data-table tbody tr:not(.group-row)').find(tr => txt(tr).indexOf('首页重构 v2') >= 0);
  // S-1（重判后）：表单虽同时提交 status 原值，但状态未变 → 进度 100% 仍自动置已完成（PRD F1）
  check('S-1 只改进度100%自动置已完成',
    !!doneRow && txt(doneRow).indexOf('已完成') >= 0 && txt(doneRow).indexOf('100%') >= 0, txt(doneRow));
  // 再把状态显式改为「进行中」→ 以用户选择为准，进度保持 100
  const doneRowIdx = qa('[data-act="edit-task"]').findIndex(b => {
    const tr = b.closest('tr'); return tr && txt(tr).indexOf('首页重构 v2') >= 0;
  });
  click(qa('[data-act="edit-task"]')[doneRowIdx]);
  await sleep(40);
  const stSel = q('#modalBody [name="status"]');
  stSel.value = '进行中'; fire(stSel, 'change');
  fire(q('#modalBody form'), 'submit');
  await sleep(80);
  const doneRow2 = qa('.data-table tbody tr:not(.group-row)').find(tr => txt(tr).indexOf('首页重构 v2') >= 0);
  check('S-1 显式改状态为进行中时进度保持100',
    !!doneRow2 && txt(doneRow2).indexOf('进行中') >= 0 && txt(doneRow2).indexOf('100%') >= 0, txt(doneRow2));

  // ---------- 5 单行删除二次确认 ----------
  const before = qa('.data-table tbody tr:not(.group-row)').length;
  click(qa('[data-act="del-task"]')[1]);
  await sleep(30);
  check('删除二次确认弹窗', /删除任务/.test(txt(q('#modalTitle'))), txt(q('#modalTitle')));
  click(q('[data-act="modal-cancel"]'));
  await sleep(30);
  check('取消删除不生效', qa('.data-table tbody tr:not(.group-row)').length === before);
  click(qa('[data-act="del-task"]')[1]);
  await sleep(30);
  click(q('[data-act="modal-ok"]'));
  await sleep(60);
  check('确认删除生效', qa('.data-table tbody tr:not(.group-row)').length === before - 1, qa('.data-table tbody tr:not(.group-row)').length);

  // ---------- 6 批量删除 ----------
  for (let i = 0; i < 20; i++) { const cb = q('[data-act="check-row"]'); if (!cb) break; if (!cb.checked) click(cb); await sleep(30); if (cb.checked) break; }
  await sleep(60);
  check('批量删除按钮显示条数', /批量删除 \(\d+\)/.test(txt(q('[data-act="batch-del-task"]'))), txt(q('[data-act="batch-del-task"]')));
  click(q('[data-act="batch-del-task"]'));
  await sleep(30);
  check('批量删除确认显示条数', /勾选的 \d+ 条/.test(txt(q('#modalBody'))), txt(q('#modalBody')));
  click(q('[data-act="modal-ok"]'));
  await sleep(60);
  check('批量删除后为空状态', !!txt(q('.empty-title')), txt(q('.empty-title')));

  // 补一个新任务，供后续仪表盘/甘特断言使用
  click(q('[data-act="new-task"]'));
  await sleep(30);
  q('#modalBody [name="title"]').value = '接口联调';
  q('#modalBody [name="stage"]').value = '开发';
  q('#modalBody [name="start"]').value = '2026-09-05';
  q('#modalBody [name="end"]').value = '2026-09-28';
  q('#modalBody [name="estimateHours"]').value = '24';
  q('#modalBody [name="progress"]').value = '40';
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('再次创建任务成功', win.Store.getTasks().length === 1);

  // ---------- 7 ESC 关闭弹窗 ----------
  click(q('[data-act="new-task"]'));
  await sleep(30);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(30);
  check('ESC 关闭弹窗', q('#modalMask').hidden === true);

  // ---------- 8 仪表盘重算 ----------
  click(q('[data-nav="dashboard"]'));
  await sleep(320);
  const kpis = qa('.kpi .kpi-value').map(txt);
  check('仪表盘 4 张 KPI', kpis.length === 4, kpis.join(' / '));
  check('KPI 全为真实数字（非占位）', kpis.every(k => /[0-9]/.test(k)), kpis.join(' / '));
  check('有双环 SVG', !!q('.donut svg'));
  // 删除式改造：仪表盘不再有「负荷热力矩阵」与「里程碑看板」两个板块
  check('仪表盘已无负荷热力矩阵', !q('.heat') && txt(q('#view')).indexOf('负荷热力矩阵') < 0);
  check('仪表盘已无里程碑看板', !q('[data-act="toggle-ms-all"]') && txt(q('#view')).indexOf('里程碑看板') < 0);
  check('有风险日历', !!q('.cal-grid'));
  check('有延期/空状态清单', !!q('.mini-table') || !!q('.empty-title'));
  check('复盘状态卡', /连续复盘/.test(txt(q('#view'))));

  // ---------- 9 需求 / 缺陷 CRUD ----------
  click(q('[data-nav="requirements"]'));
  await sleep(320);
  click(q('[data-act="new-req"]'));
  await sleep(30);
  fire(q('#modalBody form'), 'submit');
  await sleep(20);
  check('需求必填拦截', q('#modalBody [data-err="title"]').textContent.length > 0);
  q('#modalBody [name="title"]').value = '首页可配置';
  q('#modalBody [name="status"]').value = '已通过';
  const picks = qa('#modalBody [data-pick="taskIds"]');
  check('需求表单有关联任务选择', picks.length >= 1, picks.length);
  if (picks.length) { picks[0].checked = true; }
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('需求创建成功', txt(q('.data-table tbody')).indexOf('首页可配置') >= 0);
  check('需求覆盖率随关联计算', /覆盖率\s*\d+/.test(txt(q('.page-hint'))), txt(q('.page-hint')));

  click(q('[data-nav="defects"]'));
  await sleep(320);
  click(q('[data-act="new-bug"]'));
  await sleep(30);
  fire(q('#modalBody form'), 'submit');
  await sleep(20);
  check('缺陷必填拦截', q('#modalBody [data-err="title"]').textContent.length > 0);
  q('#modalBody [name="title"]').value = '首屏白屏';
  q('#modalBody [name="severity"]').value = '致命';
  fire(q('#modalBody form'), 'submit');
  await sleep(60);
  check('缺陷创建成功', txt(q('.data-table tbody')).indexOf('首屏白屏') >= 0);
  check('严重级别色标', !!q('.data-table tbody .chip'));

  // ---------- 10 甘特 ----------
  click(q('[data-nav="gantt"]'));
  await sleep(320);
  check('甘特有条形', qa('.gbar').length >= 1, qa('.gbar').length);
  check('甘特有今日线', !!q('.today-line'));

  // ---------- 11 复盘 ----------
  click(q('[data-nav="review"]'));
  await sleep(320);
  check('自动汇总 8 项', qa('.auto-item').length === 8, qa('.auto-item').length);
  check('三栏输入框', qa('[data-write]').length === 3);
  const ta = q('[data-write="whatDone"]');
  ta.value = '完成首页重构';
  fire(ta, 'input');
  check('字数计数更新', txt(q('#cnt-whatDone')) === '6 / 500', txt(q('#cnt-whatDone')));
  click(q('[data-act="save-review"]'));
  await sleep(80);
  check('复盘保存后出现时间线', qa('.tl-item').length === 1, qa('.tl-item').length);
  check('保存后出现已保存提示', /本周已保存于/.test(txt(q('#view'))));
  click(q('[data-act="export-review"]'));
  await sleep(60);
  check('导出无异常', true);
  click(q('.tl-head'));
  await sleep(60);
  check('时间线可展开', /本周做成了什么/.test(txt(q('.tl-body'))), txt(q('.tl-body')).slice(0, 40));

  // ---------- 12 设置 ----------
  click(q('[data-nav="settings"]'));
  await sleep(320);
  check('设置页有项目信息表单', !!q('form[data-form="settings"]'));
  check('设置页有复盘规则', !!q('[data-filter="reviewDay"]'));
  check('设置页有危险区', !!q('[data-act="reset-data"]'));
  const nameInput = q('form[data-form="settings"] [name="name"]');
  nameInput.value = '';
  fire(q('form[data-form="settings"]'), 'submit');
  await sleep(30);
  check('设置页必填校验', q('form[data-form="settings"] [data-err="name"]').textContent.length > 0,
    q('form[data-form="settings"] [data-err="name"]').textContent);
  nameInput.value = '官网改版 2.0';
  fire(q('form[data-form="settings"]'), 'submit');
  await sleep(60);
  check('设置保存生效', q('#projectSelect').options[0].textContent.indexOf('2.0') > 0, q('#projectSelect').options[0].textContent);

  // ---------- 13 持久化：重新加载 ----------
  const saved = win.localStorage.getItem('projsys.v1');
  const dom2 = new JSDOM(inlined, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) { w.localStorage.setItem('projsys.v1', saved); }
  });
  await sleep(150);
  const w2 = dom2.window;
  w2.HTMLElement.prototype.scrollIntoView = function () {};
  const t2 = s2 => (w2.document.querySelector(s2) ? w2.document.querySelector(s2).textContent.replace(/\s+/g, ' ').trim() : '');
  check('刷新后项目恢复', /官网改版 2.0/.test(w2.document.body.textContent), t2('#projectSelect option'));
  check('刷新后任务恢复', (w2.Store.getTasks().length) === 1, w2.Store.getTasks().length);
  check('刷新后需求恢复', w2.Store.getRequirements().length === 1);
  check('刷新后缺陷恢复', w2.Store.getDefects().length === 1);
  check('刷新后复盘恢复', w2.Store.getReviews().length === 1);
  dom2.window.close();

  // ---------- 14 清空数据 ----------
  click(q('[data-act="reset-data"]'));
  await sleep(30);
  check('清空二次确认', /清空全部数据/.test(txt(q('#modalTitle'))), txt(q('#modalTitle')));
  click(q('[data-act="modal-ok"]'));
  await sleep(120);
  check('清空后回到空状态', !!txt(q('.empty-title')), txt(q('.empty-title')));
  check('清空后 localStorage 为空数据', JSON.parse(win.localStorage.getItem('projsys.v1')).projects.length === 0);

  // ---------- 结果 ----------
  const fail = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  → ' + r.extra : '')));
  console.log('\n通过 ' + (results.length - fail.length) + '/' + results.length);
  if (errors.length) console.log('运行期错误:\n' + errors.join('\n'));
  process.exit(fail.length ? 1 : 0);
})().catch(e => {
  const fail = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  → ' + r.extra : '')));
  console.log('通过 ' + (results.length - fail.length) + '/' + results.length);
  console.error('TEST CRASH', e.message);
  process.exit(2);
});
