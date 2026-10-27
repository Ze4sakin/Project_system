/* ============================================================
 * store.js · 数据层（唯一数据源）
 * - 内存数组 state 为唯一真源，每次写操作后同步 localStorage
 * - 所有统计指标在此实时计算，视图层禁止写死数字
 * - 无依赖、无模块，挂到 window.Store
 * ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'projsys.v1';

  /* ---------------- 枚举常量（与 PRD 状态机一致） ---------------- */
  var CONST = {
    PROJECT_STATUS: ['未开始', '进行中', '已延期', '已完成', '已归档'],
    TASK_STATUS: ['未开始', '进行中', '阻塞', '已完成', '已取消'],
    PRIORITY: ['P0', 'P1', 'P2', 'P3'],
    REQ_STATUS: ['草稿', '待评审', '已通过', '开发中', '已上线', '已验收', '已关闭'],
    REQ_SOURCE: ['内部', '客户', '运营', '测试', '其他'],
    DEFECT_SEVERITY: ['致命', '严重', '一般', '轻微'],
    DEFECT_STATUS: ['新建', '已确认', '修复中', '待验证', '已关闭', '不予处理'],
    WEEKDAY_NAMES: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    // 状态语义色（全系统唯一映射，见 PRD 6.2）
    COLOR: {
      未开始: 'var(--text-dim)',
      进行中: '#3FD8E0',
      阻塞: '#FF8C42',
      已完成: '#48D18A',
      已取消: 'var(--text-dim)',
      草稿: 'var(--text-dim)',
      待评审: '#FFA53D',
      已通过: '#3FD8E0',
      开发中: '#3FD8E0',
      已上线: '#48D18A',
      已验收: '#48D18A',
      已关闭: 'var(--text-dim)',
      新建: '#FF7A33',
      已确认: '#FFA53D',
      修复中: '#FFA53D',
      待验证: '#3FD8E0',
      不予处理: 'var(--text-dim)',
      致命: '#E8410F',
      严重: '#FF7A33',
      一般: '#FFA53D',
      轻微: 'var(--text-dim)',
      P0: 'var(--ember-500)',
      P1: 'var(--amber-500)',
      P2: '#3FD8E0',
      P3: 'var(--text-dim)',
      未开始项目: 'var(--text-dim)'
    }
  };

  /* ---------------- 内部状态 ---------------- */
  var state = {
    projects: [],
    tasks: [],
    requirements: [],
    defects: [],
    reviews: [],
    settings: {
      currentProjectId: null,
      reviewDay: 5,       // 0=周日 … 6=周六，默认周五
      reviewTime: '18:00',
      seqReq: 0,          // 需求编号自增计数器（REQ-xx）
      seqDefect: 0,       // 缺陷编号自增计数器（BUG-xx）
      theme: 'ember',     // 外观主题：ember（橙红）/ ocean（赛博蓝紫）
      motion: 'on'        // 动效开关：on / off
    },
    savedAt: null
  };

  /* ============================================================
   * 通用工具
   * ============================================================ */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function ymd(v) {
    var d = toDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function addDays(d, n) {
    var x = toDate(d);
    if (!x) return null;
    x.setDate(x.getDate() + n);
    return x;
  }

  /** 整天差：a - b（a、b 均按本地 0 点归一） */
  function diffDays(a, b) {
    var x = toDate(a), y = toDate(b);
    if (!x || !y) return 0;
    return Math.round((x.getTime() - y.getTime()) / 86400000);
  }

  /** 所在周的周一 */
  function weekStart(d) {
    var x = toDate(d) || today();
    var dow = (x.getDay() + 6) % 7; // 周一=0
    return addDays(x, -dow);
  }

  /** ISO 周编号 2026-W43 */
  function weekKey(d) {
    var x = toDate(d) || today();
    var t = new Date(x.getFullYear(), x.getMonth(), x.getDate());
    var dow = (t.getDay() + 6) % 7;
    t = addDays(t, 3 - dow); // 该周周四
    var firstThu = new Date(t.getFullYear(), 0, 4);
    var fdow = (firstThu.getDay() + 6) % 7;
    firstThu = addDays(firstThu, 3 - fdow);
    var week = 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
    return t.getFullYear() + '-W' + pad(week);
  }

  /** 由周编号反推周一起止 */
  function weekRangeOf(key) {
    var m = /^(\d{4})-W(\d{1,2})$/.exec(String(key || ''));
    if (!m) return null;
    var year = +m[1], week = +m[2];
    var jan4 = new Date(year, 0, 4);
    var dow = (jan4.getDay() + 6) % 7;
    var mon1 = addDays(jan4, -dow);       // 第 1 周周一
    var start = addDays(mon1, (week - 1) * 7);
    return { key: year + '-W' + pad(week), start: start, end: addDays(start, 6) };
  }

  function weekRange(d) {
    var s = weekStart(d);
    return { key: weekKey(s), start: s, end: addDays(s, 6) };
  }

  function fmtCN(d) {
    var x = toDate(d);
    return x ? (x.getMonth() + 1) + '月' + x.getDate() + '日' : '—';
  }

  function fmtFull(d) {
    var x = toDate(d);
    return x ? x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) : '—';
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** 带秒的时间戳（状态条「数据更新时间」用，便于肉眼确认刷新真的发生了） */
  function fmtDateTimeSec(ts) {
    var base = fmtDateTime(ts);
    if (base === '—') return base;
    return base + ':' + pad(new Date(ts).getSeconds());
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function pick(value, list, fallback) {
    return list.indexOf(value) >= 0 ? value : fallback;
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += num(arr[i]);
    return s;
  }

  /* ============================================================
   * 持久化
   * 双形态适配：
   * - 桌面版（Electron 封装）：window.ProjSysFS 存在 → 读写 exe 同目录 JSON 文件
   * - 浏览器版（双击 index.html）：无桥接 → 回退 localStorage
   * 上层业务代码完全不感知差异。
   * ============================================================ */
  function fileBridge() {
    return global.ProjSysFS && typeof global.ProjSysFS.save === 'function' ? global.ProjSysFS : null;
  }

  function persist() {
    state.savedAt = Date.now();
    var str = JSON.stringify(state);
    var bridge = fileBridge();
    if (bridge) {
      try { bridge.save(str); return; } catch (e) { /* 桥接异常则回退 localStorage */ }
    }
    try {
      global.localStorage.setItem(STORAGE_KEY, str);
    } catch (e) {
      // 存储不可用（隐私模式 / 容量满）时静默降级，仅保留内存数据
      state.savedAt = state.savedAt || Date.now();
    }
  }

  function load() {
    var raw = null;
    var bridge = fileBridge();
    if (bridge) {
      try { raw = bridge.load(); } catch (e) { raw = null; }
    }
    if (!raw) { try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; } }
    if (!raw) return;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || typeof parsed !== 'object') return;

    state.projects = Array.isArray(parsed.projects) ? parsed.projects.map(normalizeProject) : [];
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [];
    state.requirements = Array.isArray(parsed.requirements) ? parsed.requirements.map(normalizeRequirement) : [];
    state.defects = Array.isArray(parsed.defects) ? parsed.defects.map(normalizeDefect) : [];
    state.reviews = Array.isArray(parsed.reviews) ? parsed.reviews.map(normalizeReview) : [];
    state.settings = Object.assign({}, state.settings, parsed.settings || {});
    state.savedAt = parsed.savedAt || null;

    // 清理孤儿数据（项目被删后遗留的子对象）
    var ids = {};
    state.projects.forEach(function (p) { ids[p.id] = true; });
    state.tasks = state.tasks.filter(function (t) { return ids[t.projectId]; });
    state.requirements = state.requirements.filter(function (r) { return ids[r.projectId]; });
    state.defects = state.defects.filter(function (d) { return ids[d.projectId]; });
    state.reviews = state.reviews.filter(function (r) { return ids[r.projectId]; });

    // 老数据升级：为缺失 seq 的需求/缺陷按数组顺序回填稳定序号，并写回 localStorage
    if (backfillSeq()) persist();
  }

  /**
   * 回填稳定序号。返回是否发生了变更（用于决定是否立即落盘）。
   * 编号一旦分配就不再改变，删除其他记录不会导致重排。
   */
  function backfillSeq() {
    var changed = false;
    var maxReq = Math.max(0, Math.floor(num(state.settings.seqReq, 0)));
    state.requirements.forEach(function (r) {
      if (!r.seq || r.seq <= 0) {
        maxReq += 1;
        r.seq = maxReq;
        changed = true;
      } else if (r.seq > maxReq) {
        maxReq = r.seq;
        changed = true;
      }
    });
    state.settings.seqReq = maxReq;

    var maxDef = Math.max(0, Math.floor(num(state.settings.seqDefect, 0)));
    state.defects.forEach(function (d) {
      if (!d.seq || d.seq <= 0) {
        maxDef += 1;
        d.seq = maxDef;
        changed = true;
      } else if (d.seq > maxDef) {
        maxDef = d.seq;
        changed = true;
      }
    });
    state.settings.seqDefect = maxDef;
    return changed;
  }

  /* ============================================================
   * 对象归一化（保证字段集合严格与 PRD 一致，不多不少）
   * ============================================================ */
  function normalizeProject(d) {
    d = d || {};
    return {
      id: d.id || uid('prj'),
      name: str(d.name),
      code: str(d.code),
      owner: str(d.owner),
      start: ymd(d.start),
      end: ymd(d.end),
      status: pick(d.status, CONST.PROJECT_STATUS, '进行中'),
      health: d.health || 'green'
    };
  }

  function normalizeTask(d) {
    d = d || {};
    return {
      id: d.id || uid('tsk'),
      projectId: d.projectId || '',
      stage: str(d.stage) || '未分阶段',
      title: str(d.title),
      owner: str(d.owner),
      start: ymd(d.start),
      end: ymd(d.end),
      estimateHours: Math.max(0, num(d.estimateHours, 0)),
      progress: clamp(num(d.progress, 0), 0, 100),
      status: pick(d.status, CONST.TASK_STATUS, '未开始'),
      priority: pick(d.priority, CONST.PRIORITY, 'P2'),
      milestone: !!d.milestone,
      blockedReason: str(d.blockedReason)
    };
  }

  function normalizeRequirement(d) {
    d = d || {};
    return {
      id: d.id || uid('req'),
      projectId: d.projectId || '',
      // 稳定序号：一经生成永不变（不随数组下标/排序/删除而重排）
      seq: Math.max(0, Math.floor(num(d.seq, 0))),
      title: str(d.title),
      desc: str(d.desc),
      source: pick(d.source, CONST.REQ_SOURCE, '内部'),
      priority: pick(d.priority, CONST.PRIORITY, 'P1'),
      status: pick(d.status, CONST.REQ_STATUS, '草稿'),
      owner: str(d.owner),
      expectDate: ymd(d.expectDate),
      taskIds: Array.isArray(d.taskIds) ? d.taskIds.slice() : []
    };
  }

  function normalizeDefect(d) {
    d = d || {};
    return {
      id: d.id || uid('bug'),
      projectId: d.projectId || '',
      seq: Math.max(0, Math.floor(num(d.seq, 0))),
      title: str(d.title),
      severity: pick(d.severity, CONST.DEFECT_SEVERITY, '一般'),
      status: pick(d.status, CONST.DEFECT_STATUS, '新建'),
      owner: str(d.owner),
      foundVersion: str(d.foundVersion),
      env: str(d.env),
      steps: str(d.steps),
      relatedReqId: d.relatedReqId || '',
      relatedTaskId: d.relatedTaskId || '',
      createdAt: d.createdAt || Date.now(),
      closedAt: d.closedAt || null
    };
  }

  function normalizeReview(d) {
    d = d || {};
    return {
      id: d.id || uid('rev'),
      projectId: d.projectId || '',
      week: str(d.week) || weekKey(today()),
      savedAt: d.savedAt || Date.now(),
      snapshot: d.snapshot && typeof d.snapshot === 'object' ? d.snapshot : {},
      whatDone: str(d.whatDone),
      blocked: str(d.blocked),
      nextOne: str(d.nextOne)
    };
  }

  /* ============================================================
   * 项目 CRUD
   * ============================================================ */
  function getProjects() { return state.projects.slice(); }

  function getProject(id) {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === id) return state.projects[i];
    }
    return null;
  }

  function getCurrentProjectId() {
    var id = state.settings.currentProjectId;
    if (id && getProject(id)) return id;
    return state.projects.length ? state.projects[0].id : null;
  }

  function getCurrentProject() { return getProject(getCurrentProjectId()); }

  function setCurrentProject(id) {
    if (id && !getProject(id)) return;
    state.settings.currentProjectId = id || null;
    persist();
  }

  function addProject(data) {
    var p = normalizeProject(data);
    p.health = 'green';
    state.projects.push(p);
    if (!state.settings.currentProjectId) state.settings.currentProjectId = p.id;
    persist();
    return p;
  }

  function updateProject(id, patch) {
    var p = getProject(id);
    if (!p) return null;
    var merged = Object.assign({}, p, patch || {});
    var n = normalizeProject(merged);
    Object.keys(p).forEach(function (k) { delete p[k]; });
    Object.assign(p, n);
    // 项目起止日变化后，健康度重算占位（渲染时实时计算）
    persist();
    return p;
  }

  function deleteProject(id) {
    var before = state.projects.length;
    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    if (state.projects.length === before) return false;
    state.tasks = state.tasks.filter(function (t) { return t.projectId !== id; });
    state.requirements = state.requirements.filter(function (r) { return r.projectId !== id; });
    state.defects = state.defects.filter(function (d) { return d.projectId !== id; });
    state.reviews = state.reviews.filter(function (r) { return r.projectId !== id; });
    if (state.settings.currentProjectId === id) {
      state.settings.currentProjectId = state.projects.length ? state.projects[0].id : null;
    }
    persist();
    return true;
  }

  /* ============================================================
   * 任务 CRUD
   * ============================================================ */
  function tasksOf(projectId) {
    return state.tasks.filter(function (t) { return t.projectId === projectId; });
  }

  function getTasks(projectId) {
    return tasksOf(projectId === undefined ? getCurrentProjectId() : projectId);
  }

  function getTask(id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
    return null;
  }

  /**
   * 状态与进度联动（PRD F1：进度 100% 自动置已完成；同时允许手动回退）
   * 判定依据是「用户是否真的改了这个字段」，而不是「patch 里有没有这个字段」——
   * 表单每次都会把 status / progress 的原值一起提交。
   *  - 先落地用户给的进度；
   *  - 真改了状态：用户选择优先（改已完成且进度没动才补 100%）；
   *  - 状态没改但进度真变了：100% → 已完成；仍是已完成但进度被改小 → 补回 100；
   *  - 两者都没动：什么都不做（编辑标题等字面量不得改写状态/进度）。
   * @param {Object} target       归一化后的任务对象（原地修改）
   * @param {Object} patch        调用方原始入参
   * @param {string} baseStatus   改前状态（新增传 '未开始'）
   * @param {number} baseProgress 改前进度（新增传 0）
   */
  function applyStatusProgress(target, patch, baseStatus, baseProgress) {
    patch = patch || {};
    var base = (baseStatus === undefined || baseStatus === null || baseStatus === '')
      ? '未开始' : baseStatus;
    var baseP = (baseProgress === undefined || baseProgress === null)
      ? num(target.progress, 0) : num(baseProgress, 0);

    var hasStatus = patch.status !== undefined && patch.status !== null && patch.status !== '';
    var hasProgress = patch.progress !== undefined && patch.progress !== null && patch.progress !== '';

    // 关键：分别判断「状态是否真改了」「进度是否真改了」
    var statusChanged = hasStatus && patch.status !== base;
    var progressChanged = hasProgress && Math.round(num(patch.progress, baseP)) !== Math.round(baseP);

    if (hasProgress) {
      target.progress = clamp(Math.round(num(patch.progress, target.progress)), 0, 100);
    }

    // 1) 用户主动改了状态 → 用户选择优先
    if (statusChanged) {
      target.status = patch.status;
      if (patch.status === '已完成' && !progressChanged) target.progress = 100;
      return target;
    }

    // 2) 状态没改：只有「进度真的变了」才做一致性推导
    if (progressChanged) {
      if (target.progress >= 100) target.status = '已完成';
      else if (patch.status === '已完成') target.progress = 100;
    }
    // 3) 状态和进度都没动 → 什么都不做
    return target;
  }

  function addTask(data) {
    data = data || {};
    var t = normalizeTask(data);
    if (!t.projectId) t.projectId = getCurrentProjectId();
    if (!t.projectId) return null;
    // 状态与进度联动（新增时以默认「未开始 / 0%」为改前值）
    applyStatusProgress(t, data, '未开始', 0);
    if (t.status !== '阻塞') t.blockedReason = '';
    state.tasks.push(t);
    persist();
    return t;
  }

  function updateTask(id, patch) {
    patch = patch || {};
    var t = getTask(id);
    if (!t) return null;
    // 关键：merge 之前先记下改前值，merge 之后 t 上的字段已经是新值了
    var baseStatus = t.status;
    var baseProgress = t.progress;
    var merged = Object.assign({}, t, patch);
    var n = normalizeTask(merged);
    n.id = t.id;
    n.projectId = t.projectId;
    applyStatusProgress(n, patch, baseStatus, baseProgress);
    if (n.status !== '阻塞') n.blockedReason = '';
    Object.keys(t).forEach(function (k) { delete t[k]; });
    Object.assign(t, n);
    persist();
    return t;
  }

  function deleteTask(id) {
    var before = state.tasks.length;
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    if (state.tasks.length === before) return false;
    // 解除需求对该任务的关联
    state.requirements.forEach(function (r) {
      if (r.taskIds && r.taskIds.length) {
        r.taskIds = r.taskIds.filter(function (tid) { return tid !== id; });
      }
    });
    persist();
    return true;
  }

  function deleteTasks(ids) {
    var map = {};
    (ids || []).forEach(function (id) { map[id] = true; });
    var before = state.tasks.length;
    state.tasks = state.tasks.filter(function (t) { return !map[t.id]; });
    state.requirements.forEach(function (r) {
      if (r.taskIds && r.taskIds.length) {
        r.taskIds = r.taskIds.filter(function (tid) { return !map[tid]; });
      }
    });
    var removed = before - state.tasks.length;
    if (removed > 0) persist();
    return removed;
  }

  /* ============================================================
   * 需求 CRUD
   * ============================================================ */
  function reqsOf(projectId) {
    return state.requirements.filter(function (r) { return r.projectId === projectId; });
  }

  function getRequirements(projectId) {
    return reqsOf(projectId === undefined ? getCurrentProjectId() : projectId);
  }

  function getRequirement(id) {
    for (var i = 0; i < state.requirements.length; i++) {
      if (state.requirements[i].id === id) return state.requirements[i];
    }
    return null;
  }

  /** 需求编号：使用稳定序号 seq，一经生成不随增删/排序变化 */
  function reqCode(req) {
    var seq = req && req.seq ? req.seq : 0;
    return 'REQ-' + pad(seq || 0);
  }

  /** 缺陷编号：同上 */
  function defectCode(defect) {
    var seq = defect && defect.seq ? defect.seq : 0;
    return 'BUG-' + pad(seq || 0);
  }

  function addRequirement(data) {
    var r = normalizeRequirement(data);
    if (!r.projectId) r.projectId = getCurrentProjectId();
    if (!r.projectId) return null;
    if (!r.seq) {
      state.settings.seqReq = Math.max(0, Math.floor(num(state.settings.seqReq, 0))) + 1;
      r.seq = state.settings.seqReq;
    } else if (r.seq > num(state.settings.seqReq, 0)) {
      state.settings.seqReq = r.seq;
    }
    state.requirements.push(r);
    persist();
    return r;
  }

  function updateRequirement(id, patch) {
    var r = getRequirement(id);
    if (!r) return null;
    var merged = Object.assign({}, r, patch || {});
    var n = normalizeRequirement(merged);
    n.id = r.id;
    n.projectId = r.projectId;
    n.taskIds = Array.isArray(merged.taskIds) ? merged.taskIds.slice() : r.taskIds;
    Object.keys(r).forEach(function (k) { delete r[k]; });
    Object.assign(r, n);
    persist();
    return r;
  }

  function deleteRequirement(id) {
    var before = state.requirements.length;
    state.requirements = state.requirements.filter(function (r) { return r.id !== id; });
    if (state.requirements.length === before) return false;
    // 缺陷对该需求的关联置空
    state.defects.forEach(function (d) {
      if (d.relatedReqId === id) d.relatedReqId = '';
    });
    persist();
    return true;
  }

  function deleteRequirements(ids) {
    var map = {};
    (ids || []).forEach(function (id) { map[id] = true; });
    var before = state.requirements.length;
    state.requirements = state.requirements.filter(function (r) { return !map[r.id]; });
    state.defects.forEach(function (d) { if (map[d.relatedReqId]) d.relatedReqId = ''; });
    var removed = before - state.requirements.length;
    if (removed > 0) persist();
    return removed;
  }

  /* ============================================================
   * 缺陷 CRUD
   * ============================================================ */
  function defectsOf(projectId) {
    return state.defects.filter(function (d) { return d.projectId === projectId; });
  }

  function getDefects(projectId) {
    return defectsOf(projectId === undefined ? getCurrentProjectId() : projectId);
  }

  function getDefect(id) {
    for (var i = 0; i < state.defects.length; i++) if (state.defects[i].id === id) return state.defects[i];
    return null;
  }

  var CLOSED_DEFECT = ['已关闭', '不予处理'];

  function addDefect(data) {
    var d = normalizeDefect(data);
    if (!d.projectId) d.projectId = getCurrentProjectId();
    if (!d.projectId) return null;
    if (!d.createdAt) d.createdAt = Date.now();
    if (CLOSED_DEFECT.indexOf(d.status) >= 0 && !d.closedAt) d.closedAt = Date.now();
    if (!d.seq) {
      state.settings.seqDefect = Math.max(0, Math.floor(num(state.settings.seqDefect, 0))) + 1;
      d.seq = state.settings.seqDefect;
    } else if (d.seq > num(state.settings.seqDefect, 0)) {
      state.settings.seqDefect = d.seq;
    }
    state.defects.push(d);
    persist();
    return d;
  }

  function updateDefect(id, patch) {
    var d = getDefect(id);
    if (!d) return null;
    var merged = Object.assign({}, d, patch || {});
    var n = normalizeDefect(merged);
    n.id = d.id;
    n.projectId = d.projectId;
    if (CLOSED_DEFECT.indexOf(n.status) >= 0) {
      if (!n.closedAt) n.closedAt = Date.now();
    } else {
      n.closedAt = null; // 重新打开则清空关闭时间
    }
    Object.keys(d).forEach(function (k) { delete d[k]; });
    Object.assign(d, n);
    persist();
    return d;
  }

  function deleteDefect(id) {
    var before = state.defects.length;
    state.defects = state.defects.filter(function (d) { return d.id !== id; });
    if (state.defects.length === before) return false;
    persist();
    return true;
  }

  function deleteDefects(ids) {
    var map = {};
    (ids || []).forEach(function (id) { map[id] = true; });
    var before = state.defects.length;
    state.defects = state.defects.filter(function (d) { return !map[d.id]; });
    var removed = before - state.defects.length;
    if (removed > 0) persist();
    return removed;
  }

  /* ============================================================
   * 复盘 CRUD
   * ============================================================ */
  function reviewsOf(projectId) {
    return state.reviews.filter(function (r) { return r.projectId === projectId; })
      .sort(function (a, b) { return a.week < b.week ? 1 : (a.week > b.week ? -1 : 0); });
  }

  function getReviews(projectId) {
    return reviewsOf(projectId === undefined ? getCurrentProjectId() : projectId);
  }

  function getReview(id) {
    for (var i = 0; i < state.reviews.length; i++) if (state.reviews[i].id === id) return state.reviews[i];
    return null;
  }

  function findReviewByWeek(projectId, week) {
    for (var i = 0; i < state.reviews.length; i++) {
      if (state.reviews[i].projectId === projectId && state.reviews[i].week === week) return state.reviews[i];
    }
    return null;
  }

  function saveReview(data) {
    var pid = data.projectId || getCurrentProjectId();
    if (!pid) return null;
    var existing = data.id ? getReview(data.id) : findReviewByWeek(pid, data.week);
    if (existing) {
      existing.whatDone = str(data.whatDone);
      existing.blocked = str(data.blocked);
      existing.nextOne = str(data.nextOne);
      existing.savedAt = Date.now();
      existing.snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : existing.snapshot;
      if (data.week) existing.week = data.week;
      persist();
      return existing;
    }
    var r = normalizeReview({
      projectId: pid,
      week: data.week || weekKey(today()),
      savedAt: Date.now(),
      snapshot: data.snapshot || {},
      whatDone: data.whatDone,
      blocked: data.blocked,
      nextOne: data.nextOne
    });
    state.reviews.push(r);
    persist();
    return r;
  }

  function deleteReview(id) {
    var before = state.reviews.length;
    state.reviews = state.reviews.filter(function (r) { return r.id !== id; });
    if (state.reviews.length === before) return false;
    persist();
    return true;
  }

  /* ============================================================
   * 设置
   * ============================================================ */
  function getSettings() { return Object.assign({}, state.settings); }

  function updateSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch || {});
    persist();
    return getSettings();
  }

  /* ============================================================
   * 指标计算（唯一来源，视图层只读）
   * ============================================================ */

  /** 任务工时权重：为空按 1 计（PRD F1 规则） */
  function weightOf(t) {
    var h = num(t.estimateHours, 0);
    return h > 0 ? h : 1;
  }

  /** 某任务在 ref 时点按排期应完成的比例 */
  function scheduleFraction(t, ref) {
    var s = toDate(t.start), e = toDate(t.end);
    if (!s || !e) return 0;
    var total = diffDays(e, s);
    if (total <= 0) total = 1;
    var elapsed = diffDays(ref, s);
    if (elapsed <= 0) return 0;
    if (elapsed >= total) return 1;
    return elapsed / total;
  }

  function isFinished(t) { return t.status === '已完成' || t.status === '已取消'; }

  function isDelayedNow(t, ref) {
    if (!t.end) return false;
    if (isFinished(t)) return false;
    return diffDays(ref || today(), toDate(t.end)) > 0;
  }

  function delayDaysOf(t, ref) {
    if (!t.end) return 0;
    var d = diffDays(ref || today(), toDate(t.end));
    return d > 0 ? d : 0;
  }

  function milestoneStateOf(t, ref) {
    if (t.status === '已完成') return '已达成';
    if (isDelayedNow(t, ref)) return '已延期';
    if (!t.end) return '按期';
    if (diffDays(toDate(t.end), ref || today()) <= 7) return '风险';
    return '按期';
  }

  /** 计划进度：Σ(工时 × 按排期应完成比例) / Σ工时 */
  function planProgressAt(tasks, ref) {
    var numr = 0, den = 0;
    tasks.forEach(function (t) {
      if (t.status === '已取消') return;
      var w = weightOf(t);
      den += w;
      numr += w * scheduleFraction(t, ref);
    });
    return den ? (numr / den) * 100 : 0;
  }

  /** 实际进度：Σ(工时 × 进度%) / Σ工时 */
  function actualProgressOf(tasks) {
    var numr = 0, den = 0;
    tasks.forEach(function (t) {
      if (t.status === '已取消') return;
      var w = weightOf(t);
      den += w;
      numr += w * (num(t.progress) / 100);
    });
    return den ? (numr / den) * 100 : 0;
  }

  /** 历史时点的实际进度近似：已到期任务取当前进度，未到期任务记 0 */
  function actualProgressAt(tasks, ref) {
    var numr = 0, den = 0;
    tasks.forEach(function (t) {
      if (t.status === '已取消') return;
      var w = weightOf(t);
      den += w;
      var e = toDate(t.end);
      if (e && diffDays(ref, e) >= 0) numr += w * (num(t.progress) / 100);
    });
    return den ? (numr / den) * 100 : 0;
  }

  function healthOf(p, m) {
    if (!p) return 'gray';
    if (p.status === '已归档') return 'gray';
    var red = false, yellow = false;
    if (m.deviation < -15) red = true;
    else if (m.deviation < -5) yellow = true;
    if (m.delayRatio >= 0.25) red = true;
    else if (m.delayRatio >= 0.10) yellow = true;
    if (m.defectFatal > 0) red = true;
    if (m.defectSevere > 0) { if (!red) yellow = true; }
    if (p.status === '已延期') yellow = true;
    if (red) return 'red';
    if (yellow) return 'yellow';
    return 'green';
  }

  /** 趋势采样周：从项目开始（或最早任务开始）到本周，最多 12 个 */
  function trendWeeks(project, tasks) {
    var cur = weekStart(today());
    var startDate = project && project.start ? toDate(project.start) : null;
    if (!startDate) {
      var earliest = null;
      tasks.forEach(function (t) {
        var s = toDate(t.start);
        if (s && (!earliest || s < earliest)) earliest = s;
      });
      startDate = earliest;
    }
    if (!startDate) return [];
    var ws = weekStart(startDate);
    if (ws > cur) ws = cur;
    var list = [];
    var d = new Date(ws.getTime());
    var guard = 0;
    while (d <= cur && guard < 200) {
      list.push(new Date(d.getTime()));
      d = addDays(d, 7);
      guard++;
    }
    if (!list.length) list.push(cur);
    return list.slice(-12);
  }

  function maxHoursSeries(arr) {
    var mx = 0;
    arr.forEach(function (v) { if (v > mx) mx = v; });
    return mx || 1;
  }

  /** 周序列：用于 KPI sparkline 与趋势图 */
  function weeklySeries(project, tasks, reqs, defs) {
    var weeks = trendWeeks(project, tasks);
    var series = { weeks: [], plan: [], actual: [], delayed: [], coverage: [], stock: [] };
    var todayD = today();
    weeks.forEach(function (ws) {
      var we = addDays(ws, 6);
      var sample = we > todayD ? todayD : we;
      if (sample < ws) sample = ws;
      series.weeks.push((ws.getMonth() + 1) + '/' + ws.getDate());
      series.plan.push(planProgressAt(tasks, sample));
      series.actual.push(we >= weekStart(todayD) ? actualProgressOf(tasks) : actualProgressAt(tasks, sample));
      // 该周末仍处于延期的任务数
      var delayedCount = 0;
      tasks.forEach(function (t) {
        if (isFinished(t) || !t.end) return;
        if (diffDays(sample, toDate(t.end)) > 0) delayedCount++;
      });
      series.delayed.push(delayedCount);
      // 该周为止累计已通过需求 / 已打通覆盖
      var pool = 0, linked = 0;
      reqs.forEach(function (r) {
        if (['已通过', '开发中', '已上线', '已验收'].indexOf(r.status) < 0) return;
        pool++;
        if (r.taskIds && r.taskIds.length) linked++;
      });
      series.coverage.push(pool ? (linked / pool) * 100 : 0);
      // 缺陷存量（创建于该周之前且未关闭）
      var stock = 0;
      defs.forEach(function (d) {
        var created = toDate(new Date(d.createdAt));
        var closed = d.closedAt ? toDate(new Date(d.closedAt)) : null;
        if (created && diffDays(sample, created) >= 0 && (!closed || diffDays(closed, sample) > 0)) stock++;
      });
      series.stock.push(stock);
    });
    return series;
  }

  /* ---------------- 主指标聚合 ---------------- */
  function metrics(projectId) {
    var pid = projectId === undefined ? getCurrentProjectId() : projectId;
    var p = getProject(pid);
    var ref = today();
    var tasks = pid ? tasksOf(pid) : [];
    var reqs = pid ? reqsOf(pid) : [];
    var defs = pid ? defectsOf(pid) : [];

    var m = {
      projectId: pid,
      project: p,
      ref: ref,
      hasTasks: tasks.length > 0
    };

    var active = tasks.filter(function (t) { return t.status !== '已取消'; });
    var done = tasks.filter(function (t) { return t.status === '已完成'; });
    var doing = tasks.filter(function (t) { return t.status === '进行中'; });
    var blocked = tasks.filter(function (t) { return t.status === '阻塞'; });
    var notStarted = tasks.filter(function (t) { return t.status === '未开始'; });
    var canceled = tasks.filter(function (t) { return t.status === '已取消'; });
    var delayedTasks = [];

    tasks.forEach(function (t) {
      if (isDelayedNow(t, ref)) delayedTasks.push({ task: t, delayDays: delayDaysOf(t, ref) });
    });
    delayedTasks.sort(function (a, b) {
      if (b.delayDays !== a.delayDays) return b.delayDays - a.delayDays;
      return a.task.title < b.task.title ? -1 : 1;
    });

    m.total = tasks.length;
    m.done = done.length;
    m.doing = doing.length;
    m.blocked = blocked.length;
    m.notStarted = notStarted.length;
    m.canceled = canceled.length;
    m.delayed = delayedTasks.length;
    m.delayRatio = active.length ? m.delayed / active.length : 0;
    m.delayedTasks = delayedTasks;

    m.totalHours = sum(active.map(function (t) { return num(t.estimateHours, 0); }));
    m.doneHours = sum(done.map(function (t) { return num(t.estimateHours, 0); }));

    m.planProgress = active.length ? planProgressAt(active, ref) : 0;
    m.actualProgress = active.length ? actualProgressOf(active) : 0;
    m.deviation = m.actualProgress - m.planProgress;

    // 优先级分布
    m.priorityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    m.priorityHours = { P0: 0, P1: 0, P2: 0, P3: 0 };
    tasks.forEach(function (t) {
      if (t.status === '已取消') return;
      m.priorityCounts[t.priority] = (m.priorityCounts[t.priority] || 0) + 1;
      m.priorityHours[t.priority] = (m.priorityHours[t.priority] || 0) + num(t.estimateHours, 0);
    });

    // 阶段列表（按最早开始日排序）
    var stageMap = {};
    tasks.forEach(function (t) {
      var key = t.stage || '未分阶段';
      if (!stageMap[key]) stageMap[key] = { name: key, first: toDate(t.start), count: 0, hours: 0 };
      stageMap[key].count++;
      stageMap[key].hours += num(t.estimateHours, 0);
      var s = toDate(t.start);
      if (s && (!stageMap[key].first || s < stageMap[key].first)) stageMap[key].first = s;
    });
    m.stages = Object.keys(stageMap).map(function (k) { return stageMap[k]; })
      .sort(function (a, b) {
        var av = a.first ? a.first.getTime() : Infinity;
        var bv = b.first ? b.first.getTime() : Infinity;
        return av - bv;
      });

    // 趋势
    var series = weeklySeries(p, tasks, reqs, defs);
    m.series = series;
    m.trend = {
      weeks: series.weeks,
      plan: series.plan,
      actual: series.actual,
      hasData: tasks.length > 0 && series.weeks.length > 1
    };

    // 需求指标
    var approvedPool = reqs.filter(function (r) {
      return ['已通过', '开发中', '已上线', '已验收'].indexOf(r.status) >= 0;
    });
    var linkedApproved = approvedPool.filter(function (r) { return r.taskIds && r.taskIds.length > 0; });
    m.reqTotal = reqs.length;
    m.reqApproved = approvedPool.length;
    m.reqLinked = linkedApproved.length;
    m.coverage = approvedPool.length ? (linkedApproved.length / approvedPool.length) * 100 : 0;
    m.reqLive = reqs.filter(function (r) { return r.status === '已上线' || r.status === '已验收'; }).length;

    // 缺陷指标
    var week = weekRange(ref);
    var openDefects = defs.filter(function (d) { return CLOSED_DEFECT.indexOf(d.status) < 0; });
    m.defectTotal = defs.length;
    m.defectStock = openDefects.length;
    m.defectFatal = openDefects.filter(function (d) { return d.severity === '致命'; }).length;
    m.defectSevere = openDefects.filter(function (d) { return d.severity === '严重'; }).length;
    m.defectNewWeek = defs.filter(function (d) {
      var c = new Date(d.createdAt);
      return !isNaN(c.getTime()) && diffDays(c, week.start) >= 0 && diffDays(week.end, c) >= 0;
    }).length;
    m.defectClosedWeek = defs.filter(function (d) {
      if (!d.closedAt) return false;
      var c = new Date(d.closedAt);
      return !isNaN(c.getTime()) && diffDays(c, week.start) >= 0 && diffDays(week.end, c) >= 0;
    }).length;
    m.defectDensity = done.length ? (defs.length / done.length) : 0;

    // 风险日历（当月）
    var y = ref.getFullYear(), mo = ref.getMonth();
    var first = new Date(y, mo, 1);
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var lead = (first.getDay() + 6) % 7; // 周一为首列
    var cells = [];
    for (var i = 0; i < lead; i++) cells.push({ blank: true });
    for (var dnum = 1; dnum <= daysInMonth; dnum++) {
      var day = new Date(y, mo, dnum);
      var items = [];
      delayedTasks.forEach(function (dt) {
        if (diffDays(toDate(dt.task.end), day) === 0) {
          items.push({ type: 'task', text: '任务延期：' + dt.task.title });
        }
      });
      defs.forEach(function (df) {
        if (['致命', '严重'].indexOf(df.severity) < 0) return;
        if (CLOSED_DEFECT.indexOf(df.status) >= 0) return;
        var c = new Date(df.createdAt);
        if (!isNaN(c.getTime()) && diffDays(c, day) === 0) {
          items.push({ type: 'defect', text: df.severity + '缺陷：' + df.title });
        }
      });
      tasks.forEach(function (t) {
        if (!t.milestone) return;
        if (t.status === '已完成') return;
        if (t.end && diffDays(toDate(t.end), day) === 0 && isDelayedNow(t, ref)) {
          items.push({ type: 'milestone', text: '里程碑延期：' + t.title });
        }
      });
      cells.push({
        day: dnum,
        date: ymd(day),
        isToday: diffDays(day, ref) === 0,
        risk: items.length,
        items: items
      });
    }
    m.calendar = { year: y, month: mo + 1, label: y + ' 年 ' + (mo + 1) + ' 月', cells: cells };

    // 复盘状态
    var reviews = reviewsOf(pid);
    var curWeek = weekKey(ref);
    var thisWeek = null;
    for (var ri = 0; ri < reviews.length; ri++) {
      if (reviews[ri].week === curWeek) { thisWeek = reviews[ri]; break; }
    }
    var weekKeys = {};
    reviews.forEach(function (r) { weekKeys[r.week] = true; });
    var streak = 0;
    var probe = curWeek;
    if (!weekKeys[probe]) probe = weekKey(addDays(weekStart(ref), -7)); // 本周未写不打断连续
    while (weekKeys[probe] && streak < 520) {
      streak++;
      var pr = weekRangeOf(probe);
      if (!pr) break;
      probe = weekKey(addDays(pr.start, -7));
    }
    m.reviewStatus = {
      thisWeekKey: curWeek,
      doneThisWeek: !!thisWeek,
      review: thisWeek,
      count: reviews.length,
      lastSavedAt: reviews.length ? reviews[0].savedAt : null,
      lastDays: reviews.length ? diffDays(ref, new Date(reviews[0].savedAt)) : null,
      streak: streak
    };

    // 需求变更次数：与「上一次复盘快照」相比状态发生变化的需求条数
    // 无历史快照时为 0（没有可比基准，不编造数字）
    var lastSnap = reviews.length ? (reviews[0].snapshot || null) : null;
    var baseReqStatus = lastSnap && lastSnap.reqStatus ? lastSnap.reqStatus : null;
    m.reqChanged = 0;
    m.reqChangedBaseline = !!baseReqStatus;
    if (baseReqStatus) {
      reqs.forEach(function (r) {
        if (baseReqStatus[r.id] !== undefined && baseReqStatus[r.id] !== r.status) m.reqChanged++;
      });
    }

    // 健康度与上线倒计时
    m.health = healthOf(p, m);
    m.daysToLaunch = p && p.end ? diffDays(toDate(p.end), ref) : null;

    return m;
  }

  /* ============================================================
   * 复盘：自动汇总 + 快照
   * ============================================================ */
  function buildSnapshot(projectId) {
    var pid = projectId === undefined ? getCurrentProjectId() : projectId;
    var m = metrics(pid);
    var tasks = tasksOf(pid);
    var reqs = reqsOf(pid);
    var defs = defectsOf(pid);
    var snap = {
      savedAt: Date.now(),
      week: weekKey(today()),
      metrics: {
        total: m.total,
        done: m.done,
        doing: m.doing,
        blocked: m.blocked,
        delayedCount: m.delayed,
        planProgress: m.planProgress,
        actualProgress: m.actualProgress,
        deviation: m.deviation,
        coverage: m.coverage,
        stockCount: m.defectStock,
        fatalCount: m.defectFatal,
        health: m.health
      },
      taskProgress: {},
      taskStatus: {},
      delayedIds: [],
      reqStatus: {},
      defectIds: [],
      items: []
    };
    tasks.forEach(function (t) {
      snap.taskProgress[t.id] = num(t.progress, 0);
      snap.taskStatus[t.id] = t.status;
    });
    m.delayedTasks.forEach(function (dt) { snap.delayedIds.push(dt.task.id); });
    reqs.forEach(function (r) { snap.reqStatus[r.id] = r.status; });
    defs.forEach(function (d) { snap.defectIds.push(d.id); });
    return snap;
  }

  function previousReview(projectId, week) {
    var list = reviewsOf(projectId).filter(function (r) { return r.week < week; });
    return list.length ? list[0] : null;
  }

  function inWeekDate(dateStr, w) {
    var d = toDate(dateStr);
    if (!d || !w) return false;
    return diffDays(d, w.start) >= 0 && diffDays(w.end, d) >= 0;
  }

  function deltaText(cur, prev) {
    if (prev === null || prev === undefined) return null;
    var df = Math.round((cur - prev) * 10) / 10;
    if (df === 0) return '持平';
    return (df > 0 ? '+' : '') + df;
  }

  /** 带符号的数值差，用于环比主数值 */
  function signedDelta(cur, prev) {
    if (prev === null || prev === undefined) return null;
    var df = Math.round((cur - prev) * 10) / 10;
    return (df > 0 ? '+' : '') + df;
  }

  /**
   * 本周自动汇总（8 项，全部实时计算，不写死）
   * @param {string} projectId
   * @param {string} [weekKeyStr] 目标周，默认本周
   */
  function weeklySummary(projectId, weekKeyStr) {
    var pid = projectId === undefined ? getCurrentProjectId() : projectId;
    var key = weekKeyStr || weekKey(today());
    var w = weekRangeOf(key) || weekRange(today());
    var tasks = tasksOf(pid);
    var reqs = reqsOf(pid);
    var defs = defectsOf(pid);
    var m = metrics(pid);
    var prevRev = previousReview(pid, w.key);
    var base = prevRev && prevRev.snapshot ? prevRev.snapshot : null;
    var baseProgress = (base && base.taskProgress) || {};
    var baseStatus = (base && base.taskStatus) || {};
    var baseDelayed = (base && base.delayedIds) || [];
    var baseReq = (base && base.reqStatus) || {};
    var baseMetrics = (base && base.metrics) || null;

    // 1 本周完成
    var doneTasks = tasks.filter(function (t) { return t.status === '已完成' && inWeekDate(t.end, w); });
    var doneHours = sum(doneTasks.map(function (t) { return num(t.estimateHours, 0); }));

    // 2 本周推进（与上次复盘比较进度变化）
    var progressed = [];
    tasks.forEach(function (t) {
      if (t.status === '已完成' || t.status === '已取消') return;
      var from = num(baseProgress[t.id], 0);
      var to = num(t.progress, 0);
      if (to > from) progressed.push({ title: t.title, from: from, to: to });
    });
    progressed.sort(function (a, b) { return (b.to - b.from) - (a.to - a.from); });

    // 3 延期变化
    var delayedIds = tasks.filter(function (t) { return isDelayedNow(t, m.ref); }).map(function (t) { return t.id; });
    var newDelayed = delayedIds.filter(function (id) { return baseDelayed.indexOf(id) < 0; });
    var clearedDelayed = baseDelayed.filter(function (id) { return delayedIds.indexOf(id) < 0; });

    // 4 需求流动
    var reqApprovedNow = reqs.filter(function (r) { return ['已通过', '开发中', '已上线', '已验收'].indexOf(r.status) >= 0; });
    var reqNewApproved = reqApprovedNow.filter(function (r) {
      var before = baseReq[r.id];
      return !before || ['已通过', '开发中', '已上线', '已验收'].indexOf(before) < 0;
    });
    var reqNewLive = reqs.filter(function (r) {
      return (r.status === '已上线' || r.status === '已验收') && baseReq[r.id] !== r.status;
    });

    // 5 缺陷流水
    var dNew = defs.filter(function (d) { return inWeekDate(new Date(d.createdAt), w); }).length;
    var dClosed = defs.filter(function (d) {
      return d.closedAt && inWeekDate(new Date(d.closedAt), w);
    }).length;
    var dSevereOpen = defs.filter(function (d) {
      return ['致命', '严重'].indexOf(d.severity) >= 0 && CLOSED_DEFECT.indexOf(d.status) < 0;
    }).length;

    // 6 进度对比
    var devPrev = baseMetrics ? num(baseMetrics.deviation, 0) : null;

    // 7 里程碑
    var msTasks = tasks.filter(function (t) { return t.milestone; });
    var msDone = msTasks.filter(function (t) { return t.status === '已完成' && inWeekDate(t.end, w); }).length;
    var msRiskCount = msTasks.filter(function (t) {
      return ['已延期', '风险'].indexOf(milestoneStateOf(t, m.ref)) >= 0;
    }).length;

    // 8 环比
    function arrow(cur, prev) {
      if (prev === null || prev === undefined) return null;
      if (cur === prev) return 'flat';
      return cur > prev ? 'up' : 'down';
    }

    var items = [
      {
        key: 'done',
        label: '本周完成',
        main: doneTasks.length,
        unit: '个',
        sub: doneHours ? ('预计工时合计 ' + (Math.round(doneHours * 10) / 10) + ' h') :
          (doneTasks.length ? '未填预计工时' : '本周暂无完成的任务'),
        list: doneTasks.map(function (t) { return t.title; })
      },
      {
        key: 'progress',
        label: '本周推进',
        main: progressed.length,
        unit: '个',
        sub: progressed.length
          ? progressed.slice(0, 3).map(function (p) { return p.title + ' ' + p.from + '% → ' + p.to + '%'; }).join('；')
          : '进度没有变化',
        list: progressed.map(function (p) { return p.title + '：' + p.from + '% → ' + p.to + '%'; })
      },
      {
        key: 'delay',
        label: '延期变化',
        main: '+' + newDelayed.length,
        unit: '新增',
        sub: '解除 ' + clearedDelayed.length + ' 个 · 当前延期 ' + delayedIds.length + ' 个',
        neg: newDelayed.length > 0,
        list: newDelayed.map(function (id) {
          var t = getTask(id);
          return t ? '新增延期：' + t.title : '';
        }).filter(Boolean)
      },
      {
        key: 'req',
        label: '需求流动',
        main: '+' + reqNewApproved.length,
        unit: '新通过',
        sub: '新上线 ' + reqNewLive.length + ' 个 · 覆盖率 ' + (Math.round(m.coverage * 10) / 10) + '%',
        list: reqNewApproved.map(function (r) { return '新通过：' + r.title; })
      },
      {
        key: 'defect',
        label: '缺陷流水',
        main: '+' + dNew,
        unit: '新增',
        sub: '关闭 ' + dClosed + ' 个 · 现存致命/严重 ' + dSevereOpen + ' 个',
        neg: dSevereOpen > 0,
        list: defs.filter(function (d) { return inWeekDate(new Date(d.createdAt), w); })
          .map(function (d) { return d.severity + '：' + d.title; })
      },
      {
        key: 'deviation',
        label: '进度对比',
        main: (Math.round(m.actualProgress * 10) / 10) + '%',
        unit: '实际',
        sub: '计划 ' + (Math.round(m.planProgress * 10) / 10) + '% · 偏差 ' +
          (m.deviation >= 0 ? '+' : '') + (Math.round(m.deviation * 10) / 10) + ' pp',
        neg: m.deviation < 0,
        list: []
      },
      {
        key: 'milestone',
        label: '里程碑',
        main: msDone,
        unit: '达成',
        sub: '风险 ' + msRiskCount + ' 个 · 共 ' + msTasks.length + ' 个里程碑',
        neg: msRiskCount > 0,
        list: msTasks.map(function (t) { return t.title + '：' + milestoneStateOf(t, m.ref); })
      },
      {
        key: 'chain',
        label: '环比',
        main: baseMetrics ? signedDelta(m.delayed, num(baseMetrics.delayedCount, 0)) : '—',
        unit: '个延期',
        sub: base
          ? ('较 ' + (prevRev ? prevRev.week : '上次') + '：偏差 ' +
            signedDelta(m.deviation, devPrev) + ' pp · 缺陷存量 ' + m.defectStock + ' 个')
          : '首次复盘，暂无环比基准',
        arrows: {
          delayed: arrow(m.delayed, baseMetrics ? num(baseMetrics.delayedCount, 0) : null),
          deviation: arrow(m.deviation, devPrev),
          stock: arrow(m.defectStock, baseMetrics ? num(baseMetrics.stockCount, 0) : null)
        },
        extra: {
          delayed: baseMetrics ? num(baseMetrics.delayedCount, 0) : null,
          deviation: devPrev,
          stock: baseMetrics ? num(baseMetrics.stockCount, 0) : null
        }
      }
    ];

    return {
      week: w.key,
      range: { start: ymd(w.start), end: ymd(w.end) },
      startLabel: fmtCN(w.start),
      endLabel: fmtCN(w.end),
      prevWeek: prevRev ? prevRev.week : null,
      hasBaseline: !!base,
      items: items,
      raw: {
        done: doneTasks.length,
        progressed: progressed.length,
        newDelayed: newDelayed.length,
        clearedDelayed: clearedDelayed.length,
        delayed: delayedIds.length,
        reqApproved: reqNewApproved.length,
        reqLive: reqNewLive.length,
        defectNew: dNew,
        defectClosed: dClosed,
        defectSevere: dSevereOpen,
        actualProgress: m.actualProgress,
        planProgress: m.planProgress,
        deviation: m.deviation,
        msDone: msDone,
        msRisk: msRiskCount
      }
    };
  }

  /** 复盘导出为 Markdown */
  function reviewMarkdown(review) {
    if (!review) return '';
    var snap = review.snapshot || {};
    var mm = snap.metrics || {};
    var pid = review.projectId;
    var p = getProject(pid);
    var label = review.week;
    var range = weekRangeOf(review.week);
    if (range) label = review.week + '（' + fmtFull(range.start) + ' ~ ' + fmtFull(range.end) + '）';

    var lines = [];
    lines.push('# 周复盘 · ' + (p ? p.name : '未命名项目'));
    lines.push('');
    lines.push('- 周次：' + label);
    lines.push('- 保存时间：' + fmtDateTime(review.savedAt));
    lines.push('- 项目：' + (p ? (p.name + (p.code ? '（' + p.code + '）' : '')) : '—'));
    lines.push('');
    lines.push('## 一、数据摘要');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('| --- | --- |');
    lines.push('| 任务总数 | ' + (mm.total || 0) + ' |');
    lines.push('| 已完成 | ' + (mm.done || 0) + ' |');
    lines.push('| 进行中 | ' + (mm.doing || 0) + ' |');
    lines.push('| 阻塞 | ' + (mm.blocked || 0) + ' |');
    lines.push('| 延期 | ' + (mm.delayedCount || 0) + ' |');
    lines.push('| 计划进度 | ' + (Math.round((mm.planProgress || 0) * 10) / 10) + '% |');
    lines.push('| 实际进度 | ' + (Math.round((mm.actualProgress || 0) * 10) / 10) + '% |');
    lines.push('| 进度偏差 | ' + (Math.round((mm.deviation || 0) * 10) / 10) + ' pp |');
    lines.push('| 需求覆盖率 | ' + (Math.round((mm.coverage || 0) * 10) / 10) + '% |');
    lines.push('| 缺陷存量 | ' + (mm.stockCount || 0) + ' |');
    lines.push('');
    if (Array.isArray(snap.items) && snap.items.length) {
      lines.push('### 自动汇总要点');
      lines.push('');
      snap.items.forEach(function (it) {
        lines.push('- ' + it.label + '：' + it.main + (it.unit ? ' ' + it.unit : '') + (it.sub ? '（' + it.sub + '）' : ''));
      });
      lines.push('');
    }
    lines.push('## 二、手写反思');
    lines.push('');
    lines.push('### 本周做成了什么');
    lines.push('');
    lines.push(review.whatDone || '（未填写）');
    lines.push('');
    lines.push('### 卡在哪、为什么');
    lines.push('');
    lines.push(review.blocked || '（未填写）');
    lines.push('');
    lines.push('### 下周最重要的一件事');
    lines.push('');
    lines.push(review.nextOne || '（未填写）');
    lines.push('');
    return lines.join('\n');
  }

  /* ============================================================
   * 数据备份（导出 / 导入 JSON）
   * ============================================================ */
  var BACKUP_FORMAT = 'projsys.backup';
  var BACKUP_VERSION = 1;
  var BACKUP_LISTS = ['projects', 'tasks', 'requirements', 'defects', 'reviews'];

  /** 生成备份对象：完整 state 的深拷贝，附格式标识与导出时间 */
  function exportData() {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      app: '项目管理系统',
      exportedAt: Date.now(),
      data: JSON.parse(JSON.stringify({
        projects: state.projects,
        tasks: state.tasks,
        requirements: state.requirements,
        defects: state.defects,
        reviews: state.reviews,
        settings: state.settings,
        savedAt: state.savedAt
      }))
    };
  }

  /**
   * 解析并规范化备份内容，**不触碰 state**。
   * 兼容两种输入：带 format 包裹的完整备份文件、直接是数据主体的裸对象。
   */
  function parseBackup(raw) {
    var obj = raw;
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch (e) { return { ok: false, error: '文件不是合法的 JSON，无法解析' }; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: '文件内容为空或不是对象结构' };
    }
    if (obj.format && obj.format !== BACKUP_FORMAT) {
      return { ok: false, error: '不是本系统导出的备份文件（格式标识不匹配）' };
    }

    var d = (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) ? obj.data : obj;
    var hasList = false;
    for (var i = 0; i < BACKUP_LISTS.length; i++) {
      if (Array.isArray(d[BACKUP_LISTS[i]])) hasList = true;
    }
    if (!hasList) return { ok: false, error: '文件里没有找到项目 / 任务 / 需求 / 缺陷数据' };

    var payload = {
      projects: Array.isArray(d.projects) ? d.projects.map(normalizeProject) : [],
      tasks: Array.isArray(d.tasks) ? d.tasks.map(normalizeTask) : [],
      requirements: Array.isArray(d.requirements) ? d.requirements.map(normalizeRequirement) : [],
      defects: Array.isArray(d.defects) ? d.defects.map(normalizeDefect) : [],
      reviews: Array.isArray(d.reviews) ? d.reviews.map(normalizeReview) : [],
      settings: Object.assign({}, defaultSettings(), d.settings || {}),
      savedAt: num(d.savedAt, 0) || Date.now()
    };

    // 与 load() 同规则：清孤儿数据（父项目不存在的子对象一律丢弃）
    var ids = {};
    payload.projects.forEach(function (p) { ids[p.id] = true; });
    var before = payload.tasks.length + payload.requirements.length + payload.defects.length + payload.reviews.length;
    payload.tasks = payload.tasks.filter(function (t) { return ids[t.projectId]; });
    payload.requirements = payload.requirements.filter(function (r) { return ids[r.projectId]; });
    payload.defects = payload.defects.filter(function (x) { return ids[x.projectId]; });
    payload.reviews = payload.reviews.filter(function (rv) { return ids[rv.projectId]; });
    var after = payload.tasks.length + payload.requirements.length + payload.defects.length + payload.reviews.length;

    return { ok: true, payload: payload, dropped: before - after };
  }

  /**
   * 导入备份。dryRun=true 时只校验并返回统计，不修改任何数据。
   * 返回 { ok:true, counts, dropped } 或 { ok:false, error }。
   */
  function importData(raw, dryRun) {
    var parsed = parseBackup(raw);
    if (!parsed.ok) return parsed;

    var pl = parsed.payload;
    var counts = {
      projects: pl.projects.length,
      tasks: pl.tasks.length,
      requirements: pl.requirements.length,
      defects: pl.defects.length,
      reviews: pl.reviews.length
    };
    if (dryRun) return { ok: true, counts: counts, dropped: parsed.dropped };

    state.projects = pl.projects;
    state.tasks = pl.tasks;
    state.requirements = pl.requirements;
    state.defects = pl.defects;
    state.reviews = pl.reviews;
    state.settings = Object.assign({}, defaultSettings(), pl.settings);
    state.savedAt = pl.savedAt;

    // 当前项目兜底：导入后顶栏不能指向一个不存在的项目
    if (!getProject(state.settings.currentProjectId)) {
      state.settings.currentProjectId = state.projects.length ? state.projects[0].id : null;
    }
    backfillSeq();
    persist();
    return { ok: true, counts: counts, dropped: parsed.dropped };
  }

  /** 设置默认值（reset / load / import 三处共用，避免漂移） */
  function defaultSettings() {
    return {
      currentProjectId: null,
      reviewDay: 5,
      reviewTime: '18:00',
      seqReq: 0,
      seqDefect: 0,
      theme: 'ember',
      motion: 'on'
    };
  }

  /* ============================================================
   * 重置
   * ============================================================ */
  function reset() {
    state.projects = [];
    state.tasks = [];
    state.requirements = [];
    state.defects = [];
    state.reviews = [];
    state.settings = defaultSettings();
    state.savedAt = null;
    var bridge = fileBridge();
    if (bridge && typeof bridge.clear === 'function') {
      try { bridge.clear(); } catch (e) { /* ignore */ }
    } else {
      try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
    persist();
  }

  /** 状态条「刷新」：重新落盘一次（刷新数据更新时间），指标由视图重算 */
  function refresh() {
    persist();
    return state;
  }

  /* ---------------- 启动即恢复 ---------------- */
  load();

  /* ---------------- 导出 ---------------- */
  global.Store = {
    CONST: CONST,
    util: {
      toDate: toDate,
      ymd: ymd,
      today: today,
      addDays: addDays,
      diffDays: diffDays,
      weekStart: weekStart,
      weekKey: weekKey,
      weekRange: weekRange,
      weekRangeOf: weekRangeOf,
      fmtCN: fmtCN,
      fmtFull: fmtFull,
      fmtDateTime: fmtDateTime,
      fmtDateTimeSec: fmtDateTimeSec,
      pad: pad,
      num: num,
      uid: uid,
      clamp: clamp
    },
    // 状态读取
    getState: function () { return state; },
    getSavedAt: function () { return state.savedAt; },
    // 项目
    getProjects: getProjects,
    getProject: getProject,
    getCurrentProjectId: getCurrentProjectId,
    getCurrentProject: getCurrentProject,
    setCurrentProject: setCurrentProject,
    addProject: addProject,
    updateProject: updateProject,
    deleteProject: deleteProject,
    // 任务
    getTasks: getTasks,
    getTask: getTask,
    addTask: addTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    deleteTasks: deleteTasks,
    // 需求
    getRequirements: getRequirements,
    getRequirement: getRequirement,
    reqCode: reqCode,
    defectCode: defectCode,
    addRequirement: addRequirement,
    updateRequirement: updateRequirement,
    deleteRequirement: deleteRequirement,
    deleteRequirements: deleteRequirements,
    // 缺陷
    getDefects: getDefects,
    getDefect: getDefect,
    addDefect: addDefect,
    updateDefect: updateDefect,
    deleteDefect: deleteDefect,
    deleteDefects: deleteDefects,
    // 复盘
    getReviews: getReviews,
    getReview: getReview,
    saveReview: saveReview,
    deleteReview: deleteReview,
    findReviewByWeek: findReviewByWeek,
    buildSnapshot: buildSnapshot,
    weeklySummary: weeklySummary,
    reviewMarkdown: reviewMarkdown,
    // 设置
    getSettings: getSettings,
    updateSettings: updateSettings,
    // 指标
    metrics: metrics,
    isDelayedNow: isDelayedNow,
    delayDaysOf: delayDaysOf,
    milestoneStateOf: milestoneStateOf,
    refresh: refresh,
    reset: reset,
    // 数据备份
    exportData: exportData,
    importData: importData
  };
})(window);
