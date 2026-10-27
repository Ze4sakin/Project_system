/* 数据备份（导出/导入 JSON）专项断言 */
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
function makeDom() {
  const dom = new JSDOM(inlined, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.addEventListener('error', e => errors.push('onerror: ' + e.message));
  return dom;
}

const dom = makeDom();
const win = dom.window;
const doc = win.document;
win.HTMLElement.prototype.scrollIntoView = function () {};
win.scrollTo = function () {};
const S = win.Store;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, root) => (root || doc).querySelector(sel);
const qa = (sel, root) => Array.prototype.slice.call((root || doc).querySelectorAll(sel));
const fire = (el, type, opts) => el.dispatchEvent(new win.Event(type, Object.assign({ bubbles: true, cancelable: true }, opts)));
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const setVal = (el, v) => { el.value = v; fire(el, 'input'); fire(el, 'change'); };

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra === undefined ? '' : '  << ' + extra));
}

function openModalForm() {
  const m = q('#modalMask');
  return m ? q('form', m) : null;
}
function fillForm(form, vals) {
  Object.keys(vals).forEach(k => {
    const el = form.querySelector('[name="' + k + '"]');
    if (!el) return;
    setVal(el, vals[k]);
  });
}
function submitForm(form) {
  const btn = form.querySelector('button[type="submit"]') || q('[data-act="modal-ok"]');
  if (btn) click(btn); else fire(form, 'submit');
}

(async function main() {
  await sleep(150);

  /* ---------- 1. 空状态：导出按钮应禁用 ---------- */
  click(q('[data-nav="settings"]'));
  await sleep(360);
  let exBtn = q('[data-act="export-json"]');
  let imBtn = q('[data-act="import-json"]');
  check('B1 空数据时设置页有导出按钮且有导入按钮', !!exBtn && !!imBtn);
  check('B2 空数据时导出按钮为 disabled', !!exBtn && exBtn.disabled === true, exBtn && exBtn.disabled);
  check('B3 存在隐藏的 file input', !!q('#import-file') && q('#import-file').type === 'file');
  check('B4 无项目时设置页仍显示备份面板', !!q('.backup-zone'), q('.backup-zone') ? 'yes' : 'no');

  /* ---------- 2. 造数据 ---------- */
  const p = S.addProject({ name: '备份测试项目', code: 'BK-1', owner: '我', start: '2026-10-01', end: '2026-11-30', status: '进行中' });
  S.addTask({ projectId: p.id, title: '任务A', stage: '开发', start: '2026-10-01', end: '2026-10-10', estimateHours: 8, progress: 50, status: '进行中', priority: 'P0' });
  S.addTask({ projectId: p.id, title: '任务B', stage: '测试', start: '2026-10-11', end: '2026-10-20', estimateHours: 5, progress: 0, status: '未开始', priority: 'P1' });
  const r1 = S.addRequirement({ projectId: p.id, title: '需求一', priority: 'P0', status: '已通过', source: '内部' });
  const r2 = S.addRequirement({ projectId: p.id, title: '需求二', priority: 'P1', status: '草稿', source: '客户' });
  const r3 = S.addRequirement({ projectId: p.id, title: '需求三', priority: 'P2', status: '开发中', source: '内部' });
  S.addDefect({ projectId: p.id, title: '缺陷一', severity: '严重', status: '修复中' });
  S.saveReview({ projectId: p.id, week: '2026-W43', whatDone: '做完了A', blocked: '卡在接口', nextOne: '搞B', snapshot: { total: 2 } });
  // 删掉第一条需求，验证编号不重排
  S.deleteRequirement(r1.id);

  const codesBefore = S.getRequirements(p.id).map(r => S.reqCode(r)).sort();
  check('B5 删除首条需求后编号不重排', JSON.stringify(codesBefore) === JSON.stringify(['REQ-02', 'REQ-03']), JSON.stringify(codesBefore));

  /* ---------- 3. exportData 结构 ---------- */
  const bk = S.exportData();
  check('B6 备份带上 format 标识', bk.format === 'projsys.backup', bk.format);
  check('B7 备份带上 version 与 exportedAt', bk.version === 1 && typeof bk.exportedAt === 'number');
  const d = bk.data;
  check('B8 备份含五类实体 + settings',
    Array.isArray(d.projects) && Array.isArray(d.tasks) && Array.isArray(d.requirements) &&
    Array.isArray(d.defects) && Array.isArray(d.reviews) && !!d.settings);
  check('B9 备份条数正确',
    d.projects.length === 1 && d.tasks.length === 2 && d.requirements.length === 2 &&
    d.defects.length === 1 && d.reviews.length === 1,
    [d.projects.length, d.tasks.length, d.requirements.length, d.defects.length, d.reviews.length].join('/'));
  check('B10 备份是深拷贝（改备份不影响内存）', (function () {
    const before = S.getTasks(p.id)[0].title;
    d.tasks[0].title = '被篡改';
    return S.getTasks(p.id)[0].title === before;
  })());

  const text = JSON.stringify(bk, null, 2);
  check('B11 可序列化为 JSON 文本', text.length > 500 && JSON.parse(text).format === 'projsys.backup');

  /* ---------- 4. dryRun 预览 ---------- */
  const dry = S.importData(text, true);
  check('B12 dryRun 校验通过', dry.ok === true, dry.error);
  check('B13 dryRun 条数正确',
    dry.counts.projects === 1 && dry.counts.tasks === 2 && dry.counts.requirements === 2 &&
    dry.counts.defects === 1 && dry.counts.reviews === 1,
    JSON.stringify(dry.counts));
  check('B14 dryRun 不修改现有数据', S.getTasks(p.id).length === 2, S.getTasks(p.id).length);

  /* ---------- 5. 非法输入 ---------- */
  const bad1 = S.importData('这不是 json', true);
  check('B15 非 JSON 文本被拒', bad1.ok === false && /JSON/.test(bad1.error), bad1.error);
  const bad2 = S.importData('{"format":"other.app","data":{"projects":[]}}', true);
  check('B16 其他系统的备份被拒', bad2.ok === false && /格式标识/.test(bad2.error), bad2.error);
  const bad3 = S.importData('{"foo":1}', true);
  check('B17 无实体字段的对象被拒', bad3.ok === false, bad3.error);
  const bad4 = S.importData('[]', true);
  check('B18 数组根节点被拒', bad4.ok === false, bad4.error);

  /* ---------- 6. 孤儿数据计数 ---------- */
  const orphan = JSON.stringify({
    format: 'projsys.backup', version: 1,
    data: {
      projects: d.projects,
      tasks: d.tasks.concat([{ id: 'ghost', projectId: 'not-exist', title: '孤儿任务', start: '2026-10-01', end: '2026-10-02' }]),
      requirements: [], defects: [], reviews: [], settings: {}
    }
  });
  const dryOrphan = S.importData(orphan, true);
  check('B19 孤儿数据计入 dropped', dryOrphan.ok && dryOrphan.dropped === 1, dryOrphan.dropped);
  check('B20 孤儿不计入 counts', dryOrphan.counts.tasks === 2, dryOrphan.counts.tasks);

  /* ---------- 7. 裸对象（无 format 包裹）兼容 ---------- */
  const bare = S.importData(JSON.stringify(d), true);
  check('B21 裸数据对象可导入', bare.ok === true, bare.error);

  /* ---------- 8. 真正导入：清空后恢复 ---------- */
  S.reset();
  check('B22 清空后无数据', S.getProjects().length === 0 && S.getTasks(p.id).length === 0);

  const real = S.importData(text, false);
  check('B23 导入成功', real.ok === true, real.error);
  check('B24 导入后项目恢复', S.getProjects().length === 1 && S.getProjects()[0].name === '备份测试项目');
  check('B25 导入后任务恢复', S.getTasks(p.id).length === 2);
  check('B26 导入后复盘手写内容恢复', (function () {
    const rv = S.getReviews(p.id)[0];
    return !!rv && rv.whatDone === '做完了A' && rv.blocked === '卡在接口';
  })());
  const codesAfter = S.getRequirements(p.id).map(r => S.reqCode(r)).sort();
  check('B27 导入后需求编号与导出前一致', JSON.stringify(codesAfter) === JSON.stringify(codesBefore), JSON.stringify(codesAfter));
  check('B28 导入后 currentProjectId 有值', !!S.getCurrentProjectId(), S.getCurrentProjectId());
  check('B29 导入后新增需求编号不冲突', (function () {
    const nr = S.addRequirement({ projectId: p.id, title: '导入后新增', priority: 'P2' });
    return S.reqCode(nr) === 'REQ-04';
  })(), S.getRequirements(p.id).map(r => S.reqCode(r)).join(','));

  /* ---------- 9. 导入后持久化：新窗口重载仍在 ---------- */
  const savedRaw = win.localStorage.getItem('projsys.v1');
  const dom2 = new JSDOM(inlined, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) { w.localStorage.setItem('projsys.v1', savedRaw); }
  });
  const S2 = dom2.window.Store;
  check('B30 导入结果已落盘（新窗口可读）',
    S2.getProjects().length === 1 && S2.getTasks(S2.getProjects()[0].id).length === 2,
    S2.getProjects().length + ' 项目 / ' + (S2.getProjects()[0] ? S2.getTasks(S2.getProjects()[0].id).length : -1) + ' 任务');
  dom2.window.close();

  /* ---------- 10. 全空备份被拦在 UI 层 ---------- */
  const emptyBk = S.importData(JSON.stringify({
    format: 'projsys.backup', version: 1,
    data: { projects: [], tasks: [], requirements: [], defects: [], reviews: [], settings: {} }
  }), true);
  check('B31 空备份 dryRun 通过但 counts 全 0',
    emptyBk.ok === true && emptyBk.counts.projects === 0 && emptyBk.counts.tasks === 0);

  /* ---------- 11. UI：文件选择驱动导入 ---------- */
  S.reset();
  click(q('[data-nav="settings"]'));
  await sleep(360);
  let input = q('#import-file');
  check('B32 清空后设置页仍可进入备份区（导入入口存在）', !!input && !!q('[data-act="import-json"]'));

  // 用真实 File 对象走 change 事件
  const file = new win.File([text], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fire(input, 'change');
  await sleep(120);

  const modal = q('#modalMask');
  check('B33 选择文件后弹出导入确认框', !!modal && modal.hidden === false);
  const modalTxt = modal && !modal.hidden ? (q('#modalBody') || modal).textContent.replace(/\s+/g, ' ') : '';
  check('B34 确认框写出将导入的条数', /1 个项目/.test(modalTxt) && /2 条任务/.test(modalTxt), modalTxt.slice(0, 120));
  const okBtn = q('[data-act="modal-ok"]');
  check('B35 确认框有「确认导入」按钮', !!okBtn && /确认导入/.test(okBtn.textContent), okBtn && okBtn.textContent.trim());
  if (okBtn) click(okBtn);
  await sleep(600);
  check('B36 确认后数据已恢复', S.getProjects().length === 1 && S.getTasks(S.getProjects()[0].id).length === 2,
    S.getProjects().length + ' 项目');
  check('B37 导入后回到总览视图', /总览/.test((q('.page-title h1') || {}).textContent || ''), (q('.page-title h1') || {}).textContent);

  /* ---------- 12. 坏文件不弹框、不清数据 ---------- */
  const before = S.getProjects().length;
  click(q('[data-nav="settings"]'));
  await sleep(360);
  input = q('#import-file');
  check('B37b 坏文件用例前设置页已就绪', !!input);
  if (!input) { console.log('无法继续：设置页未渲染'); process.exit(1); }
  const badFile = new win.File(['{ 坏数据 '], 'bad.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [badFile], configurable: true });
  fire(input, 'change');
  await sleep(120);
  const m2 = q('#modalMask');
  check('B38 坏文件不弹确认框', !m2 || m2.hidden === true);
  check('B39 坏文件不影响现有数据', S.getProjects().length === before, S.getProjects().length);
  const toastTxt = qa('#toastWrap .toast').map(t => t.textContent).join(' ');
  check('B40 坏文件有错误提示', /导入失败/.test(toastTxt), toastTxt.slice(0, 80));

  /* ---------- 13. 导出真的触发下载 ---------- */
  let downloaded = null;
  const origCreate = win.URL.createObjectURL;
  win.URL.createObjectURL = function (blob) { downloaded = blob; return 'blob:mock'; };
  win.URL.revokeObjectURL = function () {};
  const origClick = win.HTMLAnchorElement.prototype.click;
  let anchorName = null;
  win.HTMLAnchorElement.prototype.click = function () { anchorName = this.download; };
  click(q('[data-nav="settings"]'));
  await sleep(360);
  click(q('[data-act="export-json"]'));
  await sleep(60);
  check('B41 导出触发下载且文件名带 .json', !!anchorName && /\.json$/.test(anchorName), anchorName);
  check('B42 导出内容为合法备份 JSON', !!downloaded, downloaded ? 'blob ok' : 'no blob');
  if (downloaded && downloaded.text) {
    const blobText = await downloaded.text();
    let parsed = null;
    try { parsed = JSON.parse(blobText); } catch (e) {}
    check('B43 下载文件可被重新解析', !!parsed && parsed.format === 'projsys.backup');
  } else {
    check('B43 下载文件可被重新解析', false, 'blob.text 不可用');
  }
  win.URL.createObjectURL = origCreate;
  win.HTMLAnchorElement.prototype.click = origClick;

  /* ---------- 汇总 ---------- */
  await sleep(60);
  const fail = results.filter(r => !r.ok);
  console.log('\n============================');
  console.log('断言 ' + results.length + ' 条，通过 ' + (results.length - fail.length) + '，失败 ' + fail.length);
  if (errors.length) console.log('运行期错误: ' + errors.join(' | '));
  else console.log('运行期错误: 0');
  console.log('============================');
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch(e => { console.error('脚本异常:', e); process.exit(2); });
