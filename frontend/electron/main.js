
import { app, BrowserWindow, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
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
  mainWindow.on("closed", () => {
    mainWindow = null;
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

  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-downloaded", async () => {
      if (!mainWindow) return;
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Restart and install", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Electronics POS update ready",
        message: "An update is ready to install.",
        detail: "Restart Electronics POS now to finish updating, or install it the next time you close the app.",
      });
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });

    const checkForUpdates = () => {
      autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        console.error("Electronics POS update check failed.", error);
      });
    };
    checkForUpdates();
    setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
