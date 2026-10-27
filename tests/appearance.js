/* ============================================================
 * appearance.js · 外观功能断言（主题切换 / 动效开关 / 持久化 / 兼容）
 * 运行：node appearance.js（jsdom 需可解析，或用 NODE_PATH 指向 build/node_modules）
 * 说明：jsdom 不加载 CSS，故此处只验证「数据 + DOM 属性 + 结构」，
 *       真实配色计算由浏览器探针（CDP）负责。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP = path.resolve(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

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
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra || '' });
}

(async () => {
  const S = win.Store;
  // app.js 的 boot() 在 DOMContentLoaded 后执行，先等它完成再做初始状态断言
  await sleep(120);

  /* ---------------- 1. 默认值与初始状态 ---------------- */
  const st0 = S.getSettings();
  check('默认主题为 ember', st0.theme === 'ember', String(st0.theme));
  check('默认动效为 on', st0.motion === 'on', String(st0.motion));
  check('初始 html data-theme=ember', doc.documentElement.getAttribute('data-theme') === 'ember');
  check('初始 html data-motion=on', doc.documentElement.getAttribute('data-motion') === 'on');
  check('App.appearance 已暴露', win.App && typeof win.App.appearance === 'object');

  /* ---------------- 2. 无项目时也要有外观入口 ---------------- */
  win.location.hash = '#/settings';
  await sleep(60);
  check('无项目时设置页有外观面板', !!q('.appearance'));
  check('无项目时外观面板含 2 张色卡', qa('.theme-card').length === 2);
  check('无项目时动效开关存在', !!q('.switch'));

  /* ---------------- 3. 有项目时布局与控件 ---------------- */
  const p = S.addProject({ name: '外观测试项目', status: '进行中', start: '2026-10-01', end: '2026-12-31' });
  win.location.hash = '#/overview';
  await sleep(50);
  win.location.hash = '#/settings';
  await sleep(80);

  check('有项目时仍有外观面板', !!q('.appearance'));
  const cards = qa('.theme-card');
  check('色卡数量为 2', cards.length === 2, String(cards.length));
  check('色卡 data-value 为 ember/ocean',
    cards.map(c => c.getAttribute('data-value')).join(',') === 'ember,ocean',
    cards.map(c => c.getAttribute('data-value')).join(','));
  check('默认选中 ember', q('.theme-card.on') && q('.theme-card.on').getAttribute('data-value') === 'ember');
  check('动效开关 role=switch', q('.switch') && q('.switch').getAttribute('role') === 'switch');
  check('动效开关初始为开', q('.switch') && q('.switch').getAttribute('aria-checked') === 'true');

  /* ---------------- 4. 切换主题 ---------------- */
  const oceanCard = cards.find(c => c.getAttribute('data-value') === 'ocean');
  click(oceanCard);
  await sleep(80);

  check('切换后数据里 theme=ocean', S.getSettings().theme === 'ocean', String(S.getSettings().theme));
  check('切换后 html data-theme=ocean', doc.documentElement.getAttribute('data-theme') === 'ocean');
  const onNow = q('.theme-card.on');
  check('选中态已移到 ocean', onNow && onNow.getAttribute('data-value') === 'ocean');
  check('切换后有 toast 反馈', qa('.toast').length > 0, String(qa('.toast').length));

  /* ---------------- 5. 动效开关 ---------------- */
  click(q('.switch'));
  await sleep(80);
  check('关闭后数据里 motion=off', S.getSettings().motion === 'off', String(S.getSettings().motion));
  check('关闭后 html data-motion=off', doc.documentElement.getAttribute('data-motion') === 'off');
  check('关闭后 aria-checked=false', q('.switch').getAttribute('aria-checked') === 'false');
  check('关闭后状态文案为已关闭', txt(q('.switch-state')) === '已关闭', txt(q('.switch-state')));

  click(q('.switch'));
  await sleep(80);
  check('再次开启后 motion=on', S.getSettings().motion === 'on', String(S.getSettings().motion));
  check('再次开启后 data-motion=on', doc.documentElement.getAttribute('data-motion') === 'on');

  /* ---------------- 6. 持久化 ---------------- */
  const raw = win.localStorage.getItem('projsys.v1');
  let saved = null;
  try { saved = JSON.parse(raw); } catch (e) { saved = null; }
  check('主题已写入 localStorage', saved && saved.settings && saved.settings.theme === 'ocean',
    saved && saved.settings ? String(saved.settings.theme) : 'null');
  check('动效已写入 localStorage', saved && saved.settings && saved.settings.motion === 'on',
    saved && saved.settings ? String(saved.settings.motion) : 'null');

  /* ---------------- 7. 兼容性 ---------------- */
  // 旧备份没有 theme/motion 字段时，导入不应报错，且回落到默认
  const backup = S.exportData();
  if (backup && backup.data && backup.data.settings) {
    delete backup.data.settings.theme;
    delete backup.data.settings.motion;
  }
  let importOk = true;
  try { S.importData(JSON.stringify(backup), false); } catch (e) { importOk = false; }
  check('缺 theme/motion 的旧备份可导入', importOk);
  check('导入后缺字段回落 ember', S.getSettings().theme === 'ember', String(S.getSettings().theme));
  check('导入后缺字段回落 on', S.getSettings().motion === 'on', String(S.getSettings().motion));

  // reset 后回到默认主题
  S.updateSettings({ theme: 'ocean', motion: 'off' });
  S.reset();
  check('reset 后主题回 ember', S.getSettings().theme === 'ember', String(S.getSettings().theme));
  check('reset 后动效回 on', S.getSettings().motion === 'on', String(S.getSettings().motion));

  /* ---------------- 8. 无运行期错误 ---------------- */
  check('无 window.onerror', errors.length === 0, errors.join(' | '));

  /* ---------------- 汇总 ---------------- */
  const pass = results.filter(r => r.ok).length;
  results.forEach(r => {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  →  ' + r.extra));
  });
  console.log('\n通过 ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => {
  console.log('脚本异常: ' + (e && e.stack || e));
  process.exit(1);
});
