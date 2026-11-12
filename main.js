const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json'
};

// Tiny local-only server (127.0.0.1) so ES modules and web workers behave exactly like on the web.
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

let win;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(async () => {
    const port = await startServer();
    Menu.setApplicationMenu(null);
    const dark = nativeTheme.shouldUseDarkColors;
    win = new BrowserWindow({
      width: 1320, height: 880, minWidth: 560, minHeight: 600,
      title: 'WebyPDF', backgroundColor: dark ? '#0e0828' : '#f1ebff', show: false,
      icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
      // modern Windows look: our own title bar + native min / max / close buttons overlaid on it
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: dark ? '#0e0828' : '#f1ebff', symbolColor: dark ? '#ffffff' : '#261a4d', height: 40 },
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    });
    win.once('ready-to-show', () => win.show());
    ipcMain.on('theme', (_e, t) => {
      const d = t !== 'light';
      try { win.setTitleBarOverlay({ color: d ? '#0e0828' : '#f1ebff', symbolColor: d ? '#ffffff' : '#261a4d', height: 40 }); } catch (e) { /* not supported */ }
    });
    win.loadURL(`http://127.0.0.1:${port}/index.html`);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url);
      return { action: 'deny' };
    });
    // Block any navigation away from the app (keeps it offline and private).
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
    });
    // Downloads: native Save dialog (default), then an in-app toast with a "Show in folder" action.
    const saved = new Set();
    ipcMain.on('reveal', (_e, p) => { if (saved.has(p)) shell.showItemInFolder(p); });
    win.webContents.session.on('will-download', (_e, item) => {
      item.once('done', (_ev, state) => {
        if (state === 'completed') {
          const p = item.getSavePath();
          saved.add(p);
          if (win) win.webContents.send('saved', p);
        }
      });
    });
    win.on('closed', () => { win = null; });
  });
  app.on('window-all-closed', () => app.quit());
}
