/* ============================================================
 * views.js · 视图渲染层
 * 每个视图返回 HTML 字符串；不直接绑事件（由 app.js 事件委托处理）
 * 所有统计数字来自 Store.metrics / Store.weeklySummary，视图内不写死
 * ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store;
  var Charts = global.Charts;
  var U = S.util;
  var C = S.CONST;

  /* ---------------- 视图内部 UI 状态（跨渲染保持） ---------------- */
  var ui = {
    plan: { stage: '', status: '', kw: '', selected: {}, group: true },
    req: { status: '', priority: '', owner: '', source: '', kw: '', selected: {} },
    bug: { severity: '', status: '', kw: '', selected: {} },
    dash: {},
    review: {
      draft: { whatDone: '', blocked: '', nextOne: '' },
      editingWeek: null,
      expanded: {},
      onlyWritten: false,
      loadedWeek: null
    }
  };

  /* ============================================================
   * 图标（统一 24 网格，线宽 1.6）
   * ============================================================ */
  var ICON_PATHS = {
    overview:
      '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/>' +
      '<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
    dashboard:
      '<path d="M20 12a8 8 0 1 0-16 0"/><path d="M12 12l4.6-4.6"/><circle cx="12" cy="12" r="1.7"/>' +
      '<path d="M4 16.5h2.2M17.8 16.5H20"/>',
    plan:
      '<path d="M4 6.5h16"/><path d="M4 12h10.5"/><path d="M4 17.5h13"/>',
    gantt:
      '<path d="M4 3.5v17"/><rect x="7" y="5" width="9.5" height="3.6" rx="1.4"/>' +
      '<rect x="10" y="10.6" width="8" height="3.6" rx="1.4"/><rect x="7" y="16.2" width="6" height="3.6" rx="1.4"/>',
    req:
      '<path d="M6.5 3h7.5l4 4v14h-11.5z"/><path d="M14 3v4.2h4"/><path d="M9.5 12h6"/><path d="M9.5 16h4"/>',
    defect:
      '<circle cx="12" cy="13.4" r="4.6"/><path d="M12 8.8V5.6"/><path d="M7.2 9.6 5 7.6"/>' +
      '<path d="M16.8 9.6 19 7.6"/><path d="M7.2 17.4 5 19.4"/><path d="M16.8 17.4 19 19.4"/>' +
      '<path d="M9.4 12.2h1.3"/><path d="M13.3 12.2h1.3"/>',
    review:
      '<path d="M4 6.2A2.7 2.7 0 0 1 6.7 3.5H19v17.5H6.7A2.7 2.7 0 0 1 4 18.3z"/>' +
      '<path d="M8 8.4h7.5"/><path d="M8 12.4h5"/>',
    settings:
      '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4"/>' +
      '<path d="M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7"/>',
    target:
      '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.6"/><path d="M12 3.8v2.4"/>',
    alert:
      '<path d="M12 3.6 21 19.4H3z"/><path d="M12 9.4v4.4"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/>',
    link:
      '<path d="M10.2 13.8a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7l-1 1"/>' +
      '<path d="M13.8 10.2a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7l1-1"/>',
    bug:
      '<circle cx="12" cy="13" r="4.6"/><path d="M12 8.4V5.4"/><path d="M7.2 9.2 5 7.2"/>' +
      '<path d="M16.8 9.2 19 7.2"/><path d="M7.2 17 5 19"/><path d="M16.8 17 19 19"/>',
    calendar:
      '<rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 9.6h17"/><path d="M8 3v3.4M16 3v3.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.4"/><path d="M16 16l4 4"/>',
    empty:
      '<rect x="3.5" y="6" width="17" height="13.5" rx="2.4"/><path d="M3.5 10.4h17"/><path d="M8.5 3v3.4M15.5 3v3.4"/>'
  };

  function icon(name, size) {
    var d = ICON_PATHS[name] || ICON_PATHS.empty;
    var s = size || 24;
    return '<span class="icon-3d"><svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + d + '</svg></span>';
  }

  function iconPlain(name, size) {
    var d = ICON_PATHS[name] || ICON_PATHS.empty;
    var s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + d + '</svg>';
  }

  /* ============================================================
   * 通用小部件
   * ============================================================ */
  function h(v) {
    return Charts.esc(v === undefined || v === null ? '' : v);
  }

  function chip(text, color) {
    // 颜色通过 --chip-c 注入，具体透明度由 .chip 里的 color-mix 派生，
    // 这样 hex 与 var(--token) 两种写法都能用，且随主题切换。
    var c = color || 'var(--text-secondary)';
    return '<span class="chip" style="--chip-c:' + c + '">' + h(text) + '</span>';
  }

  function statusChip(status) { return chip(status, C.COLOR[status] || 'var(--text-secondary)'); }

  function prioChip(p) { return chip(p, C.COLOR[p] || 'var(--text-secondary)'); }

  function lamp(health) {
    var map = { green: '绿', yellow: '黄', red: '红', gray: '—' };
    return '<span class="lamp lamp-' + (health || 'gray') + '" title="健康度 ' + (map[health] || '—') + '"></span>';
  }

  function healthText(health) {
    return { green: '健康', yellow: '关注', red: '告警', gray: '未启用' }[health] || '未启用';
  }

  function panel(title, body, opts) {
    opts = opts || {};
    var cls = 'panel sin' + (opts.span ? ' c' + opts.span : '') + (opts.cls ? ' ' + opts.cls : '');
    var sub = opts.sub ? '<span class="panel-sub">' + h(opts.sub) + '</span>' : '';
    var tools = opts.tools ? '<div class="panel-tools">' + opts.tools + '</div>' : '';
    var head = title ? '<div class="panel-head"><h2 class="panel-title">' + h(title) + '</h2>' + sub + tools + '</div>' : '';
    return '<section class="' + cls + '">' + head + '<div class="panel-body">' + body + '</div></section>';
  }

  function emptyBox(title, text, actions) {
    return Charts.emptyBlock(iconPlain('empty', 34), title, text, actions);
  }

  function noProjectPanel() {
    return panel('还没有项目', emptyBox(
      '先创建一个项目，所有计划、需求、缺陷、复盘都挂在项目下。',
      '数据保存在本机浏览器 localStorage，可在「设置 → 数据备份」导出或导入。',
      '<div class="empty-actions">' +
      '<button type="button" class="btn btn-primary" data-act="new-project">+ 新建项目</button>' +
      '</div>'
    ), { span: 12 });
  }

  function searchBox(scope, value, placeholder) {
    return '<label class="search-box">' + iconPlain('search', 14) +
      '<input type="text" data-filter="kw" data-scope="' + scope + '" value="' + h(value) + '" ' +
      'placeholder="' + h(placeholder || '搜索标题…') + '" />' +
      '</label>';
  }

  function selectBox(scope, field, options, value, allLabel) {
    var opts = '<option value="">' + h(allLabel || '全部') + '</option>' +
      options.map(function (o) {
        return '<option value="' + h(o) + '"' + (o === value ? ' selected' : '') + '>' + h(o) + '</option>';
      }).join('');
    return '<select class="select" data-filter="' + field + '" data-scope="' + scope + '">' + opts + '</select>';
  }

  function selectedIds(scope) {
    return Object.keys(ui[scope].selected).filter(function (k) { return ui[scope].selected[k]; });
  }

  function checkboxCell(scope, id, checked) {
    return '<input type="checkbox" class="checkbox" data-act="check-row" data-scope="' + scope + '" ' +
      'data-id="' + h(id) + '"' + (checked ? ' checked' : '') + ' />';
  }

  /** 取某个字段的去重取值（用于归属等动态下拉），空值剔除 */
  function uniqueValues(list, key) {
    var out = [];
    (list || []).forEach(function (x) {
      var v = String(x && x[key] !== undefined && x[key] !== null ? x[key] : '').trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    });
    out.sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
    return out;
  }

  /** 任一筛选/搜索条件生效即返回 true */
  function filterActive(scope, keys) {
    var f = ui[scope];
    if (!f) return false;
    for (var i = 0; i < keys.length; i++) {
      if (f[keys[i]] !== '' && f[keys[i]] !== undefined && f[keys[i]] !== null) return true;
    }
    return false;
  }

  /** 有匹配但被筛选时，toolbar 右侧的「清除筛选」入口 */
  function clearFilterBtn(scope, active) {
    if (!active) return '';
    return '<button type="button" class="btn btn-ghost btn-sm" data-act="clear-filter-' + scope + '">' +
      '清除筛选</button>';
  }

  /* ============================================================
   * 导航配置（8 项）
   * ============================================================ */
  var NAV = [
    { key: 'overview', label: '总览', icon: 'overview' },
    { key: 'dashboard', label: '仪表盘', icon: 'dashboard' },
    { key: 'plan', label: '计划', icon: 'plan' },
    { key: 'gantt', label: '甘特', icon: 'gantt' },
    { key: 'requirements', label: '需求', icon: 'req' },
    { key: 'defects', label: '缺陷', icon: 'defect' },
    { key: 'review', label: '复盘', icon: 'review' },
    { key: 'settings', label: '设置', icon: 'settings' }
  ];

  /* ============================================================
   * 1. 总览（F13）
   * ============================================================ */
  function projectHealthOrder(health) {
    return health === 'red' ? 0 : (health === 'yellow' ? 1 : (health === 'green' ? 2 : 3));
  }

  function overview() {
    var projects = S.getProjects();
    if (!projects.length) {
      var head = '<div class="page-title"><h1>多项目总览</h1>' +
        '<span class="page-hint">把所有项目摊开，先救最危险的那个</span></div>';
      return head + '<div class="c12">' + noProjectPanel() + '</div>';
    }

    var cards = projects.map(function (p) {
      var m = S.metrics(p.id);
      return { p: p, m: m };
    });

    // 排序：健康度 红→黄→绿 → 延期数倒序 → 截止日
    cards.sort(function (a, b) {
      var ha = projectHealthOrder(a.m.health), hb = projectHealthOrder(b.m.health);
      if (ha !== hb) return ha - hb;
      if (b.m.delayed !== a.m.delayed) return b.m.delayed - a.m.delayed;
      var ae = a.p.end ? U.toDate(a.p.end).getTime() : Infinity;
      var be = b.p.end ? U.toDate(b.p.end).getTime() : Infinity;
      return ae - be;
    });

    var summary = { active: 0, tasks: 0, delayed: 0, reviewTodo: 0 };
    cards.forEach(function (c) {
      if (c.p.status === '进行中' || c.p.status === '已延期' || c.p.status === '未开始') summary.active++;
      summary.tasks += c.m.total;
      summary.delayed += c.m.delayed;
      if (c.p.status !== '已归档' && !c.m.reviewStatus.doneThisWeek) summary.reviewTodo++;
    });

    var summaryBar = '<div class="summary-bar">' +
      sumItem('进行中项目', summary.active, '个', '含未开始与已延期') +
      sumItem('总任务数', summary.tasks, '个', '全部项目累计') +
      sumItem('总延期任务', summary.delayed, '个', summary.delayed > 0 ? '需要优先处理' : '当前无延期', summary.delayed > 0) +
      sumItem('本周待复盘', summary.reviewTodo, '个', '按项目统计') +
      '</div>';

    var grid = cards.map(function (c) {
      var p = c.p, m = c.m;
      var launchText = launchTextOf(m.daysToLaunch, p);
      return '<div class="card-shell sin" data-card="' + h(p.id) + '">' +
        '<article class="pcard" data-act="open-project" data-id="' + h(p.id) + '">' +
        '<div class="pcard-head">' +
        '<div style="min-width:0">' +
        '<div class="pcard-name">' + h(p.name || '未命名项目') + '</div>' +
        '<div class="pcard-code">' + h(p.code || '未设编号') + ' · ' + h(p.status) + '</div>' +
        '</div>' +
        '<div class="pcard-lamp">' + lamp(m.health) +
        '<span class="lamp-text">' + healthText(m.health) + '</span></div>' +
        '</div>' +
        '<div class="dual-bar">' +
        '<div class="db-row"><span class="db-label">实际</span>' +
        '<span class="bar-track"><span class="bar-fill actual" style="transform:scaleX(' + (m.actualProgress / 100).toFixed(4) + ')"></span></span>' +
        '<span class="db-val">' + round1(m.actualProgress) + '%</span></div>' +
        '<div class="db-row"><span class="db-label">计划</span>' +
        '<span class="bar-track"><span class="bar-fill plan" style="transform:scaleX(' + (m.planProgress / 100).toFixed(4) + ')"></span></span>' +
        '<span class="db-val">' + round1(m.planProgress) + '%</span></div>' +
        '</div>' +
        '<div class="proj-meta">' +
        '<span>' + h(launchText) + '</span>' +
        '<span>延期 <b>' + m.delayed + '</b></span>' +
        '<span>任务 <b>' + m.total + '</b></span>' +
        '<span class="pcard-actions">' +
        '<button type="button" class="link-btn" data-act="edit-project" data-id="' + h(p.id) + '">编辑</button>' +
        '<button type="button" class="link-btn danger" data-act="del-project" data-id="' + h(p.id) + '">删除</button>' +
        '</span>' +
        '</div>' +
        '</article></div>';
    }).join('');

    var head2 = '<div class="page-title"><h1>多项目总览</h1>' +
      '<span class="page-hint">最危险的排在左上角 · 点击卡片进入该项目仪表盘</span>' +
      '<span style="margin-left:auto"><button type="button" class="btn btn-primary" data-act="new-project">' +
      iconPlain('plus', 14) + ' 新建项目</button></span></div>';

    return head2 + summaryBar + '<div class="proj-grid" id="projGrid">' + grid + '</div>';
  }

  function sumItem(label, value, unit, hint, warn) {
    return '<div class="sum-item">' +
      '<div class="sum-label">' + h(label) + '</div>' +
      '<div class="sum-num' + (warn ? ' warn' : '') + '">' + value +
      '<span style="font-size:12px;font-weight:400;color:var(--text-dim);margin-left:3px">' + h(unit) + '</span></div>' +
      '<div class="auto-sub" style="font-size:11px;color:var(--text-dim)">' + h(hint) + '</div>' +
      '</div>';
  }

  function round1(n) {
    var v = Number(n) || 0;
    return Math.round(v * 10) / 10;
  }

  /** 上线倒计时文案：已完成/已归档的项目不再提示"超期" */
  function launchTextOf(days, project) {
    if (days === null || days === undefined) return '未设上线日';
    var finished = project && (project.status === '已完成' || project.status === '已归档');
    if (days < 0) {
      return (finished ? '已结束 ' : '已超期 ') + Math.abs(days) + ' 天';
    }
    return '距上线 ' + days + ' 天';
  }

  /* ============================================================
   * 2. 仪表盘（F5）
   * ============================================================ */
  /**
   * KPI 卡（PRD 6.7.6）：透视图标 → 名称 → 主数值 → 一行辅助信息 → 底部 60px sparkline
   * 辅助信息压成一行 11px 文字（受卡高限制），文字 ≥11px 且数字 tabular-nums
   */
  function kpiCard(opts) {
    var band = opts.band || 'var(--amber-500)';
    var meta = opts.sub || '';
    if (!meta && opts.metrics && opts.metrics.length) {
      meta = opts.metrics.map(function (x) {
        return h(x.label) + '<i' + (x.warn ? ' class="warn"' : '') + '>' + h(x.value) + '</i>';
      }).join('<span class="sep">·</span>');
    }
    return '<div class="kpi c3 sin' + (opts.alarm ? ' alarm' : '') + '" style="--band:' + band + '">' +
      '<span class="kpi-band"></span>' +
      '<div class="kpi-top">' + icon(opts.icon, 16) +
        '<span class="kpi-name">' + h(opts.name) + '</span>' +
        (meta ? '<span class="kpi-sub">' + meta + '</span>' : '') +
      '</div>' +
      '<div class="kpi-value">' + opts.value + (opts.unit ? '<span class="unit">' + h(opts.unit) + '</span>' : '') + '</div>' +
      (opts.spark || '') +
      '</div>';
  }

  /**
   * 近 8 周趋势：复盘快照（旧 → 新，最多 7 个）+ 当前值，够不着 2 点就画平线
   * @param {string} projectId
   * @param {Function} pick 从快照里取值，取不到返回 null
   * @param {number} current 当前值（作为最后一个点）
   * @param {string} color 线色（SVG 属性不吃 CSS 变量，这里传具体色值）
   */
  function sparkOf(projectId, pick, current, color) {
    var revs = S.getReviews(projectId); // 新 → 旧
    var vals = [];
    var n = Math.min(revs.length, 7);
    for (var i = n - 1; i >= 0; i--) {
      var snap = revs[i] && revs[i].snapshot;
      if (!snap) continue;
      var v = pick(snap);
      if (v === null || v === undefined || isNaN(Number(v))) continue;
      vals.push(Number(v));
    }
    var cur = Number(current) || 0;
    vals.push(cur);
    if (vals.length < 2) vals = [cur, cur];
    return Charts.sparkline(vals, { color: color });
  }

  /** 快照里「已通过」的需求条数 */
  function approvedInSnapshot(snap) {
    if (!snap || !snap.reqStatus) return null;
    var c = 0;
    Object.keys(snap.reqStatus).forEach(function (k) {
      if (snap.reqStatus[k] === '已通过') c++;
    });
    return c;
  }

  function trendArrow(cur, prev, unit) {
    if (prev === null || prev === undefined) return '<span class="trend-flat">—</span>';
    var d = Math.round((cur - prev) * 10) / 10;
    if (d === 0) return '<span class="trend-flat">持平</span>';
    var cls = unit === 'down-good' ? (d < 0 ? 'trend-up' : 'trend-down') : (d > 0 ? 'trend-up' : 'trend-down');
    return '<span class="' + cls + '">' + (d > 0 ? '▲' : '▼') + ' ' + Math.abs(d) + '</span>';
  }

  function dashboard() {
    var p = S.getCurrentProject();
    if (!p) {
      return '<div class="page-title"><h1>项目仪表盘</h1></div><div class="c12">' + noProjectPanel() + '</div>';
    }
    var m = S.metrics(p.id);

    var head = '<div class="page-title"><h1>' + h(p.name || '未命名项目') + '</h1>' +
      '<span class="page-hint">' + h(p.code || '未设编号') + ' · 负责人 ' + h(p.owner || '—') +
      ' · ' + h(p.start || '—') + ' ~ ' + h(p.end || '—') + '</span>' +
      '<span style="margin-left:auto;display:flex;gap:10px;align-items:center">' +
      statusChip(p.status) + lamp(m.health) +
      '<span style="font-size:13px;color:var(--text-secondary)">' + h(launchTextOf(m.daysToLaunch, p)) + '</span></span></div>';

    /* ---- 4 张 KPI（PRD F5.2：整体进度 / 任务概览 / 需求概览 / 缺陷概览），每卡底部 8 周 sparkline ---- */
    var kpis =
      kpiCard({
        icon: 'target', name: '整体进度', band: 'var(--ember-500)',
        value: round1(m.actualProgress), unit: '%',
        sub: '计划 ' + round1(m.planProgress) + '% · 偏差 ' +
          '<b style="color:' + (m.deviation < 0 ? 'var(--ember-400)' : 'var(--c-green)') + '">' +
          (m.deviation >= 0 ? '+' : '') + round1(m.deviation) + ' pp</b>',
        spark: sparkOf(p.id, function (s) {
          return s.metrics ? s.metrics.actualProgress : null;
        }, m.actualProgress, 'var(--ember-500)'),
        alarm: m.deviation < -15
      }) +
      kpiCard({
        icon: 'plan', name: '任务概览', band: m.delayed > 0 ? 'var(--ember-500)' : 'var(--amber-500)',
        value: m.total, unit: '个',
        metrics: [
          { label: '已完成', value: m.done },
          { label: '进行中', value: m.doing },
          { label: '未开始', value: m.notStarted },
          { label: '延期', value: m.delayed, warn: m.delayed > 0 },
          { label: '阻塞', value: m.blocked, warn: m.blocked > 0 },
          { label: '已取消', value: m.canceled }
        ],
        spark: sparkOf(p.id, function (s) {
          return s.metrics ? s.metrics.total : null;
        }, m.total, m.delayed > 0 ? 'var(--ember-500)' : 'var(--amber-500)'),
        alarm: m.delayRatio >= 0.25
      }) +
      kpiCard({
        icon: 'link', name: '需求概览', band: 'var(--c-cyan)',
        value: m.reqApproved, unit: '已通过',
        metrics: [
          { label: '已上线', value: m.reqLive },
          { label: '覆盖率', value: round1(m.coverage) + '%' },
          { label: '变更次数', value: m.reqChanged }
        ],
        spark: sparkOf(p.id, approvedInSnapshot, m.reqApproved, 'var(--c-cyan)')
      }) +
      kpiCard({
        icon: 'bug', name: '缺陷概览', band: m.defectFatal > 0 ? 'var(--ember-500)' : 'var(--amber-500)',
        value: m.defectStock, unit: '存量',
        metrics: [
          { label: '本周新增', value: m.defectNewWeek },
          { label: '本周关闭', value: m.defectClosedWeek },
          { label: '致命+严重', value: m.defectFatal + m.defectSevere, warn: m.defectFatal > 0 }
        ],
        spark: sparkOf(p.id, function (s) {
          return s.metrics ? s.metrics.stockCount : null;
        }, m.defectStock, m.defectFatal > 0 ? 'var(--ember-500)' : 'var(--amber-500)'),
        alarm: m.defectFatal > 0
      });

    /* ---- 双环 + 折线 ---- */
    var donutBody = m.hasTasks ? Charts.donut({ plan: m.planProgress, actual: m.actualProgress })
      : emptyBox('还没有任务排期', '任务建立后，计划与实际进度会自动生成。',
        '<div class="empty-actions"><button type="button" class="btn btn-sm" data-nav="plan">去排计划</button></div>');

    var lineBody = m.trend.hasData ? Charts.line({ weeks: m.trend.weeks, plan: m.trend.plan, actual: m.trend.actual })
      : emptyBox('任务排期后自动生成', '需要至少 2 周的数据才能画出趋势。', '');

    /* ---- 优先级 / 日历 ---- */
    var prioBody = m.total ? Charts.prioBars({ counts: m.priorityCounts })
      : emptyBox('暂无优先级分布', '新增任务后自动统计。', '');

    var calBody = Charts.calendar(m.calendar);

    /* ---- 延期清单 Top10 ---- */
    var delayedRows = m.delayedTasks.slice(0, 10).map(function (dt) {
      return '<tr>' +
        '<td class="name" title="' + h(dt.task.title) + '">' + h(dt.task.title) + '</td>' +
        '<td>' + h(dt.task.owner || '—') + '</td>' +
        '<td>' + h(dt.task.end) + '</td>' +
        '<td class="risk">' + dt.delayDays + ' 天</td>' +
        '<td class="name" title="' + h(dt.task.blockedReason) + '">' + h(dt.task.blockedReason || '—') + '</td>' +
        '<td>' + h(dt.task.stage) + '</td>' +
        '</tr>';
    }).join('');
    var delayedBody = m.delayedTasks.length ? (
      '<div style="overflow-x:auto"><table class="mini-table">' +
      '<thead><tr><th>任务</th><th>负责人</th><th>计划完成</th><th>延期</th><th>阻塞原因</th><th>阶段</th></tr></thead>' +
      '<tbody>' + delayedRows + '</tbody></table></div>'
    ) : emptyBox('没有延期任务', '所有未完成任务都还在计划期内。', '');

    /* ---- 复盘状态 ---- */
    var rs = m.reviewStatus;
    var reviewBody = '<div class="review-state">' +
      '<div class="rs-row"><span>本周复盘</span><span>' +
      '<span class="rs-dot' + (rs.doneThisWeek ? ' done' : '') + '"></span> ' +
      (rs.doneThisWeek ? '已记录' : '还没写') + '</span></div>' +
      '<div class="rs-row"><span>上次复盘距今</span><b>' + (rs.lastDays === null ? '—' : rs.lastDays + ' 天') + '</b></div>' +
      '<div class="rs-row"><span>连续复盘</span><b>' + rs.streak + ' 周</b></div>' +
      '<div class="rs-row"><span>历史复盘</span><b>' + rs.count + ' 次</b></div>' +
      '<div style="margin-top:4px"><button type="button" class="btn btn-sm" data-nav="review">' +
      (rs.doneThisWeek ? '查看本周复盘' : '去写本周复盘') + '</button></div>' +
      '</div>';

    /* ---- 风险与提醒 ---- */
    var alerts = [];
    if (m.delayed > 0) alerts.push({ c: 'var(--ember-500)', t: '延期任务 ' + m.delayed + ' 个', s: '按延期天数倒序见左侧清单' });
    if (m.blocked > 0) alerts.push({ c: 'var(--c-orange)', t: '阻塞任务 ' + m.blocked + ' 个', s: '阻塞原因已记录在任务上' });
    var unplanned = m.reqApproved - m.reqLinked;
    if (unplanned > 0) alerts.push({ c: 'var(--amber-500)', t: '已通过但未排期需求 ' + unplanned + ' 个', s: '需求覆盖率 ' + round1(m.coverage) + '%' });
    if (m.defectFatal + m.defectSevere > 0) alerts.push({ c: 'var(--ember-600)', t: '致命/严重缺陷存量 ' + (m.defectFatal + m.defectSevere) + ' 个', s: '致命 ' + m.defectFatal + ' · 严重 ' + m.defectSevere });
    if (!rs.doneThisWeek && (p.status === '进行中' || p.status === '已延期')) alerts.push({ c: 'var(--amber-300)', t: '本周复盘还没写', s: '只提醒一次，不催办' });

    var alertBody = alerts.length ? alerts.map(function (a) {
      return '<div class="ms-item" style="align-items:flex-start">' +
        '<span style="width:6px;height:6px;border-radius:50%;margin-top:7px;flex:0 0 auto;background:' + a.c +
        ';box-shadow:0 0 10px color-mix(in srgb, ' + a.c + ' 60%, transparent)"></span>' +
        '<div class="ms-main"><div class="ms-title">' + h(a.t) + '</div>' +
        '<div class="ms-sub">' + h(a.s) + '</div></div></div>';
    }).join('') : emptyBox('当前没有风险项', '延期、阻塞、未排期需求、严重缺陷都会出现在这里。', '');

    return head + kpis +
      panel('进度对比（计划 vs 实际）', donutBody, { span: 4 }) +
      panel('进度趋势', lineBody, { span: 8, sub: '按周采样' }) +
      panel('优先级分布', prioBody, { span: 4 }) +
      panel('风险告警日历', calBody, { span: 4 }) +
      panel('复盘状态', reviewBody, { span: 4 }) +
      panel('延期清单 Top10', delayedBody, { span: 8, sub: m.delayedTasks.length ? '共 ' + m.delayedTasks.length + ' 个' : '' }) +
      panel('风险与提醒', alertBody, { span: 4, cls: 'dash-alerts', sub: '由任务与需求数据实时推导' });
  }

  /* ============================================================
   * 3. 计划（F1）
   * ============================================================ */
  function filteredTasks(p) {
    var f = ui.plan;
    return S.getTasks(p.id).filter(function (t) {
      if (f.stage && (t.stage || '未分阶段') !== f.stage) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.kw) {
        var kw = f.kw.toLowerCase();
        var hay = (t.title + ' ' + t.owner + ' ' + t.stage + ' ' + t.blockedReason).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  function plan() {
    var p = S.getCurrentProject();
    if (!p) return '<div class="page-title"><h1>计划</h1></div><div class="c12">' + noProjectPanel() + '</div>';

    var all = S.getTasks(p.id);
    var stages = [];
    all.forEach(function (t) {
      var s = t.stage || '未分阶段';
      if (stages.indexOf(s) < 0) stages.push(s);
    });
    var list = filteredTasks(p);
    var selIds = selectedIds('plan');
    var allChecked = list.length > 0 && list.every(function (t) { return ui.plan.selected[t.id]; });
    var hasFilter = filterActive('plan', ['stage', 'status', 'kw']);

    var toolbar = '<div class="toolbar">' +
      '<div class="toolbar-left">' +
      '<button type="button" class="btn btn-primary" data-act="new-task">' + iconPlain('plus', 14) + ' 新增任务</button>' +
      '<button type="button" class="btn btn-danger" data-act="batch-del-task"' + (selIds.length ? '' : ' disabled') + '>' +
      '批量删除' + (selIds.length ? ' (' + selIds.length + ')' : '') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="toggle-group">' +
      (ui.plan.group ? '按阶段分组：开' : '按阶段分组：关') + '</button>' +
      '</div>' +
      '<div class="toolbar-right">' +
      selectBox('plan', 'stage', stages, ui.plan.stage, '全部阶段') +
      selectBox('plan', 'status', C.TASK_STATUS, ui.plan.status, '全部状态') +
      searchBox('plan', ui.plan.kw, '搜索任务 / 负责人…') +
      clearFilterBtn('plan', hasFilter) +
      '</div></div>';

    var rows = '';
    if (!list.length) {
      rows = '<tr><td colspan="12" style="padding:0">' + emptyBox(
        all.length ? '没有匹配的任务' : '还没有任务',
        all.length ? '换个筛选条件试试。' : '任务是一切的起点：填标题、起止日即可，其余可后补。',
        all.length ? '<div class="empty-actions"><button type="button" class="btn btn-sm" data-act="clear-filter-plan">清除筛选</button></div>'
          : '<div class="empty-actions"><button type="button" class="btn btn-primary btn-sm" data-act="new-task">+ 新增任务</button></div>'
      ) + '</td></tr>';
    } else if (ui.plan.group) {
      var groups = {};
      var order = [];
      list.forEach(function (t) {
        var s = t.stage || '未分阶段';
        if (!groups[s]) { groups[s] = []; order.push(s); }
        groups[s].push(t);
      });
      order.forEach(function (s) {
        rows += '<tr class="group-row"><td colspan="12">' + h(s) + ' · ' + groups[s].length + ' 个任务</td></tr>';
        groups[s].forEach(function (t) { rows += taskRow(t); });
      });
    } else {
      list.forEach(function (t) { rows += taskRow(t); });
    }

    var table = '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
      '<th class="col-check"><input type="checkbox" class="checkbox" data-act="check-all" data-scope="plan"' + (allChecked ? ' checked' : '') + ' /></th>' +
      '<th>任务标题</th><th>阶段</th><th>归属</th><th>开始</th><th>结束</th><th class="table-num">预计工时</th>' +
      '<th class="table-num">进度</th><th>状态</th><th>优先级</th><th>里程碑</th><th class="col-ops">操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    return '<div class="page-title"><h1>计划</h1>' +
      '<span class="page-hint">共 ' + all.length + ' 个任务，当前显示 ' + list.length + ' 个</span></div>' +
      panel('任务列表', toolbar + '<div style="height:14px"></div>' + table, { span: 12, cls: 'fill-panel' });
  }

  function taskRow(t) {
    var delayed = S.isDelayedNow(t);
    var milestone = t.milestone ? chip('里程碑', 'var(--amber-500)') : '<span style="color:var(--text-dim)">—</span>';
    return '<tr data-row-id="' + h(t.id) + '"' + (ui.plan.selected[t.id] ? ' class="selected"' : '') + '>' +
      '<td class="col-check">' + checkboxCell('plan', t.id, !!ui.plan.selected[t.id]) + '</td>' +
      '<td class="title-cell"><span class="cell-clip" title="' + h(t.title) + '">' + h(t.title) + '</span></td>' +
      '<td>' + h(t.stage) + '</td>' +
      '<td>' + h(t.owner || '—') + '</td>' +
      '<td class="table-num">' + h(t.start || '—') + '</td>' +
      '<td class="table-num">' + h(t.end || '—') + (delayed ? ' <span style="color:var(--ember-400)">·超期</span>' : '') + '</td>' +
      '<td class="table-num">' + (t.estimateHours ? round1(t.estimateHours) : '—') + '</td>' +
      '<td class="table-num">' + t.progress + '%</td>' +
      '<td>' + statusChip(t.status) + (t.status === '阻塞' && t.blockedReason ? ' <span class="panel-sub" title="' + h(t.blockedReason) + '">' + h(t.blockedReason.slice(0, 8)) + '</span>' : '') + '</td>' +
      '<td>' + prioChip(t.priority) + '</td>' +
      '<td>' + milestone + '</td>' +
      '<td class="col-ops">' +
      '<button type="button" class="link-btn" data-act="edit-task" data-id="' + h(t.id) + '">编辑</button> ' +
      '<button type="button" class="link-btn danger" data-act="del-task" data-id="' + h(t.id) + '">删除</button>' +
      '</td></tr>';
  }

  /* ============================================================
   * 4. 甘特（F2）
   * ============================================================ */
  var GANTT_STATUS_COLOR = {
    '进行中': 'var(--c-cyan)',
    '阻塞': 'var(--c-orange)',
    '已完成': 'var(--text-dim)',
    '未开始': 'var(--text-secondary)',
    '已取消': 'var(--text-dim)',
    '已延期': 'var(--ember-500)'
  };

  function gantt() {
    var p = S.getCurrentProject();
    if (!p) return '<div class="page-title"><h1>甘特图</h1></div><div class="c12">' + noProjectPanel() + '</div>';

    var tasks = S.getTasks(p.id);
    if (!tasks.length) {
      return '<div class="page-title"><h1>甘特图</h1></div>' +
        '<div class="c12">' + panel('时间轴', emptyBox(
          '还没有任务可以排期',
          '任务填了开始与结束日期后，横条会自动落到时间轴上。',
          '<div class="empty-actions"><button type="button" class="btn btn-primary btn-sm" data-act="new-task">+ 新增任务</button></div>'
        ), { span: 12, cls: 'gantt-panel' }) + '</div>';
    }

    var m = S.metrics(p.id);
    var stageIdx = {};
    m.stages.forEach(function (s, i) { stageIdx[s.name] = i; });

    var sorted = tasks.slice().sort(function (a, b) {
      var ai = stageIdx[a.stage || '未分阶段'];
      var bi = stageIdx[b.stage || '未分阶段'];
      ai = ai === undefined ? 99 : ai;
      bi = bi === undefined ? 99 : bi;
      if (ai !== bi) return ai - bi;
      var as = U.toDate(a.start), bs = U.toDate(b.start);
      return (as ? as.getTime() : 0) - (bs ? bs.getTime() : 0);
    });

    // 时间范围
    var minD = null, maxD = null;
    sorted.forEach(function (t) {
      var s = U.toDate(t.start), e = U.toDate(t.end);
      if (s && (!minD || s < minD)) minD = s;
      if (e && (!maxD || e > maxD)) maxD = e;
    });
    var todayD = U.today();
    if (!minD) minD = U.addDays(todayD, -7);
    if (!maxD) maxD = U.addDays(todayD, 21);
    if (minD > todayD) minD = todayD;
    if (maxD < todayD) maxD = todayD;
    minD = U.addDays(minD, -3);
    maxD = U.addDays(maxD, 3);

    var dayW = 22;
    var span = U.diffDays(maxD, minD) + 1;
    var totalW = span * dayW;

    // 表头：按周刻度
    var ticks = '';
    var cur = U.weekStart(minD);
    var guard = 0;
    while (cur <= maxD && guard < 200) {
      var leftDays = U.diffDays(cur, minD);
      var x = leftDays * dayW;
      var w = 7 * dayW;
      if (x < 0) { w += x; x = 0; }
      if (x + w > totalW) w = totalW - x;
      if (w > 0) {
        ticks += '<span style="position:absolute;left:' + x + 'px;width:' + w + 'px;top:0;bottom:0;' +
          'border-right:1px solid rgba(255,255,255,0.055);display:flex;align-items:center;' +
          'justify-content:center;font-size:10px;color:var(--text-dim)">' +
          (cur.getMonth() + 1) + '/' + cur.getDate() + '</span>';
      }
      cur = U.addDays(cur, 7);
      guard++;
    }

    // 行序列（阶段分组行 + 任务行）
    var rowsSeq = [];
    var lastStage = null;
    sorted.forEach(function (t) {
      var st = t.stage || '未分阶段';
      if (st !== lastStage) {
        rowsSeq.push({ type: 'group', label: st });
        lastStage = st;
      }
      rowsSeq.push({ type: 'task', task: t });
    });

    var leftHtml = '';
    var rightHtml = '';
    rowsSeq.forEach(function (row) {
      if (row.type === 'group') {
        leftHtml += '<div class="gl-row group"><span class="gl-title">' + h(row.label) + '</span></div>';
        rightHtml += '<div class="grow group"></div>';
        return;
      }
      var t = row.task;
      leftHtml += '<div class="gl-row"><span class="gl-title" title="' + h(t.title) + '">' +
        (t.milestone ? '<span style="color:var(--amber-500)">◆ </span>' : '') + h(t.title) + '</span></div>';

      var s = U.toDate(t.start), e = U.toDate(t.end);
      var inner = '';
      if (s && e) {
        var x = U.diffDays(s, minD) * dayW;
        var w = Math.max((U.diffDays(e, s) + 1) * dayW, 4);
        var delayed = S.isDelayedNow(t);
        var color = delayed ? GANTT_STATUS_COLOR['已延期'] : (GANTT_STATUS_COLOR[t.status] || 'var(--text-dim)');
        var fillPct = t.status === '已完成' ? 100 : t.progress;
        inner += '<div class="gbar" style="left:' + x + 'px;width:' + w + 'px;' +
          // 底色必须用 color-mix：颜色值可能是 var(--token)，拼 "2E" 后缀会整条失效
          'background:color-mix(in srgb, ' + color + ' 22%, transparent)" ' +
          'title="' + h(t.title + '\n' + t.start + ' ~ ' + t.end + ' · ' + t.progress + '% · ' + t.status) + '">' +
          '<span class="gbar-fill" style="width:' + fillPct + '%;background:' + color + '"></span>' +
          (w > 54 ? '<span class="gbar-label">' + t.progress + '%</span>' : '') +
          '</div>';
        if (t.milestone) {
          var mx = x + w - 5;
          var mcls = t.status === '已完成' ? ' done' : (delayed ? ' risk' : '');
          inner += '<div class="gms' + mcls + '" style="left:' + mx + 'px"></div>';
        }
      }
      rightHtml += '<div class="grow">' + inner + '</div>';
    });

    var todayX = U.diffDays(todayD, minD) * (dayW) + dayW / 2;
    var todayLine = (todayX >= 0 && todayX <= totalW)
      ? '<div class="today-line" style="left:' + todayX + 'px"></div>' : '';

    var legend = '<div class="gantt-legend">' +
      [[C.COLOR['进行中'], '进行中'], [C.COLOR['阻塞'], '阻塞'], [C.COLOR['已完成'], '已完成'],
      ['var(--text-secondary)', '未开始'], [C.COLOR['P0'], '延期']].map(function (x) {
        return '<span class="lg"><span class="lg-bar" style="background:' + x[0] + '"></span>' + x[1] + '</span>';
      }).join('') +
      '<span class="lg"><span style="color:var(--amber-500)">◆</span> 里程碑</span>' +
      '<span class="lg"><span style="width:1px;height:10px;background:var(--ember-500);display:inline-block"></span> 今日线</span>' +
      '</div>';

    var ganttHtml = '<div class="gantt-wrap">' +
      '<div class="gantt-inner">' +
      '<div class="gantt-left">' +
      '<div class="gl-head">任务 / 阶段</div>' + leftHtml +
      '</div>' +
      '<div class="gantt-right" style="width:' + totalW + 'px">' +
      '<div class="ghead" style="width:' + totalW + 'px;position:sticky;top:0">' + ticks + '</div>' +
      '<div style="position:relative">' + todayLine + rightHtml + '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    return '<div class="page-title"><h1>甘特图</h1>' +
      '<span class="page-hint">共 ' + tasks.length + ' 个任务 · 时间轴 ' + U.fmtFull(minD) + ' ~ ' + U.fmtFull(maxD) + '</span></div>' +
      panel('时间轴', ganttHtml + legend, { span: 12, cls: 'gantt-panel' });
  }

  /* ============================================================
   * 5. 需求（F3）
   * ============================================================ */
  function requirementRows(p) {
    var f = ui.req;
    var all = S.getRequirements(p.id);
    var list = all.map(function (r) { return { r: r, code: S.reqCode(r) }; })
      .filter(function (x) {
        var r = x.r;
        if (f.status && r.status !== f.status) return false;
        if (f.priority && r.priority !== f.priority) return false;
        if (f.owner && (r.owner || '') !== f.owner) return false;
        if (f.source && r.source !== f.source) return false;
        if (f.kw) {
          var hay = (r.title + ' ' + r.desc + ' ' + r.owner + ' ' + r.source).toLowerCase();
          if (hay.indexOf(f.kw.toLowerCase()) < 0) return false;
        }
        return true;
      });
    return { all: all, list: list };
  }

  function requirements() {
    var p = S.getCurrentProject();
    if (!p) return '<div class="page-title"><h1>需求</h1></div><div class="c12">' + noProjectPanel() + '</div>';

    var data = requirementRows(p);
    var selIds = selectedIds('req');
    var allChecked = data.list.length > 0 && data.list.every(function (x) { return ui.req.selected[x.r.id]; });
    var owners = uniqueValues(data.all, 'owner');
    var hasFilter = filterActive('req', ['status', 'priority', 'owner', 'source', 'kw']);

    var toolbar = '<div class="toolbar">' +
      '<div class="toolbar-left">' +
      '<button type="button" class="btn btn-primary" data-act="new-req">' + iconPlain('plus', 14) + ' 新增需求</button>' +
      '<button type="button" class="btn btn-danger" data-act="batch-del-req"' + (selIds.length ? '' : ' disabled') + '>' +
      '批量删除' + (selIds.length ? ' (' + selIds.length + ')' : '') + '</button>' +
      '</div>' +
      '<div class="toolbar-right">' +
      selectBox('req', 'priority', C.PRIORITY, ui.req.priority, '全部优先级') +
      selectBox('req', 'status', C.REQ_STATUS, ui.req.status, '全部状态') +
      selectBox('req', 'source', C.REQ_SOURCE, ui.req.source, '全部来源') +
      selectBox('req', 'owner', owners, ui.req.owner, '全部归属') +
      searchBox('req', ui.req.kw, '搜索需求…') +
      clearFilterBtn('req', hasFilter) +
      '</div></div>';

    var rows = '';
    if (!data.list.length) {
      rows = '<tr><td colspan="9" style="padding:0">' + emptyBox(
        data.all.length ? '没有匹配的需求' : '需求池还是空的',
        data.all.length ? '换个筛选条件试试。' : '把要做的需求记下来，关联任务后仪表盘才能算出覆盖率。',
        data.all.length ? '<div class="empty-actions"><button type="button" class="btn btn-sm" data-act="clear-filter-req">清除筛选</button></div>'
          : '<div class="empty-actions"><button type="button" class="btn btn-primary btn-sm" data-act="new-req">+ 新增需求</button></div>'
      ) + '</td></tr>';
    } else {
      data.list.forEach(function (x) {
        var r = x.r;
        var linked = (r.taskIds || []).length;
        rows += '<tr data-row-id="' + h(r.id) + '"' + (ui.req.selected[r.id] ? ' class="selected"' : '') + '>' +
          '<td class="col-check">' + checkboxCell('req', r.id, !!ui.req.selected[r.id]) + '</td>' +
          '<td class="table-num" style="white-space:nowrap">' + h(x.code) +
          (linked ? '<span class="panel-sub" style="display:block">' + linked + ' 个任务</span>' : '') + '</td>' +
          '<td class="title-cell"><span class="cell-clip" title="' + h(r.title) + '">' + h(r.title) + '</span></td>' +
          '<td>' + prioChip(r.priority) + '</td>' +
          '<td>' + statusChip(r.status) + '</td>' +
          '<td>' + h(r.source) + '</td>' +
          '<td>' + h(r.owner || '—') + '</td>' +
          '<td class="table-num">' + h(r.expectDate || '—') + '</td>' +
          '<td class="col-ops">' +
          '<button type="button" class="link-btn" data-act="edit-req" data-id="' + h(r.id) + '">编辑</button> ' +
          '<button type="button" class="link-btn danger" data-act="del-req" data-id="' + h(r.id) + '">删除</button>' +
          '</td></tr>';
      });
    }

    var table = '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
      '<th class="col-check"><input type="checkbox" class="checkbox" data-act="check-all" data-scope="req"' + (allChecked ? ' checked' : '') + ' /></th>' +
      '<th>编号</th><th>标题</th><th>优先级</th><th>状态</th><th>来源</th><th>归属</th><th class="table-num">期望上线</th><th class="col-ops">操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    return '<div class="page-title"><h1>需求</h1>' +
      '<span class="page-hint">共 ' + data.all.length + ' 条 · 覆盖率 ' + round1(S.metrics(p.id).coverage) + '%</span></div>' +
      panel('需求池', toolbar + '<div style="height:14px"></div>' + table, { span: 12, cls: 'fill-panel' });
  }

  /* ============================================================
   * 6. 缺陷（F4）
   * ============================================================ */
  function defectRows(p) {
    var f = ui.bug;
    var all = S.getDefects(p.id).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var list = all.filter(function (d) {
      if (f.severity && d.severity !== f.severity) return false;
      if (f.status && d.status !== f.status) return false;
      if (f.kw) {
        var hay = (d.title + ' ' + d.owner + ' ' + d.foundVersion + ' ' + (d.env || '') + ' ' +
          (d.steps || '')).toLowerCase();
        if (hay.indexOf(f.kw.toLowerCase()) < 0) return false;
      }
      return true;
    });
    return { all: all, list: list };
  }

  function defects() {
    var p = S.getCurrentProject();
    if (!p) return '<div class="page-title"><h1>缺陷</h1></div><div class="c12">' + noProjectPanel() + '</div>';

    var data = defectRows(p);
    var selIds = selectedIds('bug');
    var allChecked = data.list.length > 0 && data.list.every(function (d) { return ui.bug.selected[d.id]; });
    var m = S.metrics(p.id);
    var hasFilter = filterActive('bug', ['severity', 'status', 'kw']);

    var toolbar = '<div class="toolbar">' +
      '<div class="toolbar-left">' +
      '<button type="button" class="btn btn-primary" data-act="new-bug">' + iconPlain('plus', 14) + ' 登记缺陷</button>' +
      '<button type="button" class="btn btn-danger" data-act="batch-del-bug"' + (selIds.length ? '' : ' disabled') + '>' +
      '批量删除' + (selIds.length ? ' (' + selIds.length + ')' : '') + '</button>' +
      '</div>' +
      '<div class="toolbar-right">' +
      selectBox('bug', 'severity', C.DEFECT_SEVERITY, ui.bug.severity, '全部严重级别') +
      selectBox('bug', 'status', C.DEFECT_STATUS, ui.bug.status, '全部状态') +
      searchBox('bug', ui.bug.kw, '搜索缺陷…') +
      clearFilterBtn('bug', hasFilter) +
      '</div></div>';

    var rows = '';
    if (!data.list.length) {
      rows = '<tr><td colspan="9" style="padding:0">' + emptyBox(
        data.all.length ? '没有匹配的缺陷' : '还没有登记缺陷',
        data.all.length ? '换个筛选条件试试。' : '致命、严重缺陷会直接拉低项目健康度。',
        data.all.length ? '<div class="empty-actions"><button type="button" class="btn btn-sm" data-act="clear-filter-bug">清除筛选</button></div>'
          : '<div class="empty-actions"><button type="button" class="btn btn-primary btn-sm" data-act="new-bug">+ 登记缺陷</button></div>'
      ) + '</td></tr>';
    } else {
      data.list.forEach(function (d) {
        rows += '<tr data-row-id="' + h(d.id) + '"' + (ui.bug.selected[d.id] ? ' class="selected"' : '') + '>' +
          '<td class="col-check">' + checkboxCell('bug', d.id, !!ui.bug.selected[d.id]) + '</td>' +
          '<td class="table-num" style="white-space:nowrap">' + h(S.defectCode(d)) + '</td>' +
          '<td class="title-cell"><span class="cell-clip" title="' + h(d.title) + '">' + h(d.title) + '</span></td>' +
          '<td>' + chip(d.severity, C.COLOR[d.severity]) + '</td>' +
          '<td>' + statusChip(d.status) + '</td>' +
          '<td>' + h(d.owner || '—') + '</td>' +
          '<td>' + h(d.foundVersion || '—') + '</td>' +
          '<td class="table-num" style="white-space:nowrap">' + h(U.fmtDateTime(d.createdAt)) + '</td>' +
          '<td class="col-ops">' +
          '<button type="button" class="link-btn" data-act="edit-bug" data-id="' + h(d.id) + '">编辑</button> ' +
          '<button type="button" class="link-btn danger" data-act="del-bug" data-id="' + h(d.id) + '">删除</button>' +
          '</td></tr>';
      });
    }

    var table = '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
      '<th class="col-check"><input type="checkbox" class="checkbox" data-act="check-all" data-scope="bug"' + (allChecked ? ' checked' : '') + ' /></th>' +
      '<th>编号</th><th>标题</th><th>严重级别</th><th>状态</th><th>归属</th><th>发现版本</th><th class="table-num">创建时间</th><th class="col-ops">操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    return '<div class="page-title"><h1>缺陷</h1>' +
      '<span class="page-hint">存量 ' + m.defectStock + ' 个 · 致命 ' + m.defectFatal + ' · 严重 ' + m.defectSevere + '</span></div>' +
      panel('缺陷列表', toolbar + '<div style="height:14px"></div>' + table, { span: 12, cls: 'fill-panel' });
  }

  /* ============================================================
   * 7. 复盘（F7）
   * ============================================================ */
  function review() {
    var p = S.getCurrentProject();
    if (!p) return '<div class="page-title"><h1>复盘</h1></div><div class="c12">' + noProjectPanel() + '</div>';

    var curWeek = U.weekKey(U.today());
    var editingWeek = ui.review.editingWeek || curWeek;
    var sum = S.weeklySummary(p.id, editingWeek);
    var reviews = S.getReviews(p.id);
    var existing = null;
    reviews.forEach(function (r) { if (r.week === editingWeek) existing = r; });

    // 首次进入 / 切换周次时同步草稿
    if (ui.review.loadedWeek !== editingWeek) {
      ui.review.loadedWeek = editingWeek;
      ui.review.draft = {
        whatDone: existing ? existing.whatDone : '',
        blocked: existing ? existing.blocked : '',
        nextOne: existing ? existing.nextOne : ''
      };
    }

    var m = S.metrics(p.id);

    /* ---- 自动汇总（8 项） ---- */
    var autoItems = sum.items.map(function (it) {
      var arrow = '';
      if (it.arrows) {
        var a = it.arrows;
        function arr(v, invert) {
          if (v === null) return '<span class="trend-flat">—</span>';
          if (v === 'flat') return '<span class="trend-flat">持平</span>';
          var good = invert ? v === 'down' : v === 'up';
          return '<span class="' + (good ? 'trend-up' : 'trend-down') + '">' + (v === 'up' ? '▲' : '▼') + '</span>';
        }
        arrow = '<div class="auto-sub">延期 ' + arr(a.delayed, true) +
          ' · 偏差 ' + arr(a.deviation) + ' · 存量 ' + arr(a.stock, true) + '</div>';
      }
      var mainHtml = (typeof it.main === 'number')
        ? it.main + (it.unit ? '<span class="unit">' + h(it.unit) + '</span>' : '')
        : h(it.main) + (it.unit ? '<span class="unit">' + h(it.unit) + '</span>' : '');
      var subCls = it.neg ? 'auto-sub neg' : 'auto-sub';
      return '<div class="auto-item">' +
        '<div class="auto-title">' + h(it.label) + '</div>' +
        '<div class="auto-main">' + mainHtml + '</div>' +
        '<div class="' + (it.neg ? 'auto-sub' : 'auto-sub') + '">' +
        '<span class="' + (it.neg ? 'neg' : '') + '">' + h(it.sub) + '</span></div>' +
        arrow +
        '</div>';
    }).join('');

    var autoPanel = panel('本周自动汇总（' + h(sum.week) + ' · ' + h(sum.startLabel) + ' ~ ' + h(sum.endLabel) + '）',
      '<div class="auto-grid">' + autoItems + '</div>' +
      '<div class="auto-sub" style="margin-top:12px;color:var(--text-dim)">' +
      (sum.hasBaseline ? '环比基准：' + h(sum.prevWeek) + ' 的复盘快照' : '首次复盘，暂无环比基准') +
      ' · 数据由任务/需求/缺陷实时计算</div>',
      { span: 12 });

    /* ---- 手写三栏 ---- */
    var banner = '';
    if (editingWeek !== curWeek) {
      banner = '<div class="review-banner">正在编辑历史复盘 ' + h(editingWeek) +
        ' · <button type="button" class="link-btn" data-act="review-cancel-edit">返回本周</button></div>';
    }
    if (existing) {
      banner += '<div class="review-banner" style="background:rgba(63,216,224,.08);border-color:rgba(63,216,224,.28);color:var(--c-cyan)">' +
        '本周已保存于 ' + h(U.fmtDateTime(existing.savedAt)) + '，再次保存会更新本条记录</div>';
    }

    function writeBox(key, label, hint, value) {
      return '<div class="write-box">' +
        '<div class="write-label"><span>' + h(label) + '</span>' +
        '<span class="hint">' + h(hint) + '</span>' +
        '<span class="counter" id="cnt-' + key + '">' + value.length + ' / 500</span></div>' +
        '<textarea class="textarea" rows="3" maxlength="500" data-write="' + key + '" ' +
        'placeholder="' + h(hint) + '">' + h(value) + '</textarea>' +
        '</div>';
    }

    var writePanel = panel('手写三栏（每栏 ≤ 500 字，全空也能保存）',
      banner +
      '<div class="write-grid">' +
      writeBox('whatDone', '本周做成了什么', '写 1–3 条，哪怕很小', ui.review.draft.whatDone) +
      writeBox('blocked', '卡在哪、为什么', '可从阻塞任务一键带入原因', ui.review.draft.blocked) +
      writeBox('nextOne', '下周最重要的一件事', '只写一件', ui.review.draft.nextOne) +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" data-act="save-review">保存本次复盘</button>' +
      '<button type="button" class="btn" data-act="export-review">导出 Markdown</button>' +
      '<button type="button" class="btn btn-ghost" data-act="fill-blocked">带入阻塞原因</button>' +
      '</div>',
      { span: 12 });

    /* ---- 时间线 ---- */
    var filtered = reviews.filter(function (r) {
      if (!ui.review.onlyWritten) return true;
      return !!(r.whatDone || r.blocked || r.nextOne);
    });

    var timelineBody = filtered.length ? '<div class="timeline">' + filtered.map(function (r) {
      var snap = r.snapshot || {};
      var mm = snap.metrics || {};
      var expanded = !!ui.review.expanded[r.id];
      var hasWrite = !!(r.whatDone || r.blocked || r.nextOne);
      var summaryLine = r.whatDone ? r.whatDone.split('\n')[0] : (hasWrite ? '（仅记录了数据）' : '（只留了数据快照）');
      var body = expanded ? '<div class="tl-body">' +
        '<div class="tl-kv">' +
        '<span>完成 ' + (mm.done || 0) + ' 个</span>' +
        '<span>延期 ' + (mm.delayedCount || 0) + ' 个</span>' +
        '<span>实际 ' + round1(mm.actualProgress || 0) + '%／计划 ' + round1(mm.planProgress || 0) + '%</span>' +
        '<span>偏差 ' + (mm.deviation >= 0 ? '+' : '') + round1(mm.deviation || 0) + ' pp</span>' +
        '</div>' +
        (r.whatDone ? '<div><h4>本周做成了什么</h4><p>' + h(r.whatDone) + '</p></div>' : '') +
        (r.blocked ? '<div><h4>卡在哪、为什么</h4><p>' + h(r.blocked) + '</p></div>' : '') +
        (r.nextOne ? '<div><h4>下周最重要的一件事</h4><p>' + h(r.nextOne) + '</p></div>' : '') +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn-sm" data-act="export-one-review" data-id="' + h(r.id) + '">导出这条</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-act="edit-review" data-id="' + h(r.id) + '">编辑</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-act="del-review" data-id="' + h(r.id) + '">删除</button>' +
        '</div>' +
        '</div>' : '';
      return '<div class="tl-item' + (hasWrite ? '' : ' empty-dot') + '">' +
        '<div class="tl-head" data-act="toggle-review" data-id="' + h(r.id) + '">' +
        '<span class="tl-week">' + h(r.week) + '</span>' +
        '<span class="tl-meta">完成 ' + (mm.done || 0) + ' · 偏差 ' +
        (mm.deviation >= 0 ? '+' : '') + round1(mm.deviation || 0) + 'pp · ' + h(U.fmtDateTime(r.savedAt)) + '</span>' +
        '<span class="tl-tools">' +
        '<button type="button" class="link-btn" data-act="toggle-review" data-id="' + h(r.id) + '">' + (expanded ? '收起' : '展开') + '</button>' +
        '</span>' +
        '</div>' +
        '<div class="tl-summary">' + h(summaryLine) + '</div>' +
        body +
        '</div>';
    }).join('') + '</div>' : emptyBox(
      '还没有任何复盘记录',
      '写完一次复盘后，会在下方按周倒序排列。历史快照不会被后续数据改动覆盖。',
      '<div class="empty-actions"><button type="button" class="btn btn-sm" data-act="focus-write">去写第一条</button></div>'
    );

    var timeline = panel('复盘时间线',
      '<div class="toolbar" style="margin-bottom:14px"><div class="toolbar-left">' +
      '<button type="button" class="btn btn-sm btn-ghost" data-act="toggle-only-written">' +
      (ui.review.onlyWritten ? '显示全部复盘' : '仅看有手写内容') + '</button>' +
      '<span class="toolbar-label">连续复盘 ' + m.reviewStatus.streak + ' 周</span>' +
      '</div></div>' + timelineBody, { span: 12 });

    return '<div class="page-title"><h1>复盘</h1>' +
      '<span class="page-hint">系统的数据 + 你的判断 = 一份可回看的复盘 · 不考核、不催办</span></div>' +
      autoPanel + writePanel + timeline;
  }

  /* ============================================================
   * 8. 设置（F6 简版）
   * ============================================================ */
  /* ============================================================
   * 外观面板（设置页）
   * 只影响显示，不写业务数据。主题靠 html[data-theme] 切换，
   * 动效开关同时作用于 CSS 规则与 app.js 的 rAF 循环。
   * ============================================================ */
  var THEME_PRESETS = [
    { key: 'ember', name: '橙红暖金', bg: '#08080C', c1: '#FF5A1F', c2: '#FFA53D' },
    { key: 'ocean', name: '赛博蓝紫', bg: '#060A14', c1: '#2E8BFF', c2: '#7C6BFF' }
  ];

  function appearancePanel() {
    var st = S.getSettings();
    var theme = st.theme === 'ocean' ? 'ocean' : 'ember';
    var motionOn = st.motion !== 'off';

    var cards = THEME_PRESETS.map(function (t) {
      var on = theme === t.key;
      return '<button type="button" class="theme-card' + (on ? ' on' : '') + '"' +
        ' data-act="set-theme" data-value="' + t.key + '"' +
        ' role="radio" aria-checked="' + on + '">' +
        '<span class="theme-swatch">' +
        '<i style="background:' + t.bg + ';border:1px solid rgba(255,255,255,.16)"></i>' +
        '<i style="background:' + t.c1 + '"></i>' +
        '<i style="background:' + t.c2 + '"></i>' +
        '</span>' +
        '<span class="theme-name">' + h(t.name) + '</span>' +
        '</button>';
    }).join('');

    return '<div class="appearance">' +
      '<div class="appearance-main">' +
      '<div class="app-row"><span class="app-label">主题</span>' +
      '<div class="theme-cards" role="radiogroup" aria-label="外观主题">' + cards + '</div></div>' +
      '<div class="app-row"><span class="app-label">动效</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + motionOn + '"' +
      ' aria-label="界面动效开关" data-act="toggle-motion"></button>' +
      '<span class="switch-state">' + (motionOn ? '已开启' : '已关闭') + '</span></div>' +
      '</div>' +
      '<p class="app-note">主题只改外壳配色，状态色（进行中·阻塞·已完成）跨主题恒定，切过去不用重新认色。' +
      '关闭动效会停掉粒子、光晕呼吸与过渡动画，适合长时间盯屏。</p>' +
      '</div>';
  }

  function settings() {
    var p = S.getCurrentProject();
    var st = S.getSettings();
    var backup = backupPanel();

    if (!p) {
      // 无项目时仍要能进入备份区：清空数据后「导入备份」是唯一的恢复入口
      // 外观与项目无关，同样无条件展示
      return '<div class="page-title"><h1>设置</h1>' +
        '<span class="page-hint">还没有项目，可先导入之前的备份</span></div>' +
        '<div class="c12">' + noProjectPanel() + '</div>' +
        panel('外观', appearancePanel(), { span: 5, sub: '只影响显示，不影响数据' }) +
        panel('数据备份', backup, { span: 7 });
    }

    var basic = '<form data-form="settings" class="form-grid" novalidate>' +
      field('name', '名称', '<input class="input" name="name" value="' + h(p.name) + '" />', true, 'full') +
      field('code', '编号', '<input class="input" name="code" value="' + h(p.code) + '" />', false) +
      field('owner', '负责人', '<input class="input" name="owner" value="' + h(p.owner) + '" />', false) +
      field('status', '状态', '<select class="select" name="status">' + C.PROJECT_STATUS.map(function (s) {
        return '<option value="' + h(s) + '"' + (s === p.status ? ' selected' : '') + '>' + h(s) + '</option>';
      }).join('') + '</select>', false) +
      field('start', '开始日', '<input class="input" type="date" name="start" value="' + h(p.start) + '" />', true) +
      field('end', '结束日', '<input class="input" type="date" name="end" value="' + h(p.end) + '" />', true) +
      '<div class="form-field full" style="flex-direction:row;justify-content:flex-end">' +
      '<button type="submit" class="btn btn-primary">保存项目信息</button></div>' +
      '</form>';

    var rule = '<div class="rule-row">' +
      '<span>复盘日</span>' +
      '<select class="select" data-filter="reviewDay" data-scope="settings">' +
      C.WEEKDAY_NAMES.map(function (n, i) {
        return '<option value="' + i + '"' + (Number(st.reviewDay) === i ? ' selected' : '') + '>' + h(n) + '</option>';
      }).join('') + '</select>' +
      '<span>提醒时间</span>' +
      '<input class="input" type="time" data-filter="reviewTime" data-scope="settings" value="' + h(st.reviewTime) + '" />' +
      '<span class="rule-note">站内提醒最多 1 次，只在设置中展示，不发送任何通知</span>' +
      '</div>';

    var danger = '<div class="danger-zone">' +
      '<div class="dz-text">清空全部数据：删除所有项目、任务、需求、缺陷与复盘记录（不可恢复，会同时清除浏览器本地存储）。</div>' +
      '<button type="button" class="btn btn-danger" data-act="reset-data">清空全部数据</button>' +
      '</div>';

    return '<div class="page-title"><h1>设置</h1>' +
      '<span class="page-hint">当前项目：' + h(p.name || '未命名') + '</span></div>' +
      panel('项目基础信息', basic, { span: 7 }) +
      panel('复盘规则', rule, { span: 5 }) +
      panel('外观', appearancePanel(), { span: 5, sub: '只影响显示，不影响数据' }) +
      panel('数据备份', backup, { span: 7 }) +
      panel('危险区', danger, { span: 12 });
  }

  /** 数据备份区：导出 / 导入全部数据，防止清缓存或换设备时丢失 */
  function backupPanel() {
    var stR = S.getState();
    var saved = S.getSavedAt();
    var items = [
      ['项目', stR.projects.length],
      ['任务', stR.tasks.length],
      ['需求', stR.requirements.length],
      ['缺陷', stR.defects.length],
      ['复盘', stR.reviews.length]
    ];
    var total = 0;
    var stat = items.map(function (it) {
      total += it[1];
      return '<span class="bz-stat"><b>' + it[1] + '</b>' + h(it[0]) + '</span>';
    }).join('');
    var savedTxt = saved ? U.fmtDateTimeSec(saved) : '尚未保存';

    return '<div class="backup-zone">' +
      '<div class="bz-stats">' + stat + '<span class="bz-saved">最近保存：' + h(savedTxt) + '</span></div>' +
      '<p class="bz-text">数据只保存在这台电脑的浏览器里，清理浏览器数据、换设备或重装系统都会丢。' +
      (total ? '建议每周导出一次留底。' : '当前还没有任何数据，导入一份之前的备份即可恢复。') + '</p>' +
      '<div class="bz-actions">' +
      '<button type="button" class="btn btn-primary" data-act="export-json"' + (total ? '' : ' disabled') + '>导出全部数据（.json）</button>' +
      '<button type="button" class="btn" data-act="import-json">导入备份文件</button>' +
      '<input type="file" id="import-file" accept=".json,application/json" hidden />' +
      '</div>' +
      '<p class="bz-note">导入会覆盖当前全部数据；文件只在本机解析，不会上传到任何地方。</p>' +
      '</div>';
  }

  function field(key, label, control, required, cls) {
    return '<div class="form-field' + (cls ? ' ' + cls : '') + '">' +
      '<label class="form-label">' + h(label) + (required ? '<span class="req">*</span>' : '') + '</label>' +
      control +
      '<span class="err-msg" data-err="' + h(key) + '"></span>' +
      '</div>';
  }

  /* ============================================================
   * 导出
   * ============================================================ */
  global.Views = {
    NAV: NAV,
    ui: ui,
    icon: icon,
    iconPlain: iconPlain,
    chip: chip,
    statusChip: statusChip,
    prioChip: prioChip,
    lamp: lamp,
    healthText: healthText,
    panel: panel,
    emptyBox: emptyBox,
    round1: round1,
    launchTextOf: launchTextOf,
    field: field,
    overview: overview,
    dashboard: dashboard,
    plan: plan,
    gantt: gantt,
    requirements: requirements,
    defects: defects,
    review: review,
    settings: settings,
    filteredTasks: filteredTasks,
    filteredRequirements: function (p) { return requirementRows(p).list.map(function (x) { return x.r; }); },
    filteredDefects: function (p) { return defectRows(p).list; },
    selectedIds: selectedIds
  };
})(window);
