import { app, BrowserWindow, ipcMain, IpcMainEvent } from "electron";
import { DiscordPatcher } from "./discord-patcher.js";
import {
  CombinedMod,
  Dependency,
  IncludeListMod,
  ModJSON,
} from "../mod/mod.js";
import path from "path";
import { Files } from "../util/files.js";
import { download } from "../util/download.js";

class PatcherApp {
  files = new Files();
  mods: CombinedMod[] = [];
  mainWindow: BrowserWindow | null = null;

  constructor() {
    this.initApp();
  }

  installMod(modJson: ModJSON): boolean {
    if (this.files.isDuplicate(modJson.id)) {
      this.mainWindow?.webContents.send(
        "error",
        `Mod ${modJson.id} is already installed`
      );
      return false;
    }
    const includeList = this.files.getIncludeList();
    const includeMod = includeList.find((mod) => mod.id === modJson.id);
    if (!includeMod) {
      const includeMod: IncludeListMod = {
        id: modJson.id,
        dependencies: modJson.dependencies,
        version: modJson.version,
        enabled: true,
      };
      this.files.updateIncludeList(includeMod);
    }
    this.files.updateMod(modJson.id, modJson);
    return true;
  }

  async installFromRepository(repository: string): Promise<CombinedMod | null> {
    console.log(`Installing repository ${repository}...`);
    const fragments = repository.split("/");
    const githubIndex = fragments.findIndex(
      (fragment) => fragment === "github.com"
    );
    if (githubIndex === -1) {
      this.mainWindow?.webContents.send(
        "error",
        `Invalid repository ${repository}, must be on GitHub`
      );
      return null;
    }
    const userIndex = githubIndex + 1;
    const repoIndex = githubIndex + 2;
    if (fragments.length < repoIndex + 1) {
      this.mainWindow?.webContents.send(
        "error",
        `Invalid repository ${repository}, must follow https://github.com/{user}/{repo} or https://github.com/{user}/{repo}/archive/refs/heads/{branch}.zip`
      );
      return null;
    }
    if (fragments.length === repoIndex + 1) {
      repository =
        "https://github.com/" +
        fragments[userIndex] +
        "/" +
        fragments[repoIndex] +
        "/archive/refs/heads/main.zip";
    }
    if (this.files.isDuplicate(fragments[repoIndex])) {
      console.log(`Mod ${fragments[repoIndex]} already exists`);
      return null;
    }
    let downloadFailed = false;
    await download(
      repository,
      this.files.getZipPath(fragments[repoIndex])
    ).catch((e) => {
      this.mainWindow?.webContents.send(
        "error",
        `Could not download archive ${repository}: ${e}`
      );
      console.error(e);
      downloadFailed = true;
    });
    if (downloadFailed) return null;
    console.log(`Extracting archive ${repository}...`);
    const extractSuccess = this.files.unzip(fragments[repoIndex]);
    if (!extractSuccess) {
      this.mainWindow?.webContents.send(
        "error",
        `Could not extract repository ${repository}`
      );
      return null;
    }
    const modJson: ModJSON = this.files.getModJson(fragments[repoIndex]);
    this.files.removeMod(fragments[repoIndex]);
    const installed = this.installMod(modJson);
    if (!installed) return null;
    const combinedMod: CombinedMod = { ...modJson, enabled: true };
    return combinedMod;
  }

  getMissingDependencies(mods: CombinedMod[]) {
    const missingDependencies: Dependency[] = [];
    mods.forEach((mod) => {
      const missingDeps = mod.dependencies.filter(
        (dep) => !mods.some((m) => m.id === dep.id)
      );
      missingDependencies.push(...missingDeps);
    });
    return [...new Set(missingDependencies)];
  }

  async updateMods(): Promise<void> {
    const modIncludeListJSON: IncludeListMod[] = this.files.getIncludeList();
    const mods: CombinedMod[] = [];
    this.files.listMods().forEach((mod: string) => {
      const modJson: ModJSON = this.files.getModJson(mod);
      const includeMod = modIncludeListJSON.find(
        (mod) => mod.id === modJson.id
      );
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
        return this.installFromRepository(repository);
      }
    });
    await Promise.all(promises);

    const missingDependencies = this.getMissingDependencies(mods);

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
        return this.installFromRepository(repository);
      });
      await Promise.all(promises);
    }

    this.mods = mods;
  }

  createWindow() {
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
    this.mainWindow = win;
  }

  updateIncludeList() {
    const includeList = this.files.getIncludeList();
    const includeMods = this.mods.map((mod) => {
      const includeMod = includeList.find((m) => m.id === mod.id);
      if (!includeMod) {
        return {
          ...mod,
          enabled: true,
        };
      }
      return includeMod;
    });
    this.files.updateIncludeList(...includeMods);
  }

  onEnable(
    _: IpcMainEvent,
    obj: { id: string; version: string; enabled: boolean }
  ) {
    console.log("enable", obj.id, obj.version, obj.enabled);
    const mod = this.mods.find((mod) => mod.id === obj.id);
    if (!mod) {
      this.mainWindow?.webContents.send(
        "error",
        `Could not find mod ${obj.id}`
      );
      return;
    }
    const originalEnabled = mod.enabled;
    mod.enabled = obj.enabled;
    if (originalEnabled === obj.enabled) return;
    this.updateIncludeList();
    this.mainWindow?.webContents.send("mods", this.mods);
  }

  onUninstall(_: IpcMainEvent, obj: { id: string; version: string }) {
    console.log("uninstall", obj.id, obj.version);
    const mod = this.mods.find((mod) => mod.id === obj.id);
    if (!mod) {
      this.mainWindow?.webContents.send(
        "error",
        `Could not find mod ${obj.id}`
      );
      return;
    }
    this.files.removeMod(mod.id);
    const modIndex = this.mods.findIndex((mod) => mod.id === obj.id);
    if (modIndex === -1) {
      this.mainWindow?.webContents.send(
        "error",
        `Could not find mod ${obj.id} in mods`
      );
      return;
    }
    this.mods.splice(modIndex, 1);
    this.updateIncludeList();
    this.mainWindow?.webContents.send("mods", this.mods);
  }

  onPatch() {
    console.log("patch");
    console.log("mods", this.mods.map((mod) => mod.id).join(", "));
    try {
      const patcher = new DiscordPatcher(
        this.files,
        ...this.mods.filter((mod) => mod.enabled)
      );
      const newMainScreen = patcher.patchMainScreen();
      this.files.patch(newMainScreen);
    } catch (e: any) {
      const message = e.message ?? e;
      this.mainWindow?.webContents.send("error", message);
      console.error(e);
      return;
    }
    this.mainWindow?.webContents.send("success", "Patched!");
  }

  onUnpatch() {
    console.log("unpatch");
    this.files.unpatch();
    this.mainWindow?.webContents.send("success", "Unpatched!");
  }

  onRefresh() {
    console.log("refresh");
    this.updateMods();
    this.mainWindow?.webContents.send("mods", this.mods);
  }

  async onDownload(_: IpcMainEvent, repository: string) {
    console.log("download", repository);
    const mod = await this.installFromRepository(repository);
    if (!mod) {
      this.mainWindow?.webContents.send(
        "error",
        `Repository ${repository} failed to install`
      );
      return;
    }
    this.mods.push(mod);
    this.mainWindow?.webContents.send("mods", this.mods);
  }

  async onInstall(_: IpcMainEvent, obj: { path: string }) {
    console.log("install", obj.path);
    const external = this.files.readExternalMod(obj.path);
    if (!external) {
      this.mainWindow?.webContents.send(
        "error",
        `No mod.json found at ${obj.path}`
      );
      return;
    }
    const wasInstalled = this.installMod(external);
    if (wasInstalled) {
      const combinedMod: CombinedMod = { ...external, enabled: true };
      this.mods.push(combinedMod);
      this.updateIncludeList();
    }
    this.mainWindow?.webContents.send("mods", this.mods);
  }

  async initApp() {
    this.updateMods();

    await app.whenReady();
    this.createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });

    if (!this.mainWindow) throw new Error("Main window is not defined");

    this.mainWindow.webContents.on("did-finish-load", () => {
      if (!this.mainWindow) throw new Error("Main window is not defined");
      this.mainWindow.webContents.send("mods", this.mods);
    });

    ipcMain.on("enable", (event, obj) => this.onEnable(event, obj));
    ipcMain.on("uninstall", (event, obj) => this.onUninstall(event, obj));
    ipcMain.on("patch", (_) => this.onPatch());
    ipcMain.on("unpatch", (_) => this.onUnpatch());
    ipcMain.on("refresh", (_) => this.onRefresh());
    ipcMain.on("download", (event, obj) => this.onDownload(event, obj));
    ipcMain.on("install", (event, obj) => this.onInstall(event, obj));
  }
}

const modManager = new PatcherApp();
