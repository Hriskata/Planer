const { app, BrowserWindow, Tray, Menu, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  // Change this if the Docker host isn't reachable at localhost from wherever this
  // widget runs (e.g. point it at the Cloudflare Tunnel address instead).
  serverUrl: 'http://localhost:3000/widget.html',
  bounds: { width: 320, height: 460, x: undefined, y: undefined },
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

let config = loadConfig();
let win;
let tray;

function createWindow() {
  win = new BrowserWindow({
    ...config.bounds,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true, // tray icon is the way to find/control it, not the taskbar
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadURL(config.serverUrl);

  // Debounced so dragging/resizing doesn't hammer disk writes on every pixel.
  let saveTimer;
  const persistBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      config.bounds = win.getBounds();
      saveConfig(config);
    }, 500);
  };
  win.on('move', persistBounds);
  win.on('resize', persistBounds);

  win.on('close', (e) => {
    // "Quit" from the tray menu is the only way out — closing the window (e.g. via
    // Alt+F4) just hides it, matching how a desktop widget is expected to behave
    // (always there unless you deliberately quit).
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icon.png'));
  tray.setToolTip('Планер Widget');

  const rebuildMenu = () => {
    const loginSettings = app.getLoginItemSettings();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Покажи', click: () => win.show() },
        { label: 'Скрий', click: () => win.hide() },
        { label: 'Презареди', click: () => win.reload() },
        { type: 'separator' },
        {
          label: 'Стартирай с Windows',
          type: 'checkbox',
          checked: loginSettings.openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked });
          },
        },
        {
          label: 'Отвори конфигурацията',
          click: () => shell.showItemInFolder(CONFIG_PATH),
        },
        { type: 'separator' },
        {
          label: 'Изход',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ])
    );
  };

  rebuildMenu();
  tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
}

// The widget's own × button (both on the login screen and once logged in) — unlike
// clicking the (invisible, since frame:false) native close control, this is meant to
// actually exit the app, not just hide it. Only the tray's "Изход" used to do that;
// now this does too, via the preload bridge (renderer can't reach `app` directly with
// contextIsolation on).
ipcMain.on('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

// The widget's own minimize (—) button — same reasoning: frame:false means no native
// one to click instead.
ipcMain.on('minimize-app', () => {
  win.minimize();
});

app.whenReady().then(() => {
  // First run only — respects a later manual toggle in the tray menu instead of
  // re-forcing this true on every launch.
  if (!fs.existsSync(CONFIG_PATH)) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Deliberately does NOT quit here (unlike most Electron apps) — the tray icon is
  // the only intended way to fully exit a widget that's meant to just sit on the
  // desktop.
});
