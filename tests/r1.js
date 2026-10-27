/**
 * R-1 定向回归：A 组「只改标题不得改写状态/进度」6 例 + B 组 S-1 六场景 + C 组新建边界 4 例
 * 所有 patch 都模拟表单：把 status / progress 原值一起提交，只改 title。
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
const push = (g, name, actual, st, pg) => rows.push({
  g, name, actual, ok: actual.status === st && actual.progress === pg, want: st + ' / ' + pg
});

(async () => {
  await new Promise(r => setTimeout(r, 150));
  const S = win.Store;
  const p = S.addProject({ name: 'R-1 回归', start: '2026-01-01', end: '2026-12-31' });
  const mk = (status, progress, extra) => S.addTask(Object.assign(
    { projectId: p.id, title: '原名', status: status, progress: progress }, extra || {}));
  const read = t => { const x = S.getTask(t.id); return { status: x.status, progress: x.progress, reason: x.blockedReason }; };

  /* ---------- A 组：只改标题 ---------- */
  const A = [
    ['已取消', 100], ['阻塞', 100], ['已完成', 60],
    ['进行中', 100], ['已取消', 30], ['未开始', 0]
  ];
  for (const pair of A) {
    const st = pair[0], pg = pair[1];
    const extra = st === '阻塞' ? { blockedReason: '等接口' } : {};
    const t = mk(st, pg, extra);
    const patch = { title: '改名了', status: st, progress: pg };
    if (st === '阻塞') patch.blockedReason = '等接口';
    S.updateTask(t.id, patch);
    const r = read(t);
    push('A', '只改标题 ' + st + '/' + pg, r, st, pg);
    if (st === '阻塞') {
      rows.push({ g: 'A', name: '阻塞原因保留', actual: { status: r.reason, progress: '' }, ok: r.reason === '等接口', want: '等接口' });
    }
  }

  /* ---------- B 组：S-1 六场景 ---------- */
  let t;
  t = mk('未开始', 0); S.updateTask(t.id, { status: '未开始', progress: 100 });
  push('B', '场景1 未开始0 → 只改进度100', read(t), '已完成', 100);

  t = mk('已完成', 100); S.updateTask(t.id, { status: '已取消', progress: 100 });
  push('B', '场景2 已完成 → 状态改已取消', read(t), '已取消', 100);

  t = mk('已完成', 100); S.updateTask(t.id, { status: '进行中', progress: 100 });
  push('B', '场景3 已完成 → 状态改进行中', read(t), '进行中', 100);

  t = mk('进行中', 40); S.updateTask(t.id, { status: '进行中', progress: 100 });
  push('B', '场景4 进行中40 → 只改进度100', read(t), '已完成', 100);

  t = mk('已完成', 100); S.updateTask(t.id, { status: '已完成', progress: 60 });
  push('B', '场景5 已完成 → 只把进度改60', read(t), '已完成', 100);

  t = mk('未开始', 0); S.updateTask(t.id, { status: '已完成', progress: 60 });
  push('B', '场景6 未开始 → 已完成+进度60', read(t), '已完成', 60);

  /* ---------- C 组：新建边界 ---------- */
  let n = S.addTask({ projectId: p.id, title: 'C1', status: '已完成', progress: 60 });
  push('C', '新建 已完成+60', read(n), '已完成', 60);
  n = S.addTask({ projectId: p.id, title: 'C2', status: '未开始', progress: 100 });
  push('C', '新建 未开始+100', read(n), '已完成', 100);
  n = S.addTask({ projectId: p.id, title: 'C3', status: '未开始', progress: 0 });
  push('C', '新建 未开始+0', read(n), '未开始', 0);
  n = S.addTask({ projectId: p.id, title: 'C4', status: '阻塞', progress: 30, blockedReason: '等设计稿' });
  const r4 = read(n);
  push('C', '新建 阻塞+30', r4, '阻塞', 30);
  rows.push({ g: 'C', name: '新建阻塞原因保留', actual: { status: r4.reason, progress: '' }, ok: r4.reason === '等设计稿', want: '等设计稿' });

  let last = '';
  rows.forEach(r => {
    if (r.g !== last) { console.log('\n===== ' + r.g + ' 组 ====='); last = r.g; }
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name +
      '   → 实际 ' + r.actual.status + (r.actual.progress !== '' ? ' / ' + r.actual.progress : '') + '   期望 ' + r.want);
  });
  const fail = rows.filter(r => !r.ok).length;
  console.log('\n合计 ' + rows.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
