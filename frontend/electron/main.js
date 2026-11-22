
import { app, BrowserWindow, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: "Electronics POS",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(
      path.join(__dirname, "..", "dist", "index.html"),
      { hash: "/login" },
    );
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    app.whenReady().then(() => {
      autoUpdater.checkForUpdatesAndNotify();
    });

    autoUpdater.on("update-downloaded", () => {
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true);
      }, 3000);
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
