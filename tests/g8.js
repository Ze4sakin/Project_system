/**
 * G-8 缺陷表单字段 + 交付自检（无外链 / 无 module / 无写死统计）
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = s => doc.querySelector(s);
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const results = [];
const check = (n, c, e) => results.push({ n, ok: !!c, e: e === undefined ? '' : String(e) });

(async () => {
  await sleep(120);
  const S = win.Store;
  const p = S.addProject({ name: 'G8 缺陷表单', start: '2026-10-01', end: '2026-12-31' });
  S.setCurrentProject(p.id);
  S.addTask({ projectId: p.id, title: '任务甲', status: '进行中', progress: 30 });
  S.addTask({ projectId: p.id, title: '任务乙', status: '未开始', progress: 0 });

  win.location.hash = '#/defects';
  await sleep(180);
  click(q('[data-act="new-bug"]'));
  await sleep(80);

  const body = q('#modalBody');
  check('G-8 表单含复现步骤 textarea', !!q('[name="steps"]', body) && q('[name="steps"]', body).tagName === 'TEXTAREA', q('[name="steps"]', body) && q('[name="steps"]', body).tagName);
  check('G-8 表单含环境 input', !!q('[name="env"]', body), q('[name="env"]', body) && q('[name="env"]', body).tagName);
  const relSel = q('[name="relatedTaskId"]', body);
  check('G-8 表单单关联任务下拉（当前项目任务）', !!relSel && relSel.options.length === 3, relSel && relSel.options.length);
  check('G-8 关联任务选项文案带任务名', /任务甲|任务乙/.test(txt(relSel)), txt(relSel).slice(0, 40));
  check('G-8 附件说明小字存在', /v1 暂不支持附件/.test(txt(body)), txt(q('.form-note', body)));

  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.n + (r.e ? '   [' + r.e + ']' : '')));
  const fail = results.filter(r => !r.ok).length;
  console.log('\n合计 ' + results.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
