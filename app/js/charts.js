/* ============================================================
 * charts.js · 手写图表（SVG / HTML），零第三方依赖
 * 所有函数只返回 HTML 字符串，由 views.js 组装、app.js 驱动
 * ============================================================ */
(function (global) {
  'use strict';

  /* 颜色一律走 CSS 变量：主题切换时 SVG 自动跟随，无需重建图表。
     注意：SVG 的 presentation attribute（fill="..."）不接受 var()，
     必须写进 style（如 style="stroke:var(--ember-500)"）才生效。 */
  var EMBER = 'var(--ember-500)';
  var EMBER_400 = 'var(--ember-400)';
  var AMBER = 'var(--amber-500)';
  var AMBER_300 = 'var(--amber-300)';
  var CYAN = 'var(--c-cyan)';
  var GREEN = 'var(--c-green)';
  var DIM = 'var(--text-dim)';

  /* ---------------- 通用小工具 ---------------- */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /** 极坐标：0° = 正上方，顺时针为正 */
  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  /** 圆弧路径（角度制，0 在正上方，顺时针） */
  function arcPath(cx, cy, r, from, to) {
    var sweep = to - from;
    if (sweep <= 0.01) return '';
    if (sweep >= 359.99) {
      var a = polar(cx, cy, r, from);
      var b = polar(cx, cy, r, from + 180);
      return 'M ' + r2(a.x) + ' ' + r2(a.y) +
        ' A ' + r + ' ' + r + ' 0 1 1 ' + r2(b.x) + ' ' + r2(b.y) +
        ' A ' + r + ' ' + r + ' 0 1 1 ' + r2(a.x) + ' ' + r2(a.y);
    }
    var large = sweep > 180 ? 1 : 0;
    var p1 = polar(cx, cy, r, from);
    var p2 = polar(cx, cy, r, to);
    return 'M ' + r2(p1.x) + ' ' + r2(p1.y) +
      ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + r2(p2.x) + ' ' + r2(p2.y);
  }

  /* ============================================================
   * sparkline（KPI 卡底部 60px 迷你趋势）
   * ============================================================ */
  function sparkline(values, opts) {
    opts = opts || {};
    var color = opts.color || AMBER;
    var w = 120, h = 34, pad = 3;
    if (!values || values.length === 0) {
      return '<svg class="kpi-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        '<line x1="0" y1="' + (h / 2) + '" x2="' + w + '" y2="' + (h / 2) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1" vector-effect="non-scaling-stroke"/>' +
        '</svg>';
    }
    var mx = 0, mn = Infinity;
    values.forEach(function (v) {
      var n = Number(v) || 0;
      if (n > mx) mx = n;
      if (n < mn) mn = n;
    });
    if (mn === Infinity) mn = 0;
    if (mx === mn) { mx = mn + 1; }
    var n = values.length;
    var pts = values.map(function (v, i) {
      var x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - pad * 2);
      var y = h - pad - ((Number(v) - mn) / (mx - mn)) * (h - pad * 2);
      return { x: x, y: y };
    });
    var line = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + r2(p.x) + ' ' + r2(p.y); }).join(' ');
    var area = line + ' L' + r2(pts[n - 1].x) + ' ' + h + ' L' + r2(pts[0].x) + ' ' + h + ' Z';
    var gid = 'sg' + Math.random().toString(36).slice(2, 7);
    return '<svg class="kpi-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" style="stop-color:' + color + '" stop-opacity="0.30"/>' +
      '<stop offset="100%" style="stop-color:' + color + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + line + '" fill="none" style="stroke:' + color + '" stroke-width="1.5" ' +
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '</svg>';
  }

  /* ============================================================
   * 双环进度图（6.7.1）
   * 外环：计划（暖金虚线 6px） / 内环：实际（橙红实线 10px + 发光圆头）
   * ============================================================ */
  function donut(data) {
    var plan = Math.max(0, Math.min(100, Number(data && data.plan) || 0));
    var actual = Math.max(0, Math.min(100, Number(data && data.actual) || 0));
    var deviation = actual - plan;
    var cx = 80, cy = 80;
    var rOuter = 66, rInner = 50;

    var trackOuter = '<circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>';
    var trackInner = '<circle cx="' + cx + '" cy="' + cy + '" r="' + rInner + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>';

    var planArc = '';
    var actualArc = '';
    if (plan > 0) {
      planArc = '<path d="' + arcPath(cx, cy, rOuter, 0, plan * 3.6) + '" fill="none" ' +
        'style="stroke:' + AMBER + '" stroke-width="6" stroke-linecap="round" ' +
        'stroke-dasharray="4 6" opacity="0.92"/>';
    }
    if (actual > 0) {
      actualArc = '<path class="donut-arc" d="' + arcPath(cx, cy, rInner, 0, actual * 3.6) + '" fill="none" ' +
        'style="stroke:' + EMBER + ';filter:drop-shadow(0 0 6px var(--ember-glow))" stroke-width="10" stroke-linecap="round"/>';
    }
    // 偏差刻度（实际落后 > 5pp 时，两环之间红色弧段）
    var devArc = '';
    if (plan - actual > 5) {
      devArc = '<path d="' + arcPath(cx, cy, 58, actual * 3.6, plan * 3.6) + '" fill="none" ' +
        'style="stroke:' + EMBER + '" stroke-width="2" opacity="0.75" stroke-linecap="round"/>';
    }
    // 起点指示
    var start = polar(cx, cy, rOuter, 0);
    var marker = '<circle cx="' + r2(start.x) + '" cy="' + r2(start.y) + '" r="2" style="fill:' + AMBER_300 + '"/>';

    var devText = (deviation >= 0 ? '+' : '') + (Math.round(deviation * 10) / 10) + ' pp';
    var devColor = deviation < -5 ? EMBER_400 : (deviation < 0 ? AMBER : GREEN);

    return '' +
      '<div class="donut-wrap">' +
      '<div class="donut">' +
      '<svg viewBox="0 0 160 160" width="156" height="156" role="img" aria-label="计划与实际进度对比">' +
      trackOuter + trackInner + planArc + devArc + actualArc + marker +
      '</svg>' +
      '<div class="donut-center">' +
      '<div class="donut-val">' + r2(actual) + '<span style="font-size:14px;color:var(--text-secondary)">%</span></div>' +
      '<div class="donut-sub">计划 ' + r2(plan) + '%</div>' +
      '</div>' +
      '</div>' +
      '<div class="donut-legend">' +
      '<div class="lg"><span class="lg-dot" style="background:' + EMBER + ';box-shadow:0 0 8px var(--ember-glow)"></span>实际进度 ' + r2(actual) + '%</div>' +
      '<div class="lg"><span class="lg-dash"></span>计划进度 ' + r2(plan) + '%</div>' +
      '<div class="lg">偏差 <b style="color:' + devColor + ';font-variant-numeric:tabular-nums">' + devText + '</b></div>' +
      '</div>' +
      '</div>';
  }

  /* ============================================================
   * 折线数据流（6.7.3）计划 vs 实际，按周采样
   * ============================================================ */
  function line(data) {
    var weeks = (data && data.weeks) || [];
    var plan = (data && data.plan) || [];
    var actual = (data && data.actual) || [];
    var W = 620, H = 176;
    var padL = 30, padR = 14, padT = 14, padB = 24;
    var iw = W - padL - padR;
    var ih = H - padT - padB;
    var n = weeks.length;

    var grid = '';
    [0, 25, 50, 75, 100].forEach(function (v) {
      var y = padT + ih - (v / 100) * ih;
      grid += '<line x1="' + padL + '" y1="' + r2(y) + '" x2="' + (W - padR) + '" y2="' + r2(y) + '" ' +
        'style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 5"/>';
      grid += '<text x="' + (padL - 6) + '" y="' + r2(y + 3) + '" text-anchor="end" ' +
        'style="fill:var(--text-dim)" font-size="9" font-family="ui-monospace, monospace">' + v + '</text>';
    });

    function px(i) { return n === 1 ? padL + iw / 2 : padL + (i / (n - 1)) * iw; }
    function py(v) { return padT + ih - (clamp01((Number(v) || 0) / 100)) * ih; }

    function pathOf(arr) {
      return arr.map(function (v, i) {
        return (i === 0 ? 'M' : 'L') + r2(px(i)) + ' ' + r2(py(v));
      }).join(' ');
    }

    var planPath = pathOf(plan);
    var actualPath = pathOf(actual);
    var areaPath = actualPath + ' L' + r2(px(n - 1)) + ' ' + (padT + ih) + ' L' + r2(px(0)) + ' ' + (padT + ih) + ' Z';

    // 落后区段（实际 < 计划）加淡红面积
    var gapArea = '';
    if (n > 1) {
      var segs = actual.map(function (a, i) {
        return { x: px(i), a: py(a), p: py(plan[i] || 0) };
      });
      gapArea = 'M' + segs.map(function (s) { return r2(s.x) + ' ' + r2(s.p); }).join(' L') +
        ' L' + segs.slice().reverse().map(function (s) { return r2(s.x) + ' ' + r2(s.a); }).join(' L') + ' Z';
    }

    var dots = actual.map(function (v, i) {
      return '<circle cx="' + r2(px(i)) + '" cy="' + r2(py(v)) + '" r="2.4" ' +
        'style="fill:var(--bg-deep);stroke:' + EMBER + '" stroke-width="1.6"/>';
    }).join('');

    var xLabels = weeks.map(function (w, i) {
      if (n > 8 && i % 2 !== 0 && i !== n - 1) return '';
      return '<text x="' + r2(px(i)) + '" y="' + (H - 6) + '" text-anchor="middle" ' +
        'style="fill:var(--text-dim)" font-size="9" font-family="ui-monospace, monospace">' + esc(w) + '</text>';
    }).join('');

    var uid = 'ln' + Math.random().toString(36).slice(2, 7);

    return '' +
      '<div class="chart-legend">' +
      '<span class="lg"><span class="lg-dash"></span>计划基线</span>' +
      '<span class="lg"><span class="lg-dot" style="background:' + EMBER + ';box-shadow:0 0 8px var(--ember-glow)"></span>实际进度</span>' +
      '<span style="margin-left:auto">最近 ' + n + ' 周</span>' +
      '</div>' +
      '<svg class="linechart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="计划与实际进度趋势">' +
      '<defs>' +
      '<linearGradient id="' + uid + 'a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" style="stop-color:' + EMBER + '" stop-opacity="0.22"/>' +
      '<stop offset="100%" style="stop-color:' + EMBER + '" stop-opacity="0"/>' +
      '</linearGradient>' +
      '</defs>' +
      grid +
      '<path d="' + gapArea + '" style="fill:var(--ember-a10)"/>' +
      '<path d="' + areaPath + '" fill="url(#' + uid + 'a)"/>' +
      '<path d="' + planPath + '" fill="none" style="stroke:' + AMBER + '" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.75"/>' +
      '<path d="' + actualPath + '" fill="none" style="stroke:' + EMBER + ';filter:drop-shadow(0 0 5px var(--glow-ember))" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path class="flow-line" d="' + actualPath + '" fill="none" style="stroke:' + AMBER_300 + '" stroke-width="1.6" ' +
      'stroke-dasharray="2 46" opacity="0.85" stroke-linecap="round"/>' +
      dots + xLabels +
      '</svg>';
  }

  /* ============================================================
   * 条形优先级看板（6.7.4）
   * ============================================================ */
  function prioBars(data) {
    var counts = (data && data.counts) || {};
    var keys = ['P0', 'P1', 'P2', 'P3'];
    var colors = { P0: EMBER, P1: AMBER, P2: CYAN, P3: DIM };
    var max = 1;
    keys.forEach(function (k) { max = Math.max(max, Number(counts[k]) || 0); });
    return '<div class="prio-bar">' + keys.map(function (k, i) {
      var v = Number(counts[k]) || 0;
      var ratio = max > 0 ? (v / max) : 0;
      return '<div class="pb-row" data-prio="' + k + '">' +
        '<span class="pb-name" style="color:' + (colors[k]) + '">' + k + '</span>' +
        '<span class="pb-track"><span class="pb-fill" style="--v:' + r2(ratio) + ';background:' + colors[k] +
        ';animation-delay:' + (i * 60) + 'ms"></span></span>' +
        '<span class="pb-num">' + v + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ============================================================
   * 风险告警日历（6.7.5）
   * ============================================================ */
  function calendar(data) {
    if (!data || !data.cells) return '';
    var dows = ['一', '二', '三', '四', '五', '六', '日'];
    var head = dows.map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
    var cells = data.cells.map(function (c) {
      if (c.blank) return '<div class="cal-cell blank"></div>';
      var cls = 'cal-cell has';
      if (c.isToday) cls += ' today';
      var dot = '';
      if (c.risk >= 4) dot = '<span class="cal-dot d4"></span>';
      else if (c.risk >= 2) dot = '<span class="cal-dot d2"></span>';
      else if (c.risk === 1) dot = '<span class="cal-dot"></span>';
      var tip = '';
      if (c.items && c.items.length) {
        tip = c.date + '（' + c.risk + ' 项风险）\n' + c.items.map(function (it) { return '· ' + it.text; }).join('\n');
      } else {
        tip = c.date + '\n无风险项';
      }
      return '<div class="' + cls + '" data-tip="' + esc(tip) + '"><span>' + c.day + '</span>' + dot + '</div>';
    }).join('');
    return '<div class="cal">' +
      '<div class="cal-head"><span>' + esc(data.label) + '</span>' +
      '<span style="color:var(--text-dim);font-size:10px">延期 / 致命·严重缺陷 / 里程碑风险</span></div>' +
      '<div class="cal-grid">' + head + cells + '</div>' +
      '</div>';
  }

  /* ============================================================
   * 空状态块（图表统一降级表现）
   * ============================================================ */
  function emptyBlock(icon, title, text, actions) {
    return '<div class="empty">' +
      '<div class="empty-icon">' + (icon || '') + '</div>' +
      '<div class="empty-title">' + esc(title) + '</div>' +
      (text ? '<div class="empty-text">' + esc(text) + '</div>' : '') +
      (actions || '') +
      '</div>';
  }

  global.Charts = {
    sparkline: sparkline,
    donut: donut,
    line: line,
    prioBars: prioBars,
    calendar: calendar,
    emptyBlock: emptyBlock,
    esc: esc,
    arcPath: arcPath,
    polar: polar,
    COLORS: {
      ember: EMBER, ember400: EMBER_400, amber: AMBER, amber300: AMBER_300,
      cyan: CYAN, green: GREEN, dim: DIM
    }
  };
})(window);
