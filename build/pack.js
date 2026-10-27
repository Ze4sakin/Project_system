/* ============================================================
 * pack.js · 一条命令完成打包 + 投放
 * 用 Node API 而非命令行，避免 Windows 反斜杠在 shell 与正则间反复转义
 * ============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');
const packager = require('electron-packager');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');
const TARGET = path.join(ROOT, '..', 'output');
const APP_NAME = 'ProjectSystem';

// 需要排除的构建中间物：构建产物、自检残留、锁文件、开发依赖残留
const IGNORE = [
  /[\\/]dist([\\/]|$)/,
  /[\\/]data([\\/]|$)/,
  /[\\/]self-test-report\.json$/,
  /[\\/]package-lock\.json$/,
  /[\\/]pack\.js$/,
  /[\\/]\.cache([\\/]|$)/,
  /\.package-lock\.json$/
];

(async function () {
  console.log('[1/3] 开始打包 ->', OUT_DIR);
  const built = await packager({
    dir: ROOT,
    name: APP_NAME,
    platform: 'win32',
    arch: 'x64',
    out: OUT_DIR,
    overwrite: true,
    asar: true,
    prune: true,
    appVersion: '1.0.0',
    executableName: APP_NAME,
    ignore: IGNORE,
    win32metadata: {
      CompanyName: 'Project System',
      FileDescription: '项目管理系统',
      ProductName: '项目管理系统',
      InternalName: APP_NAME,
      OriginalFilename: APP_NAME + '.exe'
    }
  });

  const src = built[0];
  console.log('[2/3] 打包完成 ->', src);

  // 覆盖式投放：把产物平铺到 output 根，使 exe 与 data 目录同级
  // 不在此处删除旧文件（避免误删用户已产生的 data 数据）
  if (!fs.existsSync(TARGET)) fs.mkdirSync(TARGET, { recursive: true });

  fs.cpSync(src, TARGET, { recursive: true, force: true });
  console.log('[3/3] 已投放至 ->', TARGET);

  // 交付校验：exe 必须存在于 output 根
  const exe = path.join(TARGET, APP_NAME + '.exe');
  const ok = fs.existsSync(exe);
  console.log('exe 存在:', ok, fs.existsSync(exe) ? (fs.statSync(exe).size / 1024 / 1024).toFixed(1) + ' MB' : '');
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error('打包失败:', e);
  process.exit(1);
});
