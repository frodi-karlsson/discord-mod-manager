import { app, BrowserWindow, ipcMain } from "electron";
import { DiscordPatcher } from "./discord-patcher.js";
import { CombinedMod, Dependency, IncludeListMod, ModJSON } from "./mod.js";
import * as fs from "fs";
import path from "path";
import { download } from "download-git-repo";

function initializeModFolder() {
  let modFolder;
  switch (process.platform) {
    case "win32":
      const localAppData = process.env.LOCALAPPDATA;
      if (!localAppData) throw new Error("Could not find local app data");
      modFolder = path.resolve(localAppData, "DiscordMods");
      break;
    case "linux":
      const home = process.env.HOME;
      if (!home) throw new Error("Could not find home directory");
      modFolder = path.resolve(home, ".config/discordmods");
      break;
    case "darwin":
      const macHome = process.env.HOME;
      if (!macHome) throw new Error("Could not find home directory");
      modFolder = path.resolve(
        macHome,
        "Library/Application Support/discordmods"
      );
      break;
    default:
      throw new Error("Unsupported platform");
  }
  if (!fs.existsSync(modFolder)) fs.mkdirSync(modFolder);
  return modFolder;
}

function initializeModIncludeList(modFolder: string) {
  const modIncludeList = path.resolve(modFolder, "include.json");
  if (!fs.existsSync(modIncludeList))
    fs.writeFileSync(modIncludeList, JSON.stringify([]));
  return modIncludeList;
}

function initializeDownloadFolder(modFolder: string) {
  const downloadFolder = path.resolve(modFolder, "downloads");
  if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);
  return downloadFolder;
}

function installMod(modJson: ModJSON, modFolder: string) {
  const includeList = initializeModIncludeList(modFolder);
  const includeListContents = fs.readFileSync(includeList, {
    encoding: "utf-8",
  });
  const includeListJson: IncludeListMod[] = JSON.parse(includeListContents);
  const includeMod = includeListJson.find((mod) => mod.id === modJson.id);
  if (!includeMod) {
    const includeMod: IncludeListMod = {
      id: modJson.id,
      dependencies: modJson.dependencies,
      version: modJson.version,
      enabled: true,
    };
    includeListJson.push(includeMod);
    fs.writeFileSync(includeList, JSON.stringify(includeListJson));
  }
  const downloadFolder = initializeDownloadFolder(modFolder);
  const modPath = path.resolve(downloadFolder, modJson.id);
  if (!fs.existsSync(modPath)) fs.mkdirSync(modPath);
  const modJsonPath = path.resolve(modPath, "mod.json");
  fs.writeFileSync(modJsonPath, JSON.stringify(modJson));
}

async function installFromRepository(
  repository: string,
  downloadFolder: string
) {
  const temp = path.resolve(downloadFolder, "temp");
  if (fs.existsSync(temp)) {
    console.log(`Repository ${repository} already exists`);
    return;
  }
  await download(repository, temp, { clone: true });
  const repoName = repository.split("/").pop();
  if (!repoName) throw new Error("Could not find repository name");
  const repoPath = path.resolve(temp, repoName);
  const modJsonPath = path.resolve(repoPath, "mod.json");
  if (!fs.existsSync(modJsonPath))
    throw new Error(`Could not find mod.json in ${repository}`);
  const modJsonContents = fs.readFileSync(modJsonPath, { encoding: "utf-8" });
  const modJson: ModJSON = JSON.parse(modJsonContents);
  installMod(modJson, downloadFolder);
  const combinedMod: CombinedMod = { ...modJson, enabled: true };
  return combinedMod;
}

function getMissingDependencies(mods: CombinedMod[]) {
  const missingDependencies: Dependency[] = [];
  mods.forEach((mod) => {
    const missingDeps = mod.dependencies.filter(
      (dep) => !mods.some((m) => m.id === dep.id)
    );
    missingDependencies.push(...missingDeps);
  });
  return [...new Set(missingDependencies)];
}

async function getMods(modFolder: string, modIncludeList: string) {
  const modIncludeListContents = fs.readFileSync(modIncludeList, {
    encoding: "utf-8",
  });
  const modIncludeListJSON: IncludeListMod[] = JSON.parse(
    modIncludeListContents
  );
  const mods: CombinedMod[] = [];
  const downloadFolder = initializeDownloadFolder(modFolder);
  console.debug("downloadFolder", downloadFolder);
  const downloadedMods = fs.readdirSync(downloadFolder); // directories that include a mod.json
  console.debug("downloadedMods", downloadedMods);
  downloadedMods.forEach((mod: string) => {
    const isDirectory = fs
      .lstatSync(path.resolve(downloadFolder, mod))
      .isDirectory();
    if (!isDirectory) return;
    const modJsonExists = fs.existsSync(
      path.resolve(downloadFolder, mod, "mod.json")
    );
    console.debug("modJsonExists", modJsonExists, "mod", mod);
    if (!modJsonExists) return;
    const modJsonPath = path.resolve(downloadFolder, mod, "mod.json");
    const modJsonContents = fs.readFileSync(modJsonPath, { encoding: "utf-8" });
    const modJson: ModJSON = JSON.parse(modJsonContents);
    console.debug("modJson", modJson);
    const includeMod = modIncludeListJSON.find((mod) => mod.id === modJson.id);
    console.debug("includeMod", includeMod);
    if (includeMod) {
      const combinedMod: CombinedMod = { ...modJson, ...includeMod };
      mods.push(combinedMod);
    }
  });
  const promises = modIncludeListJSON.map(async (mod) => {
    const isLoaded = mods.some((loadedMod) => loadedMod.id === mod.id);
    if (!isLoaded) {
      const repository = mod.repository;
      if (!repository) {
        console.log(
          `Mod ${mod.id} is not loaded and does not have a repository. Skipping...`
        );
        return;
      }
      return installFromRepository(repository, downloadFolder);
    }
  });
  await Promise.all(promises);

  const missingDependencies = getMissingDependencies(mods);

  if (missingDependencies.length > 0) {
    console.log("Installing missing dependencies...");
    const promises = missingDependencies.map(async (dep) => {
      const repository = dep.repository;
      if (!repository) {
        console.log(
          `Dependency ${dep.id} is not loaded and does not have a repository. Skipping...`
        );
        return;
      }
      return installFromRepository(repository, downloadFolder);
    });
    await Promise.all(promises);
  }

  return mods;
}

async function initialize() {
  const modFolder = initializeModFolder();
  const modIncludeList = initializeModIncludeList(modFolder);
  const mods = await getMods(modFolder, modIncludeList);
  return { modFolder, mods };
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.resolve(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.resolve(__dirname, "templates/index.html"));
  mainWindow = win;
}

function getIncludeList(modFolder: string) {
  const includeList = initializeModIncludeList(modFolder);
  const includeListContents = fs.readFileSync(includeList, {
    encoding: "utf-8",
  });
  const includeListJson: IncludeListMod[] = JSON.parse(includeListContents);
  return includeListJson;
}

function changeIncludeList(mods: CombinedMod[], modFolder: string) {
  const includeList = getIncludeList(modFolder);
  const includeMods = mods.map((mod) => {
    const includeMod = includeList.find((m) => m.id === mod.id);
    if (!includeMod) {
      return {
        ...mod,
        enabled: true,
      };
    }
    return includeMod;
  });
  const includeListPath = initializeModIncludeList(modFolder);
  fs.writeFileSync(includeListPath, JSON.stringify(includeMods));
}

async function initApp() {
  const { modFolder, mods } = await initialize();

  await app.whenReady();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", () => {
    DiscordPatcher.cleanUp();
    if (process.platform !== "darwin") app.quit();
  });

  if (!mainWindow) throw new Error("Main window is not defined");

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow) throw new Error("Main window is not defined");
    mainWindow.webContents.send("mods", mods);
  });

  ipcMain.on(
    "enable",
    (event, obj: { id: string; version: string; enabled: boolean }) => {
      console.log("enable", obj.id, obj.version, obj.enabled);
      const mod = mods.find((mod) => mod.id === obj.id);
      if (!mod) {
        mainWindow?.webContents.send("error", `Could not find mod ${obj.id}`);
        return;
      }
      const originalEnabled = mod.enabled;
      mod.enabled = obj.enabled;
      if (originalEnabled === obj.enabled) return;
      changeIncludeList(mods, modFolder);
      mainWindow?.webContents.send("mods", mods);
    }
  );

  ipcMain.on("uninstall", (event, obj: { id: string; version: string }) => {
    console.log("uninstall", obj.id, obj.version);
    const mod = mods.find((mod) => mod.id === obj.id);
    if (!mod) {
      mainWindow?.webContents.send("error", `Could not find mod ${obj.id}`);
      return;
    }
    const downloadFolder = initializeDownloadFolder(modFolder);
    const modPath = path.resolve(downloadFolder, mod.id);
    fs.rmdirSync(modPath, { recursive: true });
    const modIndex = mods.findIndex((mod) => mod.id === obj.id);
    mods.splice(modIndex, 1);
    changeIncludeList(mods, modFolder);
    mainWindow?.webContents.send("mods", mods);
  });

  ipcMain.on("patch", () => {
    console.log("patch");
    console.log("mods", mods.map((mod) => mod.id).join(", "));
    try {
      const patcher = new DiscordPatcher(...mods.filter((mod) => mod.enabled));
      patcher.patch();
    } catch (e: any) {
      const message = e.message ?? e;
      mainWindow?.webContents.send("error", message);
      console.error(e);
      return;
    }
    mainWindow?.webContents.send("success", "Patched!");
  });

  ipcMain.on("unpatch", () => {
    console.log("unpatch");
    const patcher = new DiscordPatcher(...mods.filter((mod) => mod.enabled));
    patcher.unpatch();
    mainWindow?.webContents.send("success", "Unpatched!");
  });

  ipcMain.on("refresh", async () => {
    console.log("refresh");
    const { mods } = await initialize();
    mainWindow?.webContents.send("mods", mods);
  });

  ipcMain.on("download", async (event, obj: { repository: string }) => {
    console.log("download", obj.repository);
    const mod = await installFromRepository(obj.repository, modFolder);
    if (!mod) {
      mainWindow?.webContents.send(
        "error",
        `Repository ${obj.repository} already exists`
      );
      return;
    }
    mods.push(mod);
    mainWindow?.webContents.send("mods", mods);
  });

  ipcMain.on("install", async (event, obj: { path: string }) => {
    console.log("install", obj.path);
    const modJsonPath = path.resolve(obj.path, "mod.json");
    if (!fs.existsSync(modJsonPath))
      throw new Error(`Could not find mod.json in ${obj.path}`);
    const modJsonContents = fs.readFileSync(modJsonPath, { encoding: "utf-8" });
    const modJson: ModJSON = JSON.parse(modJsonContents);
    installMod(modJson, modFolder);
    const combinedMod: CombinedMod = { ...modJson, enabled: true };
    mods.push(combinedMod);
    changeIncludeList(mods, modFolder);
    mainWindow?.webContents.send("mods", mods);
  });
}

async function main() {
  await initApp();
}

main();
