
import { app, BrowserWindow, ipcMain, shell } from "electron";
import updaterPackage from "electron-updater";
import net from "node:net";
import { Buffer } from "node:buffer";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
const { autoUpdater } = updaterPackage;

ipcMain.on("app:version", (event) => {
  event.returnValue = app.getVersion();
});

const sendUpdateStatus = (status) => {
  mainWindow?.webContents.send("update:status", status);
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("checking-for-update", () => {
  sendUpdateStatus({ state: "checking" });
});
autoUpdater.on("update-available", (info) => {
  sendUpdateStatus({
    state: "available",
    version: info.version,
  });
});
autoUpdater.on("update-not-available", (info) => {
  sendUpdateStatus({
    state: "current",
    version: info.version,
  });
});
autoUpdater.on("download-progress", (progress) => {
  sendUpdateStatus({
    state: "downloading",
    percent: Math.round(progress.percent),
  });
});
autoUpdater.on("update-downloaded", (info) => {
  sendUpdateStatus({
    state: "downloaded",
    version: info.version,
  });
});
autoUpdater.on("error", (error) => {
  sendUpdateStatus({
    state: "error",
    message: error.message,
  });
});

ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) {
    return { state: "development", message: "Updates are available in the installed application." };
  }
  return autoUpdater.checkForUpdates();
});
ipcMain.handle("update:download", async () => {
  if (!app.isPackaged) throw new Error("Updates are disabled in development mode.");
  return autoUpdater.downloadUpdate();
});
ipcMain.handle("update:install", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("printer:network-print", async (_event, payload) => {
  const host = String(payload?.host || "").trim();
  const port = Number(payload?.port) || 9100;
  const text = String(payload?.text || "");

  if (!host || !text) {
    throw new Error("A printer IP address and receipt text are required.");
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      const commands = Buffer.concat([
        Buffer.from([0x1b, 0x40]),
        Buffer.from(text, "utf8"),
        Buffer.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]),
      ]);
      socket.end(commands);
    });
    socket.setTimeout(5000);
    socket.once("error", (error) => {
      socket.destroy();
      reject(new Error(
        `Network receipt printing failed: ${error.message}. ` +
        "Check that the computer and printer are on the same network."
      ));
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(
        "Network receipt printing timed out. Check the printer IP address and port."
      ));
    });
    socket.once("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
});

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
    const checkForUpdates = () => {
      autoUpdater.checkForUpdates().catch((error) => {
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
