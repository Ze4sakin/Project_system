/* ============================================================
 * app.js · 应用驱动层
 * 路由 / 事件委托 / 表单弹窗与校验 / 二次确认 / Toast /
 * 统一 sin 缓动循环器 / 粒子背景 / Tab 切换动效
 * ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store;
  var V = global.Views;
  var U = S.util;
  var C = S.CONST;

  var dom = {};
  var state = {
    view: 'overview', modalOpen: false, modalClose: null, pendingFocus: null,
    navTimer: null, animateNext: true, highlightId: null
  };

  /* ============================================================
   * 一、动效：统一 rAF 缓动循环器（7.2.1）
   * ============================================================ */
  var Motion = (function () {
    var list = [];
    var rafId = null;
    var reduced = false;
    var manualOff = false; // 设置 → 外观 → 动效开关（用户手动关闭）
    var ampOverride = null; // 交互唤醒时固定 1px（PRD 7.2.6）
    var paused = false;

    try {
      reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { reduced = false; }

    function tick(t) {
      if (paused) { rafId = null; return; }
      if (!list.length) { rafId = null; return; }
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var amp = ampOverride !== null ? ampOverride : c.amp;
        var y = amp * Math.sin((2 * Math.PI * t) / c.period + c.phase);
        c.el.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
      }
      rafId = global.requestAnimationFrame(tick);
    }

    function start() {
      if (reduced || manualOff || rafId) return;
      rafId = global.requestAnimationFrame(tick);
    }

    function stop() {
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = null;
    }

    return {
      isReduced: function () { return reduced || manualOff; },
      /** 用户手动关闭动效：立刻停循环并清空注册表，元素回到原位 */
      setManualOff: function (v) {
        manualOff = !!v;
        if (manualOff) {
          stop();
          for (var i = 0; i < list.length; i++) list[i].el.style.transform = '';
          list = [];
        }
      },
      register: function (root) {
        list = [];
        if (reduced || manualOff || !root) return;
        var els = root.querySelectorAll('.sin');
        for (var i = 0; i < els.length; i++) {
          list.push({
            el: els[i],
            amp: 2 + (i % 3),             // 2~4px
            period: 6000 + (i % 4) * 900, // 6.0~8.7s
            phase: i * 0.7                // 相位错开
          });
        }
        start();
      },
      /** 传 1 表示交互中固定 1px 振幅；传 null 恢复正常正弦振幅 */
      setAmpOverride: function (v) { ampOverride = v; },
      pause: function () { paused = true; stop(); },
      resume: function () { if (!paused) return; paused = false; start(); }
    };
  })();

  /* ============================================================
   * 二、背景粒子（L3 装饰层，30fps，60–80 个）
   * ============================================================ */
  var Particles = (function () {
    var canvas = null;
    var ctx = null;
    var items = [];
    var rafId = null;
    var running = false;
    var lastT = 0;
    var w = 0, h = 0, dpr = 1;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function resize() {
      if (!canvas) return;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      w = global.innerWidth;
      h = global.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function build() {
      // 数量按屏幕面积自适应，60–80，上限 100
      var n = Math.round((w * h) / 24000);
      n = Math.max(60, Math.min(80, n));
      items = [];
      for (var i = 0; i < n; i++) {
        items.push({
          x: rand(0, w),
          y: rand(0, h),
          r: rand(0.8, 2.2),
          a: rand(0.15, 0.5),
          vy: rand(8, 20),
          amp: rand(6, 14),
          period: rand(4000, 7000),
          phase: rand(0, Math.PI * 2),
          baseX: rand(0, w)
        });
      }
    }

    function draw(t) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        var alpha = p.a;
        // 底部 60px 内渐入，禁止突然出现
        if (p.y > h - 60) alpha = p.a * Math.max(0, (h - p.y) / 60);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 200, 140, ' + alpha.toFixed(3) + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick(t) {
      if (!running) { rafId = null; return; }
      if (lastT && t - lastT < 33) { rafId = global.requestAnimationFrame(tick); return; } // 限 30fps
      var dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0.033;
      lastT = t;
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        p.y -= p.vy * dt;
        p.x = p.baseX + Math.sin((t / p.period) * Math.PI * 2 + p.phase) * p.amp;
        if (p.y < -10) {
          p.y = h + rand(0, 40);
          p.baseX = rand(0, w);
          p.x = p.baseX;
        }
      }
      draw(t);
      rafId = global.requestAnimationFrame(tick);
    }

    function start() {
      if (running || Motion.isReduced()) return;
      running = true;
      lastT = 0;
      rafId = global.requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = null;
    }

    return {
      init: function () {
        canvas = document.getElementById('particleCanvas');
        if (!canvas || !canvas.getContext) return;
        ctx = canvas.getContext('2d');
        if (!ctx) return; // 环境不支持 canvas 时静默跳过装饰层
        resize();
        build();
        start();
        global.addEventListener('resize', function () {
          resize();
          build();
        });
      },
      pause: stop,
      resume: function () { if (!running) start(); }
    };
  })();

  /* ============================================================
   * 二·B、外观（主题 + 动效）
   * 主题只切 html[data-theme]，靠 CSS 变量生效，不重建 DOM、不重算图表；
   * 动效开关同时作用于 CSS 规则与 Motion / Particles 的 rAF 循环，
   * 只关 CSS 不停 rAF 属于假关闭（仍在耗电），两者必须一起关。
   * ============================================================ */
  var Appearance = (function () {
    var root = document.documentElement;

    function current() {
      var st = S.getSettings();
      return {
        theme: st.theme === 'ocean' ? 'ocean' : 'ember',
        motionOff: st.motion === 'off'
      };
    }

    /** 只同步 DOM 属性，不碰 rAF：供每次 render 兜底，
        保证「数据里的外观」和「页面上的外观」永远一致（如导入备份后）。 */
    function syncDom() {
      var c = current();
      root.setAttribute('data-theme', c.theme);
      root.setAttribute('data-motion', c.motionOff ? 'off' : 'on');
      return c;
    }

    /** 完整应用：同步 DOM + 起停动画循环 */
    function apply() {
      var c = syncDom();
      Motion.setManualOff(c.motionOff);
      if (c.motionOff) {
        Particles.pause();
      } else {
        Particles.resume();
        if (dom && dom.view) Motion.register(dom.view);
      }
      return c;
    }

    return {
      apply: apply,
      syncDom: syncDom,
      setTheme: function (key) {
        S.updateSettings({ theme: key === 'ocean' ? 'ocean' : 'ember' });
        apply();
      },
      /** 返回切换后的状态：true = 动效已开启 */
      toggleMotion: function () {
        var offNow = S.getSettings().motion === 'off';
        S.updateSettings({ motion: offNow ? 'on' : 'off' });
        apply();
        return offNow;
      }
    };
  })();

  /* ============================================================
   * 三、Toast / 浮层提示
   * ============================================================ */
  function toast(msg, type) {
    if (!dom.toastWrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' err' : '');
    el.innerHTML = '<span class="t-dot"></span><span>' + Charts.esc(msg) + '</span>';
    dom.toastWrap.appendChild(el);
    global.setTimeout(function () {
      el.classList.add('out');
      global.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    }, 2600);
  }

  function showTip(text, x, y) {
    if (!dom.tip) return;
    dom.tip.textContent = text;
    dom.tip.hidden = false;
    var rect = dom.tip.getBoundingClientRect();
    var left = Math.min(x + 14, global.innerWidth - rect.width - 12);
    var top = Math.min(y + 16, global.innerHeight - rect.height - 12);
    dom.tip.style.left = Math.max(8, left) + 'px';
    dom.tip.style.top = Math.max(8, top) + 'px';
  }

  function hideTip() {
    if (dom.tip) dom.tip.hidden = true;
  }

  /* ============================================================
   * 三·B、顶栏全局搜索（跨任务 / 需求 / 缺陷）
   * ============================================================ */
  var GS_MAX = 5;

  function searchAllProjects(q) {
    var pid = S.getCurrentProjectId();
    var kw = String(q || '').trim().toLowerCase();
    if (!pid || !kw) return null;
    function hit() {
      for (var i = 0; i < arguments.length; i++) {
        if (String(arguments[i] === undefined || arguments[i] === null ? '' : arguments[i])
          .toLowerCase().indexOf(kw) >= 0) return true;
      }
      return false;
    }
    var tasks = S.getTasks(pid).filter(function (t) {
      return hit(t.title, t.owner, t.stage);
    });
    var reqs = S.getRequirements(pid).filter(function (r) {
      return hit(r.title, r.desc, r.owner);
    });
    var bugs = S.getDefects(pid).slice()
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .filter(function (d) { return hit(d.title, d.owner, d.foundVersion, d.env); });
    return {
      tasks: tasks.slice(0, GS_MAX),
      reqs: reqs.slice(0, GS_MAX),
      bugs: bugs.slice(0, GS_MAX),
      total: Math.min(tasks.length, GS_MAX) + Math.min(reqs.length, GS_MAX) + Math.min(bugs.length, GS_MAX)
    };
  }

  function gsItemHtml(view, id, title, meta) {
    return '<button type="button" class="gs-item" data-gs="' + view + '" data-id="' + Charts.esc(id) +
      '" data-title="' + Charts.esc(title) + '">' +
      '<span class="gs-item-title">' + Charts.esc(title) + '</span>' +
      '<span class="gs-item-meta">' + Charts.esc(meta) + '</span></button>';
  }

  function renderSearchResults(q) {
    if (!dom.gsResults) return;
    var r = searchAllProjects(q);
    if (!r) { dom.gsResults.hidden = true; dom.gsResults.innerHTML = ''; return; }
    if (!r.total) {
      dom.gsResults.innerHTML = '<div class="gs-empty">无匹配：没有找到相关任务、需求或缺陷</div>';
      dom.gsResults.hidden = false;
      return;
    }
    var html = '';
    if (r.tasks.length) {
      html += '<div class="gs-group"><div class="gs-group-title">任务</div>' +
        r.tasks.map(function (t) {
          return gsItemHtml('plan', t.id, t.title, t.stage + ' · ' + t.status);
        }).join('') + '</div>';
    }
    if (r.reqs.length) {
      html += '<div class="gs-group"><div class="gs-group-title">需求</div>' +
        r.reqs.map(function (x) {
          return gsItemHtml('requirements', x.id, x.title, S.reqCode(x) + ' · ' + x.status);
        }).join('') + '</div>';
    }
    if (r.bugs.length) {
      html += '<div class="gs-group"><div class="gs-group-title">缺陷</div>' +
        r.bugs.map(function (d) {
          return gsItemHtml('defects', d.id, d.title, S.defectCode(d) + ' · ' + d.severity);
        }).join('') + '</div>';
    }
    dom.gsResults.innerHTML = html;
    dom.gsResults.hidden = false;
  }

  function closeSearchResults() {
    if (!dom.gsResults) return;
    dom.gsResults.hidden = true;
  }

  /** 点击搜索结果：跳到对应视图 → 填入筛选 → 高亮该行 3s */
  function gotoSearchResult(el) {
    var view = el.getAttribute('data-gs');
    var id = el.getAttribute('data-id');
    var title = el.getAttribute('data-title') || '';
    var scope = view === 'plan' ? 'plan' : (view === 'requirements' ? 'req' : 'bug');

    // 用标题作为该视图的关键词，保证目标行可见
    V.ui[scope].kw = title;
    V.ui[scope].selected = {};
    closeSearchResults();
    state.highlightId = id;

    if (state.view === view) {
      render();
    } else {
      if (global.location.hash === '#/' + view) render();
      else global.location.hash = '#/' + view; // hashchange → render
    }
  }

  /* ============================================================
   * 四、弹窗
   * ============================================================ */
  function openModal(opts) {
    if (!dom.modalMask) return;
    dom.modalTitle.textContent = opts.title || '';
    dom.modalBody.innerHTML = opts.body || '';
    dom.modalFoot.innerHTML = opts.foot || '';
    dom.modalMask.hidden = false;
    state.modalOpen = true;
    state.modalClose = opts.onClose || null;
    if (typeof opts.onMount === 'function') opts.onMount(dom.modalBody, dom.modalFoot);
    var focusEl = dom.modalBody.querySelector('input, select, textarea');
    if (focusEl) {
      try { focusEl.focus(); } catch (e) { /* ignore */ }
    }
  }

  function closeModal() {
    if (!dom.modalMask || dom.modalMask.hidden) return;
    dom.modalMask.hidden = true;
    dom.modalBody.innerHTML = '';
    dom.modalFoot.innerHTML = '';
    state.modalOpen = false;
    var cb = state.modalClose;
    state.modalClose = null;
    if (typeof cb === 'function') cb();
  }

  function confirmAction(opts) {
    var danger = opts.danger !== false;
    openModal({
      title: opts.title || '确认操作',
      body: '<p class="confirm-text">' + Charts.esc(opts.message || '') + '</p>' +
        (opts.sub ? '<p class="confirm-sub">' + Charts.esc(opts.sub) + '</p>' : ''),
      foot: '<button type="button" class="btn btn-ghost" data-act="modal-cancel">取消</button>' +
        '<button type="button" class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="modal-ok">' +
        Charts.esc(opts.okText || '确认') + '</button>',
      onMount: function (body, foot) {
        foot.querySelector('[data-act="modal-ok"]').addEventListener('click', function () {
          closeModal();
          if (typeof opts.onOk === 'function') opts.onOk();
        });
      }
    });
  }

  /* ============================================================
   * 五、表单定义
   * ============================================================ */
  var FORMS = {
    project: {
      title: '项目',
      fields: [
        { key: 'name', label: '项目名称', type: 'text', required: true, full: true, placeholder: '例如：官网改版 v2' },
        { key: 'code', label: '项目编号', type: 'text', placeholder: '例如：WEB-2026' },
        { key: 'owner', label: '负责人', type: 'text', placeholder: '例如：我自己' },
        { key: 'start', label: '开始日', type: 'date', required: true },
        { key: 'end', label: '结束日', type: 'date', required: true },
        { key: 'status', label: '状态', type: 'select', options: C.PROJECT_STATUS, def: '进行中' }
      ]
    },
    task: {
      title: '任务',
      fields: [
        { key: 'title', label: '任务标题', type: 'text', required: true, full: true, placeholder: '一句话说清要做什么' },
        { key: 'stage', label: '阶段', type: 'text', placeholder: '例如：开发 / 测试', def: '未分阶段' },
        { key: 'owner', label: '归属', type: 'text', placeholder: '仅作标签，例如：我 / 外包A' },
        { key: 'start', label: '开始日', type: 'date', required: true },
        { key: 'end', label: '结束日', type: 'date', required: true },
        { key: 'estimateHours', label: '预计工时(h)', type: 'number', def: 0, min: 0 },
        { key: 'progress', label: '进度(%)', type: 'number', def: 0, min: 0, max: 100 },
        { key: 'status', label: '状态', type: 'select', options: C.TASK_STATUS, def: '未开始' },
        { key: 'priority', label: '优先级', type: 'select', options: C.PRIORITY, def: 'P2' },
        { key: 'milestone', label: '标记为里程碑', type: 'checkbox', full: true },
        {
          key: 'blockedReason', label: '阻塞原因', type: 'textarea', full: true,
          placeholder: '状态为「阻塞」时必填，用于仪表盘风险汇总'
        }
      ]
    },
    req: {
      title: '需求',
      fields: [
        { key: 'title', label: '需求标题', type: 'text', required: true, full: true },
        { key: 'desc', label: '描述', type: 'textarea', full: true, placeholder: '要解决什么问题、验收标准是什么' },
        { key: 'source', label: '来源', type: 'select', options: C.REQ_SOURCE, def: '内部' },
        { key: 'priority', label: '优先级', type: 'select', options: C.PRIORITY, def: 'P1', required: true },
        { key: 'status', label: '状态', type: 'select', options: C.REQ_STATUS, def: '草稿' },
        { key: 'owner', label: '归属', type: 'text' },
        { key: 'expectDate', label: '期望上线日', type: 'date' },
        { key: 'taskIds', label: '关联任务', type: 'tasks', full: true }
      ]
    },
    bug: {
      title: '缺陷',
      fields: [
        { key: 'title', label: '缺陷标题', type: 'text', required: true, full: true },
        { key: 'severity', label: '严重级别', type: 'select', options: C.DEFECT_SEVERITY, def: '一般', required: true },
        { key: 'status', label: '状态', type: 'select', options: C.DEFECT_STATUS, def: '新建' },
        { key: 'owner', label: '归属', type: 'text' },
        { key: 'foundVersion', label: '发现版本', type: 'text', placeholder: '例如：v1.2.0' },
        { key: 'env', label: '环境', type: 'text', placeholder: '例如：iOS 17 / Chrome 120 / 生产' },
        { key: 'steps', label: '复现步骤', type: 'textarea', full: true, placeholder: '1. 打开首页 → 2. 下拉刷新 → 3. 出现白屏' },
        { key: 'relatedReqId', label: '关联需求', type: 'select', options: [], full: true, dynamic: 'requirements' },
        { key: 'relatedTaskId', label: '关联任务', type: 'select', options: [], full: true, dynamic: 'tasks' }
      ]
    }
  };

  function defaultValues(kind) {
    var def = FORMS[kind];
    var v = {};
    def.fields.forEach(function (f) {
      if (f.type === 'checkbox') v[f.key] = false;
      else if (f.type === 'tasks') v[f.key] = [];
      else v[f.key] = f.def !== undefined ? f.def : '';
    });
    return v;
  }

  function controlHtml(kind, f, values, projectId) {
    var val = values[f.key];
    var nameAttr = ' name="' + f.key + '"';
    var reqCls = '';

    if (f.type === 'textarea') {
      return '<textarea class="textarea" rows="3"' + nameAttr + ' placeholder="' +
        Charts.esc(f.placeholder || '') + '">' + Charts.esc(val || '') + '</textarea>';
    }
    if (f.type === 'checkbox') {
      return '<label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);height:32px">' +
        '<input type="checkbox" class="checkbox"' + nameAttr + (val ? ' checked' : '') + ' /> 是</label>';
    }
    if (f.type === 'select') {
      var opts = f.options || [];
      if (f.dynamic === 'requirements') {
        var reqs = projectId ? S.getRequirements(projectId) : [];
        opts = reqs.map(function (r) { return r.title; });
        var html = '<select class="select"' + nameAttr + '><option value="">不关联</option>';
        reqs.forEach(function (r) {
          html += '<option value="' + Charts.esc(r.id) + '"' + (r.id === val ? ' selected' : '') + '>' +
            Charts.esc(r.title) + '</option>';
        });
        return html + '</select>';
      }
      if (f.dynamic === 'tasks') {
        var relTasks = projectId ? S.getTasks(projectId) : [];
        var taskHtml = '<select class="select"' + nameAttr + '><option value="">不关联</option>';
        relTasks.forEach(function (t) {
          taskHtml += '<option value="' + Charts.esc(t.id) + '"' + (t.id === val ? ' selected' : '') + '>' +
            Charts.esc(t.title) + '</option>';
        });
        return taskHtml + '</select>';
      }
      var fallback = val || f.def || opts[0] || '';
      return '<select class="select"' + nameAttr + '>' + opts.map(function (o) {
        return '<option value="' + Charts.esc(o) + '"' + (o === fallback ? ' selected' : '') + '>' +
          Charts.esc(o) + '</option>';
      }).join('') + '</select>';
    }
    if (f.type === 'tasks') {
      var tasks = projectId ? S.getTasks(projectId) : [];
      if (!tasks.length) {
        return '<div class="panel-sub" style="padding:8px 0">当前项目还没有任务，先在「计划」里新建任务。</div>';
      }
      var picked = {};
      (val || []).forEach(function (id) { picked[id] = true; });
      return '<div style="max-height:132px;overflow:auto;border:1px solid rgba(255,200,150,.16);' +
        'border-radius:9px;background:rgba(0,0,0,.28);padding:8px 10px;display:flex;flex-direction:column;gap:6px">' +
        tasks.map(function (t) {
          return '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)">' +
            '<input type="checkbox" class="checkbox" data-pick="' + f.key + '" value="' + Charts.esc(t.id) + '"' +
            (picked[t.id] ? ' checked' : '') + ' />' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + Charts.esc(t.title) + '</span></label>';
        }).join('') + '</div>';
    }
    // text / date / number
    var inputType = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
    var extra = '';
    if (f.min !== undefined) extra += ' min="' + f.min + '"';
    if (f.max !== undefined) extra += ' max="' + f.max + '"';
    reqCls = 'input';
    return '<input class="' + reqCls + '" type="' + inputType + '"' + nameAttr +
      ' value="' + Charts.esc(val === undefined || val === null ? '' : val) + '"' +
      ' placeholder="' + Charts.esc(f.placeholder || '') + '"' + extra + ' />';
  }

  function buildForm(kind, values, projectId) {
    var def = FORMS[kind];
    var html = '<form data-form="' + kind + '" novalidate><div class="form-grid">';
    def.fields.forEach(function (f) {
      html += '<div class="form-field' + (f.full ? ' full' : '') + '">' +
        '<label class="form-label">' + Charts.esc(f.label) +
        (f.required ? '<span class="req">*</span>' : '') + '</label>' +
        controlHtml(kind, f, values, projectId) +
        '<span class="err-msg" data-err="' + f.key + '"></span>' +
        '</div>';
    });
    if (kind === 'bug') {
      html += '<div class="form-field full"><div class="form-note">' +
        'v1 暂不支持附件上传，截图/日志可在「复现步骤」里贴链接。</div></div>';
    }
    html += '</div></form>';
    return html;
  }

  function readForm(kind, formEl) {
    var def = FORMS[kind];
    var v = {};
    def.fields.forEach(function (f) {
      if (f.type === 'tasks') {
        var picks = formEl.querySelectorAll('[data-pick="' + f.key + '"]:checked');
        v[f.key] = Array.prototype.slice.call(picks).map(function (el) { return el.value; });
        return;
      }
      var el = formEl.querySelector('[name="' + f.key + '"]');
      if (!el) { v[f.key] = ''; return; }
      if (f.type === 'checkbox') v[f.key] = !!el.checked;
      else v[f.key] = String(el.value || '').trim();
    });
    return v;
  }

  function clearErrors(formEl) {
    Array.prototype.forEach.call(formEl.querySelectorAll('.err-msg'), function (e) { e.textContent = ''; });
    Array.prototype.forEach.call(formEl.querySelectorAll('.input, .select, .textarea'), function (e) {
      e.classList.remove('error');
    });
  }

  function paintErrors(formEl, errors) {
    clearErrors(formEl);
    var first = null;
    Object.keys(errors).forEach(function (k) {
      var msgEl = formEl.querySelector('[data-err="' + k + '"]');
      if (msgEl) msgEl.textContent = errors[k];
      var input = formEl.querySelector('[name="' + k + '"]');
      if (input && input.classList) input.classList.add('error');
      if (!first && input) first = input;
    });
    if (first) {
      try { first.focus(); } catch (e) { /* ignore */ }
    }
  }

  function validate(kind, v) {
    var e = {};
    if (kind === 'project') {
      if (!v.name) e.name = '请填写项目名称';
      if (!v.start) e.start = '请选择开始日期';
      if (!v.end) e.end = '请选择结束日期';
      if (v.start && v.end && U.toDate(v.end) < U.toDate(v.start)) e.end = '结束日不得早于开始日';
    } else if (kind === 'task') {
      if (!v.title) e.title = '请填写任务标题';
      if (!v.start) e.start = '请选择开始日期';
      if (!v.end) e.end = '请选择结束日期';
      if (v.start && v.end && U.toDate(v.end) < U.toDate(v.start)) e.end = '结束日不得早于开始日';
      if (v.status === '阻塞' && !v.blockedReason) e.blockedReason = '状态为阻塞时必须填写阻塞原因';
      if (v.progress !== '' && (Number(v.progress) < 0 || Number(v.progress) > 100)) e.progress = '进度需在 0–100 之间';
      if (v.estimateHours !== '' && Number(v.estimateHours) < 0) e.estimateHours = '预计工时不能为负';
    } else if (kind === 'req') {
      if (!v.title) e.title = '请填写需求标题';
      if (!v.priority) e.priority = '请选择优先级';
    } else if (kind === 'bug') {
      if (!v.title) e.title = '请填写缺陷标题';
      if (!v.severity) e.severity = '请选择严重级别';
    }
    return e;
  }

  // 表单值 → 实体字段（严格按数据模型，不增删字段）
  function toEntity(kind, v) {
    if (kind === 'project') {
      return {
        name: v.name, code: v.code, owner: v.owner,
        start: v.start, end: v.end, status: v.status
      };
    }
    if (kind === 'task') {
      return {
        title: v.title, stage: v.stage || '未分阶段', owner: v.owner,
        start: v.start, end: v.end,
        estimateHours: Number(v.estimateHours) || 0,
        progress: Number(v.progress) || 0,
        status: v.status, priority: v.priority,
        milestone: !!v.milestone,
        blockedReason: v.blockedReason
      };
    }
    if (kind === 'req') {
      return {
        title: v.title, desc: v.desc, source: v.source, priority: v.priority,
        status: v.status, owner: v.owner, expectDate: v.expectDate,
        taskIds: v.taskIds || []
      };
    }
    return {
      title: v.title, severity: v.severity, status: v.status, owner: v.owner,
      foundVersion: v.foundVersion, env: v.env, steps: v.steps,
      relatedReqId: v.relatedReqId || '', relatedTaskId: v.relatedTaskId || ''
    };
  }

  function openEntityForm(kind, id) {
    var projectId = S.getCurrentProjectId();
    var def = FORMS[kind];
    var editing = !!id;
    var values = null;
    var projectIdForForm = projectId;

    if (editing) {
      if (kind === 'project') {
        var p = S.getProject(id);
        if (!p) return;
        values = Object.assign({}, p);
        projectIdForForm = p.id;
      } else if (kind === 'task') {
        var t = S.getTask(id);
        if (!t) return;
        values = Object.assign({}, t);
        projectIdForForm = t.projectId;
      } else if (kind === 'req') {
        var r = S.getRequirement(id);
        if (!r) return;
        values = Object.assign({}, r);
        projectIdForForm = r.projectId;
      } else {
        var d = S.getDefect(id);
        if (!d) return;
        values = Object.assign({}, d);
        projectIdForForm = d.projectId;
      }
    } else {
      values = defaultValues(kind);
      if (kind !== 'project' && !projectId) {
        toast('请先创建一个项目', 'err');
        return;
      }
      if (kind === 'task' && V.ui.plan.stage) values.stage = V.ui.plan.stage;
      values.start = values.start || '';
      values.end = values.end || '';
    }

    openModal({
      title: (editing ? '编辑' : '新增') + def.title,
      body: buildForm(kind, values, projectIdForForm),
      foot: '<span class="foot-hint">带 <span style="color:var(--ember-400)">*</span> 为必填</span>' +
        '<button type="button" class="btn btn-ghost" data-act="modal-cancel">取消</button>' +
        '<button type="button" class="btn btn-primary" data-act="form-submit" data-kind="' + kind + '"' +
        (id ? ' data-id="' + Charts.esc(id) + '"' : '') + '>' + (editing ? '保存修改' : '创建') + '</button>',
      onMount: function (body) {
        var formEl = body.querySelector('form');
        formEl.addEventListener('submit', function (ev) {
          ev.preventDefault();
          submitEntityForm(kind, id, formEl);
        });
        // 状态切换为「阻塞」时把阻塞原因标为必填的视觉提示
        var statusSel = formEl.querySelector('[name="status"]');
        var reasonLabel = formEl.querySelector('[data-err="blockedReason"]');
        if (statusSel && reasonLabel) {
          var syncHint = function () {
            var isBlocked = statusSel.value === '阻塞';
            var label = reasonLabel.parentNode.querySelector('.form-label');
            if (label) {
              var reqMark = label.querySelector('.req');
              if (isBlocked && !reqMark) {
                var s = document.createElement('span');
                s.className = 'req';
                s.textContent = '*';
                label.appendChild(s);
              } else if (!isBlocked && reqMark) {
                reqMark.parentNode.removeChild(reqMark);
              }
            }
          };
          statusSel.addEventListener('change', syncHint);
          syncHint();
        }
      }
    });
  }

  function submitEntityForm(kind, id, formEl) {
    var values = readForm(kind, formEl);
    var errors = validate(kind, values);
    if (Object.keys(errors).length) {
      paintErrors(formEl, errors);
      return; // 不提交、不关闭弹窗
    }
    clearErrors(formEl);
    var data = toEntity(kind, values);

    if (kind === 'project') {
      if (id) {
        S.updateProject(id, data);
        toast('项目已更新');
      } else {
        var np = S.addProject(data);
        if (np) S.setCurrentProject(np.id);
        toast('项目已创建');
      }
    } else if (kind === 'task') {
      if (id) { S.updateTask(id, data); toast('任务已更新'); }
      else { S.addTask(Object.assign({ projectId: S.getCurrentProjectId() }, data)); toast('任务已创建'); }
    } else if (kind === 'req') {
      if (id) { S.updateRequirement(id, data); toast('需求已更新'); }
      else { S.addRequirement(Object.assign({ projectId: S.getCurrentProjectId() }, data)); toast('需求已创建'); }
    } else {
      if (id) { S.updateDefect(id, data); toast('缺陷已更新'); }
      else { S.addDefect(Object.assign({ projectId: S.getCurrentProjectId() }, data)); toast('缺陷已登记'); }
    }

    closeModal();
    render();
  }

  /* ============================================================
   * 六、删除操作（统一二次确认）
   * ============================================================ */
  function confirmDeleteOne(kind, id) {
    var names = { project: '项目', task: '任务', req: '需求', bug: '缺陷', review: '复盘记录' };
    var label = names[kind] || '记录';
    var title = '';
    if (kind === 'project') title = (S.getProject(id) || {}).name || '';
    if (kind === 'task') title = (S.getTask(id) || {}).title || '';
    if (kind === 'req') title = (S.getRequirement(id) || {}).title || '';
    if (kind === 'bug') title = (S.getDefect(id) || {}).title || '';
    if (kind === 'review') title = (S.getReview(id) || {}).week || '';

    confirmAction({
      title: '删除' + label,
      message: '确定删除「' + title + '」？',
      sub: kind === 'project' ? '该项目下的任务、需求、缺陷、复盘会一并删除，且不可恢复。' : '此操作不可恢复。',
      okText: '确认删除',
      onOk: function () {
        if (kind === 'project') S.deleteProject(id);
        else if (kind === 'task') S.deleteTask(id);
        else if (kind === 'req') S.deleteRequirement(id);
        else if (kind === 'bug') S.deleteDefect(id);
        else if (kind === 'review') S.deleteReview(id);
        toast(label + '已删除');
        render();
      }
    });
  }

  function batchDelete(scope, kind) {
    var ids = V.selectedIds(scope);
    if (!ids.length) { toast('请先勾选要删除的记录', 'err'); return; }
    confirmAction({
      title: '批量删除',
      message: '将删除已勾选的 ' + ids.length + ' 条记录，确定继续？',
      sub: '此操作不可恢复。',
      okText: '删除 ' + ids.length + ' 条',
      onOk: function () {
        var n = 0;
        if (kind === 'task') n = S.deleteTasks(ids);
        else if (kind === 'req') n = S.deleteRequirements(ids);
        else if (kind === 'bug') n = S.deleteDefects(ids);
        V.ui[scope].selected = {};
        toast('已删除 ' + n + ' 条记录');
        render();
      }
    });
  }

  /* ============================================================
   * 七、复盘相关
   * ============================================================ */
  function currentSnapshot(projectId, week) {
    var snap = S.buildSnapshot(projectId);
    var sum = S.weeklySummary(projectId, week);
    snap.items = sum.items.map(function (it) {
      return { label: it.label, main: it.main, unit: it.unit, sub: it.sub };
    });
    snap.weekSummary = { week: sum.week, range: sum.range };
    return snap;
  }

  function saveReview() {
    var p = S.getCurrentProject();
    if (!p) return;
    var week = V.ui.review.editingWeek || U.weekKey(U.today());
    var d = V.ui.review.draft;
    if (d.whatDone.length > 500 || d.blocked.length > 500 || d.nextOne.length > 500) {
      toast('每栏上限 500 字，精简一下再保存', 'err');
      return;
    }
    var snap = currentSnapshot(p.id, week);
    snap.week = week;
    S.saveReview({
      projectId: p.id, week: week, snapshot: snap,
      whatDone: d.whatDone, blocked: d.blocked, nextOne: d.nextOne
    });
    var allEmpty = !d.whatDone.trim() && !d.blocked.trim() && !d.nextOne.trim();
    toast(allEmpty ? '这次只留了数据，下次加一句话会更好' : '已保存本次复盘');
    V.ui.review.loadedWeek = null;
    render();
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(fallback()); });
      } else {
        resolve(fallback());
      }
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch (e) { return false; }
      }
    });
  }

  function downloadText(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/markdown') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      global.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) { return false; }
  }

  function exportCurrentReview() {
    var p = S.getCurrentProject();
    if (!p) return;
    var week = V.ui.review.editingWeek || U.weekKey(U.today());
    var d = V.ui.review.draft;
    var snap = currentSnapshot(p.id, week);
    var md = S.reviewMarkdown({
      projectId: p.id, week: week, savedAt: Date.now(), snapshot: snap,
      whatDone: d.whatDone, blocked: d.blocked, nextOne: d.nextOne
    });
    copyText(md).then(function (ok) {
      toast(ok ? 'Markdown 已复制到剪贴板，同时开始下载' : '已生成 .md 文件并下载');
    });
    downloadText((p.name || 'project') + '-' + week + '-复盘.md', md);
  }

  function exportOneReview(id) {
    var r = S.getReview(id);
    if (!r) return;
    var md = S.reviewMarkdown(r);
    var p = S.getProject(r.projectId);
    copyText(md).then(function (ok) {
      toast(ok ? 'Markdown 已复制到剪贴板' : '复制失败，已直接下载文件', ok ? undefined : 'err');
    });
    downloadText((p ? p.name : 'project') + '-' + r.week + '-复盘.md', md);
  }

  /* ============================================================
   * 数据备份：导出 / 导入（本地存储的唯一兜底）
   * ============================================================ */
  function backupCountText(c) {
    var parts = [];
    if (c.projects) parts.push(c.projects + ' 个项目');
    if (c.tasks) parts.push(c.tasks + ' 条任务');
    if (c.requirements) parts.push(c.requirements + ' 条需求');
    if (c.defects) parts.push(c.defects + ' 条缺陷');
    if (c.reviews) parts.push(c.reviews + ' 份复盘');
    return parts.length ? parts.join(' · ') : '空数据';
  }

  function stateTotal(st) {
    return st.projects.length + st.tasks.length + st.requirements.length +
      st.defects.length + st.reviews.length;
  }

  function exportBackup() {
    if (!stateTotal(S.getState())) { toast('当前没有数据可导出', 'err'); return; }
    var d = new Date();
    var stamp = d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()) + '-' +
      U.pad(d.getHours()) + U.pad(d.getMinutes());
    var name = '项目管理系统-备份-' + stamp + '.json';
    var ok = downloadText(name, JSON.stringify(S.exportData(), null, 2), 'application/json');
    toast(ok ? '备份已导出：' + name : '导出失败，请检查浏览器下载权限', ok ? undefined : 'err');
  }

  /** 导入流程：先只校验（dryRun），把条数摆给用户看，确认后才覆盖 */
  function handleImportFile(file) {
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { toast('文件超过 32MB，不像是本系统的备份', 'err'); return; }

    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var preview = S.importData(text, true);
      if (!preview.ok) { toast('导入失败：' + preview.error, 'err'); return; }

      var nextTotal = preview.counts.projects + preview.counts.tasks + preview.counts.requirements +
        preview.counts.defects + preview.counts.reviews;
      if (!nextTotal) { toast('这份备份里没有任何数据，已取消导入', 'err'); return; }

      var curTotal = stateTotal(S.getState());
      confirmAction({
        title: '导入备份',
        message: '将导入 ' + backupCountText(preview.counts) + '。当前' +
          (curTotal ? '的 ' + curTotal + ' 条数据' : '数据') + '会被全部替换。',
        sub: '此操作不可撤销' +
          (preview.dropped ? '；另有 ' + preview.dropped + ' 条所属项目不在备份里，会被丢弃' : '') +
          (curTotal ? '。建议先导出一份当前数据。' : '。'),
        okText: '确认导入',
        onOk: function () {
          var res = S.importData(text, false);
          if (!res.ok) { toast('导入失败：' + res.error, 'err'); return; }
          resetUiState();
          toast('导入完成：' + backupCountText(res.counts));
          navTo('overview');
          render();
        }
      });
    };
    reader.onerror = function () { toast('读取文件失败，请重试', 'err'); };
    reader.readAsText(file, 'utf-8');
  }

  /** 清空 / 导入后统一重置视图内部状态，避免残留筛选与草稿 */
  function resetUiState() {
    V.ui.plan = { stage: '', status: '', kw: '', selected: {}, group: true };
    V.ui.req = { status: '', priority: '', owner: '', source: '', kw: '', selected: {} };
    V.ui.bug = { severity: '', status: '', kw: '', selected: {} };
    V.ui.dash = {};
    V.ui.review = {
      draft: { whatDone: '', blocked: '', nextOne: '' },
      editingWeek: null, expanded: {}, onlyWritten: false, loadedWeek: null
    };
  }

  /* ============================================================
   * 八、渲染与路由
   * ============================================================ */
  function parseHash() {
    var h = String(global.location.hash || '').replace(/^#\/?/, '');
    return h || 'overview';
  }

  function isValidView(key) {
    for (var i = 0; i < V.NAV.length; i++) if (V.NAV[i].key === key) return true;
    return false;
  }

  function renderNav() {
    var cur = state.view;
    var main = V.NAV.slice(0, 7);
    var settingsItem = V.NAV[7];
    function item(n) {
      var active = n.key === cur ? ' active' : '';
      return '<button type="button" class="nav-item' + active + '" data-nav="' + n.key + '" title="' + Charts.esc(n.label) + '">' +
        '<span class="nav-icon">' + V.icon(n.icon, 24) + '</span>' +
        '<span class="nav-label">' + Charts.esc(n.label) + '</span></button>';
    }
    return main.map(item).join('') +
      '<span class="nav-spacer"></span>' +
      '<span class="nav-sep"></span>' +
      item(settingsItem);
  }

  function updateChrome() {
    // 项目切换器
    var projects = S.getProjects();
    var curId = S.getCurrentProjectId();
    var opts = projects.map(function (p) {
      return '<option value="' + Charts.esc(p.id) + '"' + (p.id === curId ? ' selected' : '') + '>' +
        Charts.esc(p.name || '未命名项目') + '</option>';
    }).join('');
    if (!projects.length) {
      opts = '<option value="">还没有项目</option>';
    }
    dom.projectSelect.innerHTML = opts;
    dom.projectSelect.disabled = !projects.length;

    // 健康度灯 + 倒计时
    if (curId) {
      var m = S.metrics(curId);
      dom.healthLamp.className = 'lamp lamp-' + m.health;
      dom.healthText.textContent = V.healthText(m.health);
      dom.countdown.textContent = V.launchTextOf(m.daysToLaunch, S.getProject(curId));
    } else {
      dom.healthLamp.className = 'lamp lamp-gray';
      dom.healthText.textContent = '未选择项目';
      dom.countdown.textContent = '距上线 — 天';
    }

    // 状态条（时间精确到秒，点「刷新」后能肉眼看到变化；只改文本，不重渲染整页）
    var saved = S.getSavedAt();
    dom.statusTime.textContent = '数据更新时间 ' + (saved ? U.fmtDateTimeSec(saved) : '—（尚未写入）');
    var p = S.getCurrentProject();
    dom.statusProject.textContent = '当前项目 ' + (p ? (p.name || '未命名项目') : '—');
  }

  function render() {
    state.view = isValidView(parseHash()) ? parseHash() : 'overview';
    // 兜底同步外观（数据可能被导入备份等方式改动）
    Appearance.syncDom();
    var fn = V[state.view];
    var html = typeof fn === 'function' ? fn() : '';

    dom.view.className = 'view';
    dom.view.innerHTML = html;
    // 强制回流后再加入场动画；仅视图切换时播放，CRUD 刷新不重播（避免每存一次就闪一下）
    void dom.view.offsetWidth;
    if (state.animateNext && !Motion.isReduced()) dom.view.classList.add('entering');
    state.animateNext = false;

    Motion.register(dom.view);
    dom.sidenav.innerHTML = renderNav();
    updateChrome();
    afterRender();

    // 恢复搜索框焦点（搜索输入后重渲染不丢焦点）
    if (state.pendingFocus) {
      var sel = '[data-filter="kw"][data-scope="' + state.pendingFocus.scope + '"]';
      var el = dom.view.querySelector(sel);
      if (el) {
        try {
          el.focus();
          var len = el.value.length;
          el.setSelectionRange(len, len);
        } catch (e) { /* ignore */ }
      }
      state.pendingFocus = null;
    }

    // 全局搜索命中后的行高亮（3s 后自动淡出）
    if (state.highlightId) {
      var hlId = state.highlightId;
      state.highlightId = null;
      var row = dom.view.querySelector('[data-row-id="' + hlId + '"]');
      if (row) {
        row.classList.add('hl');
        global.setTimeout(function () { row.classList.remove('hl'); }, 3000);
        try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
      }
    }
  }

  /** 渲染后的视图级收尾：甘特图默认把今日线滚动到可见区偏左位置 */
  function afterRender() {
    if (state.view !== 'gantt') return;
    var wrap = dom.view.querySelector('.gantt-wrap');
    var line = dom.view.querySelector('.today-line');
    if (!wrap || !line) return;
    var LEFT_COL = 268; // 左侧任务树宽度，与 CSS 保持一致
    var target = LEFT_COL + line.offsetLeft - wrap.clientWidth * 0.42;
    wrap.scrollLeft = Math.max(0, target);
  }

  function navTo(key) {
    if (!isValidView(key)) return;
    if (state.view === key) return;
    var target = '#/' + key;
    dom.view.classList.add('leaving');
    if (state.navTimer) global.clearTimeout(state.navTimer);
    state.navTimer = global.setTimeout(function () {
      state.navTimer = null;
      if (global.location.hash === target) {
        render();
      } else {
        global.location.hash = target;
      }
    }, 160);
  }

  /* ============================================================
   * 九、事件绑定
   * ============================================================ */
  function handleAction(act, el) {
    var id = el.getAttribute('data-id');

    switch (act) {
      /* ---- 外观 ---- */
      case 'set-theme': {
        var tk = el.getAttribute('data-value');
        Appearance.setTheme(tk);
        render();
        toast(tk === 'ocean' ? '已切换到「赛博蓝紫」' : '已切换到「橙红暖金」');
        return;
      }
      case 'toggle-motion': {
        var onNow = Appearance.toggleMotion();
        render();
        toast(onNow ? '动效已开启' : '动效已关闭');
        return;
      }

      /* ---- 弹窗 ---- */
      case 'modal-cancel': closeModal(); return;
      case 'form-submit': {
        var kind = el.getAttribute('data-kind');
        var formEl = dom.modalBody.querySelector('form');
        if (formEl) submitEntityForm(kind, id, formEl);
        return;
      }

      /* ---- 项目 ---- */
      case 'new-project': openEntityForm('project', null); return;
      case 'edit-project': openEntityForm('project', id); return;
      case 'del-project': confirmDeleteOne('project', id); return;
      case 'open-project':
        S.setCurrentProject(id);
        navTo('dashboard');
        return;

      /* ---- 任务 ---- */
      case 'new-task': openEntityForm('task', null); return;
      case 'edit-task': openEntityForm('task', id); return;
      case 'del-task': confirmDeleteOne('task', id); return;
      case 'batch-del-task': batchDelete('plan', 'task'); return;
      case 'toggle-group': V.ui.plan.group = !V.ui.plan.group; render(); return;
      case 'clear-filter-plan':
        V.ui.plan = { stage: '', status: '', kw: '', selected: {}, group: V.ui.plan.group };
        render(); return;

      /* ---- 需求 ---- */
      case 'new-req': openEntityForm('req', null); return;
      case 'edit-req': openEntityForm('req', id); return;
      case 'del-req': confirmDeleteOne('req', id); return;
      case 'batch-del-req': batchDelete('req', 'req'); return;
      case 'clear-filter-req':
        V.ui.req = { status: '', priority: '', owner: '', source: '', kw: '', selected: {} };
        render(); return;

      /* ---- 缺陷 ---- */
      case 'new-bug': openEntityForm('bug', null); return;
      case 'edit-bug': openEntityForm('bug', id); return;
      case 'del-bug': confirmDeleteOne('bug', id); return;
      case 'batch-del-bug': batchDelete('bug', 'bug'); return;
      case 'clear-filter-bug':
        V.ui.bug = { severity: '', status: '', kw: '', selected: {} };
        render(); return;

      /* ---- 勾选 ---- */
      case 'check-row': {
        var scope = el.getAttribute('data-scope');
        V.ui[scope].selected[el.getAttribute('data-id')] = el.checked;
        render();
        return;
      }
      case 'check-all': {
        var sc = el.getAttribute('data-scope');
        var p = S.getCurrentProject();
        if (!p) return;
        var rows = sc === 'plan' ? V.filteredTasks(p)
          : (sc === 'req' ? V.filteredRequirements(p) : V.filteredDefects(p));
        V.ui[sc].selected = {};
        if (el.checked) {
          rows.forEach(function (r) { V.ui[sc].selected[r.id] = true; });
        }
        render();
        return;
      }

      /* ---- 复盘 ---- */
      case 'save-review': saveReview(); return;
      case 'export-review': exportCurrentReview(); return;
      case 'export-one-review': exportOneReview(id); return;
      case 'fill-blocked': {
        var proj = S.getCurrentProject();
        if (!proj) return;
        var blocks = S.getTasks(proj.id).filter(function (t) {
          return t.status === '阻塞' && t.blockedReason;
        });
        if (!blocks.length) { toast('当前没有带原因的阻塞任务', 'err'); return; }
        var text = blocks.map(function (t) { return '· ' + t.title + '：' + t.blockedReason; }).join('\n');
        V.ui.review.draft.blocked = text.slice(0, 500);
        render();
        toast('已带入 ' + blocks.length + ' 条阻塞原因');
        return;
      }
      case 'toggle-review': {
        V.ui.review.expanded[id] = !V.ui.review.expanded[id];
        render();
        return;
      }
      case 'edit-review': {
        var r = S.getReview(id);
        if (!r) return;
        V.ui.review.editingWeek = r.week;
        V.ui.review.loadedWeek = null;
        render();
        global.scrollTo && global.scrollTo(0, 0);
        dom.main.scrollTop = 260;
        return;
      }
      case 'del-review': confirmDeleteOne('review', id); return;
      case 'review-cancel-edit':
        V.ui.review.editingWeek = null;
        V.ui.review.loadedWeek = null;
        render();
        return;
      case 'toggle-only-written':
        V.ui.review.onlyWritten = !V.ui.review.onlyWritten;
        render();
        return;
      case 'focus-write': {
        var ta = dom.view.querySelector('[data-write="whatDone"]');
        if (ta) {
          ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
          try { ta.focus(); } catch (e) { /* ignore */ }
        }
        return;
      }

      /* ---- 数据备份 ---- */
      case 'export-json': exportBackup(); return;
      case 'import-json': {
        var fileInput = document.getElementById('import-file');
        if (!fileInput) return;
        try { fileInput.value = ''; } catch (e) { /* ignore */ }
        fileInput.click();
        return;
      }

      /* ---- 设置 ---- */
      case 'reset-data':
        confirmAction({
          title: '清空全部数据',
          message: '所有项目、任务、需求、缺陷与复盘记录都会被删除，此操作不可恢复。',
          sub: '建议先在「数据备份」里导出 .json，清空后可从备份恢复。',
          okText: '确认清空',
          onOk: function () {
            S.reset();
            resetUiState();
            toast('全部数据已清空');
            navTo('overview');
            render();
          }
        });
        return;

      default: return;
    }
  }

  function bindEvents() {
    /* ---- 点击（事件委托） ---- */
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      // 全局搜索结果
      var gsEl = t.closest('[data-gs]');
      if (gsEl) {
        ev.preventDefault();
        gotoSearchResult(gsEl);
        return;
      }
      // 点到搜索区域外则收起下拉
      if (dom.globalSearch && !dom.globalSearch.contains(t)) closeSearchResults();

      var navEl = t.closest('[data-nav]');
      if (navEl) {
        ev.preventDefault();
        navTo(navEl.getAttribute('data-nav'));
        return;
      }
      var actEl = t.closest('[data-act]');
      if (actEl) {
        var act = actEl.getAttribute('data-act');
        ev.preventDefault();
        handleAction(act, actEl);
        return;
      }
    });

    /* ---- 复选框 / 下拉 / 日期（change） ---- */
    document.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute) return;

      // 导入备份文件
      if (el.id === 'import-file') {
        var picked = el.files && el.files[0];
        handleImportFile(picked);
        return;
      }

      if (el.getAttribute('data-act') === 'check-row' || el.getAttribute('data-act') === 'check-all') {
        return; // 由 click 委托处理（更早触发）
      }

      var filter = el.getAttribute('data-filter');
      if (!filter) return;
      var scope = el.getAttribute('data-scope');

      if (scope === 'settings') {
        var patch = {};
        if (filter === 'reviewDay') patch.reviewDay = Number(el.value);
        if (filter === 'reviewTime') patch.reviewTime = el.value;
        S.updateSettings(patch);
        toast('复盘规则已更新');
        return;
      }

      if (V.ui[scope]) {
        V.ui[scope][filter] = el.value;
        if (filter !== 'kw') V.ui[scope].selected = {};
        render();
      }
    });

    /* ---- 输入（全局搜索 / 搜索 / 复盘手写） ---- */
    var searchTimer = null;
    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute) return;

      // 顶栏全局搜索
      if (el === dom.gsInput) {
        var q = el.value.trim();
        if (!q) { closeSearchResults(); return; }
        renderSearchResults(q);
        return;
      }

      // 复盘三栏：只更新草稿与计数，不重渲染（避免输入被打断）
      var write = el.getAttribute('data-write');
      if (write) {
        V.ui.review.draft[write] = el.value;
        var cnt = dom.view.querySelector('#cnt-' + write);
        if (cnt) {
          cnt.textContent = el.value.length + ' / 500';
          cnt.className = 'counter' + (el.value.length > 500 ? ' over' : '');
        }
        return;
      }

      if (el.getAttribute('data-filter') === 'kw') {
        var scope = el.getAttribute('data-scope');
        var value = el.value;
        if (searchTimer) global.clearTimeout(searchTimer);
        searchTimer = global.setTimeout(function () {
          V.ui[scope].kw = value;
          V.ui[scope].selected = {};
          state.pendingFocus = { scope: scope };
          render();
        }, 220);
      }
    });

    /* ---- 表单提交（设置页内联表单） ---- */
    document.addEventListener('submit', function (ev) {
      var formEl = ev.target;
      if (!formEl || !formEl.getAttribute) return;
      var kind = formEl.getAttribute('data-form');
      if (kind !== 'settings') return;
      ev.preventDefault();
      var p = S.getCurrentProject();
      if (!p) return;
      var name = (formEl.querySelector('[name="name"]').value || '').trim();
      var start = formEl.querySelector('[name="start"]').value;
      var end = formEl.querySelector('[name="end"]').value;
      var errors = {};
      if (!name) errors.name = '请填写项目名称';
      if (!start) errors.start = '请选择开始日期';
      if (!end) errors.end = '请选择结束日期';
      if (start && end && U.toDate(end) < U.toDate(start)) errors.end = '结束日不得早于开始日';
      if (Object.keys(errors).length) {
        paintErrors(formEl, errors);
        return;
      }
      S.updateProject(p.id, {
        name: name,
        code: (formEl.querySelector('[name="code"]').value || '').trim(),
        owner: (formEl.querySelector('[name="owner"]').value || '').trim(),
        start: start,
        end: end,
        status: formEl.querySelector('[name="status"]').value
      });
      toast('项目信息已保存');
      render();
    });

    /* ---- 项目切换 ---- */
    dom.projectSelect.addEventListener('change', function () {
      S.setCurrentProject(dom.projectSelect.value);
      V.ui.plan.selected = {};
      V.ui.req = { status: '', priority: '', owner: '', source: '', kw: '', selected: {} };
      V.ui.bug.selected = {};
      V.ui.dash = {};
      closeSearchResults();
      if (dom.gsInput) dom.gsInput.value = '';
      V.ui.review = {
        draft: { whatDone: '', blocked: '', nextOne: '' },
        editingWeek: null, expanded: {}, onlyWritten: false, loadedWeek: null
      };
      render();
    });

    dom.btnNewProjectTop.addEventListener('click', function () {
      openEntityForm('project', null);
    });

    /* ---- 顶栏全局搜索 ---- */
    if (dom.gsInput) {
      dom.gsInput.addEventListener('focus', function () {
        if (dom.gsInput.value.trim()) renderSearchResults(dom.gsInput.value.trim());
      });
      dom.gsInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          dom.gsInput.blur();
          closeSearchResults();
        }
      });
    }

    /* ---- 状态条「刷新」 ---- */
    if (dom.btnRefresh) {
      dom.btnRefresh.addEventListener('click', function () {
        S.refresh();          // 重新落盘并刷新数据更新时间
        state.animateNext = false;
        render();             // 重算指标 + 重渲染
        toast('已刷新 · 指标已重算');
      });
    }

    /* ---- 弹窗关闭：× / 遮罩 / ESC ---- */
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalMask.addEventListener('click', function (ev) {
      if (ev.target === dom.modalMask) closeModal();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (state.modalOpen) { closeModal(); return; }
        if (dom.gsResults && !dom.gsResults.hidden) { closeSearchResults(); return; }
        hideTip();
        return;
      }
      // "/" 聚焦顶栏全局搜索
      if (ev.key === '/' && !state.modalOpen) {
        var tag = (ev.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (dom.gsInput) {
          ev.preventDefault();
          dom.gsInput.focus();
        }
      }
    });

    /* ---- 浮层提示（data-tip） ---- */
    document.addEventListener('mousemove', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-tip]') : null;
      if (el) showTip(el.getAttribute('data-tip'), ev.clientX, ev.clientY);
      else if (!dom.tip.hidden) hideTip();
    });
    document.addEventListener('mouseleave', hideTip);

    /* ---- 哈希路由 ---- */
    global.addEventListener('hashchange', function () {
      state.animateNext = true;
      render();
    });

    /* ---- 7.2.6 交互唤醒与回落：鼠标在主区时振幅固定降到 1px，5s 无操作恢复 ---- */
    var idleTimer = null;
    function soften() {
      Motion.setAmpOverride(1);
      if (idleTimer) global.clearTimeout(idleTimer);
      idleTimer = global.setTimeout(function () { Motion.setAmpOverride(null); }, 5000);
    }
    dom.main.addEventListener('mousemove', soften);

    /* ---- 卡片墙聚焦效应 + 优先级条聚焦 ---- */
    dom.main.addEventListener('mouseover', function (ev) {
      var card = ev.target.closest ? ev.target.closest('.card-shell') : null;
      var grid = dom.view.querySelector('#projGrid');
      if (grid) {
        if (card && grid.contains(card)) {
          grid.classList.add('focusing');
          Array.prototype.forEach.call(grid.children, function (c) {
            c.classList.toggle('hovered', c === card);
          });
        } else {
          grid.classList.remove('focusing');
          Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('hovered'); });
        }
      }
      var pb = ev.target.closest ? ev.target.closest('.pb-row') : null;
      var bar = dom.view.querySelector('.prio-bar');
      if (bar) {
        if (pb && bar.contains(pb)) {
          bar.classList.add('focusing');
          Array.prototype.forEach.call(bar.children, function (r) {
            r.classList.toggle('hovered', r === pb);
          });
        } else {
          bar.classList.remove('focusing');
          Array.prototype.forEach.call(bar.children, function (r) { r.classList.remove('hovered'); });
        }
      }
    });

    /* ---- 7.2.6 / 7.5 后台暂停 ---- */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        document.body.classList.add('anim-paused');
        Motion.pause();
        Particles.pause();
      } else {
        document.body.classList.remove('anim-paused');
        Motion.resume();
        Particles.resume();
      }
    });
  }

  /* ============================================================
   * 十、启动
   * ============================================================ */
  function boot() {
    dom.view = document.getElementById('view');
    dom.main = document.getElementById('main');
    dom.sidenav = document.getElementById('sidenav');
    dom.projectSelect = document.getElementById('projectSelect');
    dom.healthChip = document.getElementById('healthChip');
    dom.healthLamp = document.getElementById('healthLamp');
    dom.healthText = document.getElementById('healthText');
    dom.countdown = document.getElementById('countdown');
    dom.statusTime = document.getElementById('statusTime');
    dom.statusProject = document.getElementById('statusProject');
    dom.modalMask = document.getElementById('modalMask');
    dom.modal = document.getElementById('modal');
    dom.modalTitle = document.getElementById('modalTitle');
    dom.modalBody = document.getElementById('modalBody');
    dom.modalFoot = document.getElementById('modalFoot');
    dom.modalClose = document.getElementById('modalClose');
    dom.toastWrap = document.getElementById('toastWrap');
    dom.tip = document.getElementById('tip');
    dom.btnNewProjectTop = document.getElementById('btnNewProjectTop');
    dom.globalSearch = document.getElementById('globalSearch');
    dom.gsInput = document.getElementById('globalSearchInput');
    dom.gsResults = document.getElementById('gsResults');
    dom.btnRefresh = document.getElementById('btnRefresh');

    bindEvents();
    // 先应用外观再初始化粒子与渲染，避免首屏先闪一下默认主题
    Appearance.apply();
    Particles.init();

    if (!global.location.hash) {
      global.location.hash = '#/overview';
    }
    render();

    // 暴露给控制台调试（不影响功能）
    global.App = {
      render: render,
      navTo: navTo,
      toast: toast,
      state: state,
      appearance: Appearance
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
