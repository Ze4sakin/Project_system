/**
 * G-2 快捷键：/ 聚焦全局搜索，Esc 关闭下拉
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
const results = [];
const check = (n, c, e) => results.push({ n, ok: !!c, e: e === undefined ? '' : String(e) });

(async () => {
  await sleep(120);
  const S = win.Store;
  const p = S.addProject({ name: '快捷键项目', start: '2026-10-01', end: '2026-12-31' });
  S.setCurrentProject(p.id);
  S.addTask({ projectId: p.id, title: '压测脚本' });

  // 「/」聚焦
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  await sleep(80);
  check('G-2 按 / 聚焦全局搜索', doc.activeElement === doc.getElementById('globalSearchInput'),
    doc.activeElement && doc.activeElement.id);

  // 输入 → 出下拉 → Esc 关闭
  const gs = doc.getElementById('globalSearchInput');
  gs.value = '压测'; gs.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(140);
  check('G-2 输入后下拉可见', doc.getElementById('gsResults').hidden === false);
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await sleep(100);
  check('G-2 Esc 优先关闭搜索下拉（不清空已输入内容）', doc.getElementById('gsResults').hidden === true,
    'hidden=' + doc.getElementById('gsResults').hidden + ' value=' + JSON.stringify(gs.value));

  results.forEach(r => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.n + (r.e ? '   [' + r.e + ']' : '')));
  const fail = results.filter(r => !r.ok).length;
  console.log('\n合计 ' + results.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
