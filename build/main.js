/* ============================================================
 * main.js · Electron 主进程（便携版宿主）
 * 职责：
 *   1. 以 exe 所在目录为根，创建 data/projsys-config.json
 *   2. 首次启动生成默认配置；已存在则原样读取，绝不覆盖
 *   3. 配置损坏时备份为 .broken-<时间戳>.json 并重建（按需覆盖）
 *   4. 通过同步 IPC 把读写能力白名单式暴露给渲染进程
 *   5. 渲染进程无 Node 权限（contextIsolation + 无 nodeIntegration）
 * ============================================================ */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron');
const fs = require('fs');
const path = require('path');

/* ---------------- 路径解析：永远锚定 exe 真实所在目录 ---------------- */
// 打包态：process.execPath 指向真实的 ProjectSystem.exe，取其所在目录
// 开发态：指向工程根（build/），便于本地自检不污染 Electron 安装目录
function resolveExeDir() {
  try {
    if (app.isPackaged) return path.dirname(process.execPath);
    return app.getAppPath(); // 开发态即 build/（含 package.json 的目录）
  } catch (e) {
    return path.dirname(process.execPath);
  }
}
const EXE_DIR = resolveExeDir();
let DATA_DIR = path.join(EXE_DIR, 'data');
let CONFIG_PATH = path.join(DATA_DIR, 'projsys-config.json');
let storageMode = 'portable'; // portable | fallback

const CONFIG_FORMAT = 'projsys.config';
const CONFIG_VERSION = 1;
const CONFIG_FILENAME = 'projsys-config.json';

/* ---------------- 默认配置骨架（首次启动写入磁盘的内容） ---------------- */
function defaultConfig() {
  return {
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    appName: '项目管理系统',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    window: {
      width: 1600,
      height: 900,
      maximized: false
    },
    data: {
      projects: [],
      tasks: [],
      requirements: [],
      defects: [],
      reviews: [],
      settings: {
        currentProjectId: null,
        reviewDay: 5,
        reviewTime: '18:00',
        seqReq: 0,
        seqDefect: 0
      },
      savedAt: null
    }
  };
}

/* ---------------- 工具 ---------------- */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 探测目录是否可写（方案 A 的前提：exe 同级需可写） */
function isWritable(dir) {
  try {
    ensureDir(dir);
    const probe = path.join(dir, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

/** 原子写：先写临时文件再 rename，避免写入中断产生半截 JSON */
function writeJsonAtomic(filePath, obj) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function backupConfig(reason) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = path.join(DATA_DIR, CONFIG_FILENAME.replace(/\.json$/, '') + '.broken-' + stamp + '.json');
    fs.copyFileSync(CONFIG_PATH, bak);
    console.warn('[config] 已备份异常配置 ->', bak, '(', reason, ')');
    return bak;
  } catch (e) {
    console.error('[config] 备份失败', e);
    return null;
  }
}

/* ---------------- 内存中的配置对象（唯一真源） ---------------- */
let cfg = null;

function structurallyValid(obj) {
  return obj && typeof obj === 'object'
    && obj.format === CONFIG_FORMAT
    && typeof obj.version === 'number'
    && obj.data && typeof obj.data === 'object'
    && ['projects', 'tasks', 'requirements', 'defects', 'reviews'].every(function (k) {
      return Array.isArray(obj.data[k]);
    });
}

/**
 * 确保配置文件存在且可用。
 * 返回状态：created（本次新建）/ loaded（已存在，直接使用）/ recovered（损坏后重建）
 */
function ensureConfig() {
  let status;

  if (!fs.existsSync(CONFIG_PATH)) {
    cfg = defaultConfig();
    writeJsonAtomic(CONFIG_PATH, cfg);
    status = 'created';
    console.log('[config] 首次启动，已生成默认配置:', CONFIG_PATH);
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      parsed = null;
    }

    if (structurallyValid(parsed)) {
      // 已存在且合法：原样使用，不覆盖用户任何数据
      cfg = parsed;
      status = 'loaded';
      console.log('[config] 已存在，直接加载:', CONFIG_PATH);
    } else {
      // 损坏或格式不符：先备份再重建，属于「按需覆盖」
      backupConfig('结构校验未通过');
      cfg = defaultConfig();
      writeJsonAtomic(CONFIG_PATH, cfg);
      status = 'recovered';
      console.warn('[config] 配置损坏，已备份并重建');
    }
  }

  // 补齐可能缺失的字段（跨版本升级容错），但不动已有内容
  if (!cfg.window || typeof cfg.window !== 'object') cfg.window = defaultConfig().window;
  if (typeof cfg.createdAt !== 'string') cfg.createdAt = new Date().toISOString();
  if (!cfg.data.settings || typeof cfg.data.settings !== 'object') {
    cfg.data.settings = defaultConfig().data.settings;
  }

  return status;
}

/* ---------------- IPC：渲染进程唯一的数据通道 ---------------- */
function registerIpc() {
  // 读：返回 data 段序列化字符串，无数据时返回空串
  ipcMain.on('config:read', function (event) {
    try {
      event.returnValue = cfg ? JSON.stringify(cfg.data) : '';
    } catch (e) {
      event.returnValue = '';
    }
  });

  // 写：校验后原子落盘
  ipcMain.on('config:write', function (event, jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') throw new Error('payload 非对象');
      cfg.data = {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
        defects: Array.isArray(parsed.defects) ? parsed.defects : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
        settings: parsed.settings && typeof parsed.settings === 'object'
          ? parsed.settings : defaultConfig().data.settings,
        savedAt: parsed.savedAt || Date.now()
      };
      cfg.updatedAt = new Date().toISOString();
      writeJsonAtomic(CONFIG_PATH, cfg);
      event.returnValue = { ok: true };
    } catch (e) {
      console.error('[config] 写入失败', e);
      event.returnValue = { ok: false, error: String(e && e.message || e) };
    }
  });

  // 清空：写回空骨架，但保留文件与 window 配置
  ipcMain.on('config:clear', function (event) {
    try {
      cfg.data = defaultConfig().data;
      cfg.updatedAt = new Date().toISOString();
      writeJsonAtomic(CONFIG_PATH, cfg);
      event.returnValue = { ok: true };
    } catch (e) {
      event.returnValue = { ok: false, error: String(e && e.message || e) };
    }
  });

  // 仅用于诊断展示
  ipcMain.on('config:path', function (event) {
    event.returnValue = { path: CONFIG_PATH, mode: storageMode, exists: fs.existsSync(CONFIG_PATH) };
  });
}

/* ---------------- 窗口 ---------------- */
let mainWindow = null;
let saveBoundsTimer = null;

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || !cfg) return;
  try {
    const maximized = mainWindow.isMaximized();
    cfg.window.maximized = maximized;
    if (!maximized) {
      const b = mainWindow.getBounds();
      cfg.window.width = b.width;
      cfg.window.height = b.height;
    }
    cfg.updatedAt = new Date().toISOString();
    writeJsonAtomic(CONFIG_PATH, cfg);
  } catch (e) { /* 忽略窗口状态写入异常，不影响数据 */ }
}

function createWindow() {
  const w = cfg && cfg.window ? cfg.window : defaultConfig().window;

  mainWindow = new BrowserWindow({
    width: w.width || 1600,
    height: w.height || 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#0B0A0C',
    title: '项目管理系统',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,        // preload 需要 ipcRenderer
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));

  mainWindow.once('ready-to-show', function () {
    if (cfg && cfg.window && cfg.window.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  // 窗口尺寸变化时防抖保存
  mainWindow.on('resize', function () {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveWindowState, 500);
  });
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', function () { mainWindow = null; });

  // 禁止外部链接占用应用窗口，交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (/^https?:/i.test(details.url)) {
      require('electron').shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });
}

/* ---------------- 导出（a[download]）走系统另存为对话框 ---------------- */
function setupDownloadDialog() {
  session.defaultSession.on('will-download', function (event, item) {
    try {
      const target = dialog.showSaveDialogSync(mainWindow || undefined, {
        title: '导出数据',
        defaultPath: path.join(app.getPath('documents'), item.getFilename()),
        filters: [{ name: 'JSON 文件', extensions: ['json'] }]
      });
      if (target) item.setSavePath(target);
      else item.cancel();
    } catch (e) {
      item.cancel();
    }
  });
}

function buildMenu() {
  // 保留编辑类快捷键（复制/粘贴等），去掉冗余的默认菜单
  const template = [
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- 自检模式（无需人工点界面即可验证存储链路） ---------------- */
function runSelfTest() {
  const report = { ok: false, steps: [], configPath: CONFIG_PATH, storageMode: storageMode };
  const push = function (name, pass, detail) {
    report.steps.push({ name: name, pass: !!pass, detail: detail || '' });
    if (!pass) report.ok = false;
  };

  try {
    report.ok = true;

    // 1. 首次生成
    const s1 = ensureConfig();
    push('首启生成/加载配置', fs.existsSync(CONFIG_PATH), 'ensureConfig -> ' + s1);

    // 2. 结构校验
    const onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    push('文件结构合法', structurallyValid(onDisk), 'format=' + onDisk.format + ', version=' + onDisk.version);
    push('默认字段齐全', !!onDisk.window && !!onDisk.data && Array.isArray(onDisk.data.projects) &&
      typeof onDisk.data.settings.reviewDay === 'number', 'window/data/settings 均已存在');
    push('初始数据为空', onDisk.data.projects.length === 0 && onDisk.data.tasks.length === 0,
      'projects=' + onDisk.data.projects.length + ', tasks=' + onDisk.data.tasks.length);

    // 3. 已存在不覆盖
    const before = fs.readFileSync(CONFIG_PATH, 'utf8');
    const s2 = ensureConfig();
    const after = fs.readFileSync(CONFIG_PATH, 'utf8');
    push('已存在不覆盖', s2 === 'loaded' && before === after, 'ensureConfig -> ' + s2);

    // 4. 写入-读回往返
    const probeState = {
      projects: [{ id: 'selftest-proj', name: '__selftest__', createdAt: '2026-01-01' }],
      tasks: [], requirements: [], defects: [], reviews: [],
      settings: { currentProjectId: 'selftest-proj', reviewDay: 5, reviewTime: '18:00', seqReq: 0, seqDefect: 0 },
      savedAt: Date.now()
    };
    let writeOk = false;
    try {
      const parsed = JSON.parse(JSON.stringify(probeState));
      cfg.data = parsed;
      cfg.updatedAt = new Date().toISOString();
      writeJsonAtomic(CONFIG_PATH, cfg);
      writeOk = true;
    } catch (e) { writeOk = false; }
    const back = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    push('写入并读回一致', writeOk && back.data.projects.length === 1 &&
      back.data.projects[0].name === '__selftest__', 'projects=' + back.data.projects.length);

    // 5. 损坏自愈：写入非法内容后应备份并重建
    fs.writeFileSync(CONFIG_PATH, '{ this is not json', 'utf8');
    const s3 = ensureConfig();
    const healed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const brokenFiles = fs.readdirSync(DATA_DIR).filter(function (f) { return f.indexOf('.broken-') >= 0; });
    push('损坏后备份并重建', s3 === 'recovered' && structurallyValid(healed) && brokenFiles.length >= 1,
      'ensureConfig -> ' + s3 + ', 备份数=' + brokenFiles.length);

    // 清理自检产生的备份文件与测试数据
    brokenFiles.forEach(function (f) {
      try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (e) {}
    });
  } catch (e) {
    report.ok = false;
    report.steps.push({ name: '自检异常', pass: false, detail: String(e && e.stack || e) });
  }

  const reportPath = path.join(EXE_DIR, 'self-test-report.json');
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8'); } catch (e) {}
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

/* ---------------- 启动 ---------------- */
const isSelfTest = process.argv.indexOf('--self-test') >= 0;

// 单实例锁：同一份数据文件不允许被两个进程同时写
const gotLock = isSelfTest ? true : app.requestSingleInstanceLock();

if (isSelfTest) {
  // 自检不需要 GPU/窗口
  app.disableHardwareAcceleration();
  app.whenReady().then(function () {
    if (!isWritable(DATA_DIR)) { storageMode = 'fallback'; }
    runSelfTest();
  });
} else if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(function () {
    // 方案 A：优先 exe 同级 data 目录；不可写时回退到用户数据目录，避免程序无法保存
    if (!isWritable(DATA_DIR)) {
      storageMode = 'fallback';
      DATA_DIR = path.join(app.getPath('userData'), 'data');
      CONFIG_PATH = path.join(DATA_DIR, CONFIG_FILENAME);
      ensureDir(DATA_DIR);
      console.warn('[config] exe 同级目录不可写，回退至:', CONFIG_PATH);
    }

    ensureConfig();
    registerIpc();
    buildMenu();
    setupDownloadDialog();
    createWindow();

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });
}
