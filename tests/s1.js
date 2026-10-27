/**
 * S-1 重判后的 6 个场景（模拟表单：表单每次都会把 status 原值一起提交）
 * 场景 1/4/5 的「状态未动」= patch 里带上与改前相同的 status
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
const win = dom.window;
win.HTMLElement.prototype.scrollIntoView = function () {};

const rows = [];
(async () => {
  await new Promise(r => setTimeout(r, 150));
  const S = win.Store;
  const p = S.addProject({ name: 'S-1 六场景', start: '2026-01-01', end: '2026-12-31' });
  const mk = (status, progress) => S.addTask({ projectId: p.id, title: status + progress, status: status, progress: progress });
  const readBack = t => { const x = S.getTask(t.id); return { status: x.status, progress: x.progress }; };
  const expect = (name, actual, st, pg) => {
    rows.push({ name, actual, ok: actual.status === st && actual.progress === pg, want: st + ' / ' + pg });
  };

  // 场景 1：未开始/0% → 表单只把进度改 100，状态仍是「未开始」
  let t = mk('未开始', 0);
  S.updateTask(t.id, { status: '未开始', progress: 100 });
  expect('场景1 未开始0% → 只改进度100', readBack(t), '已完成', 100);

  // 场景 2：已完成/100% → 表单状态改「已取消」，进度仍 100
  t = mk('已完成', 100);
  S.updateTask(t.id, { status: '已取消', progress: 100 });
  expect('场景2 已完成 → 状态改已取消', readBack(t), '已取消', 100);

  // 场景 3：已完成/100% → 表单状态改「进行中」，进度仍 100
  t = mk('已完成', 100);
  S.updateTask(t.id, { status: '进行中', progress: 100 });
  expect('场景3 已完成 → 状态改进行中', readBack(t), '进行中', 100);

  // 场景 4：进行中/40% → 表单只把进度改 100，状态未动
  t = mk('进行中', 40);
  S.updateTask(t.id, { status: '进行中', progress: 100 });
  expect('场景4 进行中40% → 只改进度100', readBack(t), '已完成', 100);

  // 场景 5：已完成/100% → 表单只把进度改 60，状态未动
  t = mk('已完成', 100);
  S.updateTask(t.id, { status: '已完成', progress: 60 });
  expect('场景5 已完成 → 只把进度改60', readBack(t), '已完成', 100);

  // 场景 6：未开始/0% → 同时选「已完成」且进度填 60
  t = mk('未开始', 0);
  S.updateTask(t.id, { status: '已完成', progress: 60 });
  expect('场景6 未开始 → 同时改已完成+进度60', readBack(t), '已完成', 60);

  // 附加：新建时直接给「已完成 + 60」也应尊重 60
  const nt = S.addTask({ projectId: p.id, title: '新建已完成60', status: '已完成', progress: 60 });
  expect('附加 新建即已完成+60', readBack(nt), '已完成', 60);

  // 附加：新建「未开始 + 100」应自动已完成
  const nt2 = S.addTask({ projectId: p.id, title: '新建未开始100', status: '未开始', progress: 100 });
  expect('附加 新建未开始+100', readBack(nt2), '已完成', 100);

  // 附加：只改标题（status/progress 都是原值）不得改任何东西
  const nt3 = S.addTask({ projectId: p.id, title: '只改标题', status: '进行中', progress: 40 });
  S.updateTask(nt3.id, { status: '进行中', progress: 40, title: '只改标题-改' });
  const r3 = readBack(nt3);
  expect('附加 只改标题不动状态进度', r3, '进行中', 40);

  rows.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + '   → 实际 ' + r.actual.status + ' / ' + r.actual.progress + '   期望 ' + r.want));
  const fail = rows.filter(r => !r.ok).length;
  console.log('\n合计 ' + rows.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
