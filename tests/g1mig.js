/**
 * G-1 旧数据迁移：localStorage 里没有 seq 的旧数据，启动时按数组顺序回填并写回
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const APP = path.resolve(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const scripts = ['js/store.js', 'js/charts.js', 'js/views.js', 'js/app.js'];
let inlined = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
inlined = inlined.replace('</body>', scripts.map(s => '<script>\n' + fs.readFileSync(path.join(APP, s), 'utf8') + '\n</script>').join('\n') + '</body>');

// 旧格式：需求/缺陷没有 seq，settings 里也没有 seqReq / seqDefect
const legacy = {
  projects: [{ id: 'prj_old', name: '旧项目', code: '', owner: '我', start: '2026-10-01', end: '2026-12-31', status: '进行中', desc: '', createdAt: 1, updatedAt: 1 }],
  tasks: [],
  requirements: [
    { id: 'req_a', projectId: 'prj_old', title: '旧需求A', desc: '', source: '内部', priority: 'P1', status: '已通过', owner: '我', expectDate: '', taskIds: [], createdAt: 1, updatedAt: 1 },
    { id: 'req_b', projectId: 'prj_old', title: '旧需求B', desc: '', source: '客户', priority: 'P2', status: '草稿', owner: '我', expectDate: '', taskIds: [], createdAt: 2, updatedAt: 2 }
  ],
  defects: [
    { id: 'def_a', projectId: 'prj_old', title: '旧缺陷A', severity: '一般', status: '待修复', owner: '我', foundVersion: '', createdAt: 1, updatedAt: 1 }
  ],
  reviews: [],
  settings: { currentProjectId: 'prj_old', reviewDay: 5, reviewTime: '18:00' },
  savedAt: 1
};

const dom = new JSDOM(inlined, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(w) { w.localStorage.setItem('projsys.v1', JSON.stringify(legacy)); }
});
const win = dom.window;
win.HTMLElement.prototype.scrollIntoView = function () {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, c, e) => results.push({ n, ok: !!c, e: e === undefined ? '' : String(e) });

(async () => {
  await sleep(200);
  const S = win.Store;
  const reqs = S.getRequirements('prj_old');
  const defs = S.getDefects('prj_old');
  const codes = reqs.map(r => S.reqCode(r)).join(' ');
  const dcodes = defs.map(d => S.defectCode(d)).join(' ');
  console.log('旧数据回填后的需求编号: ' + codes);
  console.log('旧数据回填后的缺陷编号: ' + dcodes);
  check('G-1 旧需求按数组顺序回填 REQ-01 REQ-02', codes === 'REQ-01 REQ-02', codes);
  check('G-1 旧缺陷按数组顺序回填 BUG-01', dcodes === 'BUG-01', dcodes);

  const raw = JSON.parse(win.localStorage.getItem('projsys.v1'));
  console.log('写回的 settings: seqReq=' + raw.settings.seqReq + ' seqDefect=' + raw.settings.seqDefect);
  console.log('写回的 seq: ' + raw.requirements.map(r => r.seq).join(',') + ' / ' + raw.defects.map(d => d.seq).join(','));
  check('G-1 seq 已写回 localStorage（需求）', raw.requirements.map(r => r.seq).join(',') === '1,2', raw.requirements.map(r => r.seq).join(','));
  check('G-1 计数器已写回（seqReq=2）', raw.settings.seqReq === 2, raw.settings.seqReq);
  check('G-1 计数器已写回（seqDefect=1）', raw.settings.seqDefect === 1, raw.settings.seqDefect);

  // 再新增一条，序号应接续为 REQ-03，不与旧编号冲突
  const r3 = S.addRequirement({ projectId: 'prj_old', title: '新需求C', status: '草稿', priority: 'P2' });
  console.log('迁移后新增需求编号: ' + S.reqCode(r3));
  check('G-1 迁移后新增接续 REQ-03', S.reqCode(r3) === 'REQ-03', S.reqCode(r3));

  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.n + (r.e ? '   [' + r.e + ']' : '')));
  const fail = results.filter(r => !r.ok).length;
  console.log('\n合计 ' + results.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
