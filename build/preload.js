/* ============================================================
 * preload.js · 安全桥接
 * 只向页面暴露 4 个白名单方法，不交出任何 Node 能力。
 * 页面上得到 window.ProjSysFS，store.js 检测到它就切换到文件存储。
 * ============================================================ */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ProjSysFS', {
  isDesktop: true,
  /** 读取 data 段（JSON 字符串）；无数据返回 '' */
  load: function () { return ipcRenderer.sendSync('config:read'); },
  /** 写入 data 段；返回 { ok, error? } */
  save: function (jsonStr) { return ipcRenderer.sendSync('config:write', jsonStr); },
  /** 清空业务数据（保留配置文件与窗口设置） */
  clear: function () { return ipcRenderer.sendSync('config:clear'); },
  /** 诊断：返回 { path, mode, exists } */
  info: function () { return ipcRenderer.sendSync('config:path'); }
});
