import fs from "fs";
import path from "path";
import temp from "temp";
import Unzipper from "adm-zip";
import { IncludeListMod, ModJSON } from "../mod/mod.js";
import { createPackage, extractAll } from "@electron/asar";

export class Files {
  modFolder: string;
  installFolder: string;
  temp: string | null = null;
  corePath: string | null = null;

  constructor() {
    this.modFolder = this.getModFolder();
    this.installFolder = this.getInstalledFolder();
  }

  getModFolder(): string {
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

  getIncludeList(): IncludeListMod[] {
    const includeListPath = path.resolve(this.modFolder, "include.json");
    if (!fs.existsSync(includeListPath)) {
      fs.writeFileSync(includeListPath, "[]");
    }
    return JSON.parse(fs.readFileSync(includeListPath, "utf-8"));
  }

  updateIncludeList(...include: IncludeListMod[]) {
    const includeList = this.getIncludeList();

    include.forEach((mod) => {
      const index = includeList.findIndex((existing) => existing.id === mod.id);
      if (index === -1) {
        includeList.push(mod);
      } else {
        includeList[index] = mod;
      }
    });
    fs.writeFileSync(
      path.resolve(this.modFolder, "include.json"),
      JSON.stringify(includeList)
    );
  }

  getInstalledFolder(): string {
    const installed = path.resolve(this.modFolder, "installed");
    if (!fs.existsSync(installed)) fs.mkdirSync(installed);
    return installed;
  }

  getModFolderFor(modId: string): string {
    const modFolder = path.resolve(this.installFolder, modId);
    if (!fs.existsSync(modFolder)) fs.mkdirSync(modFolder);
    return modFolder;
  }

  updateMod(modId: string, mod: ModJSON) {
    const modFolder = this.getModFolderFor(modId);
    fs.writeFileSync(path.resolve(modFolder, "mod.json"), JSON.stringify(mod));
  }

  isDuplicate(modId: string): boolean {
    return fs.existsSync(path.resolve(this.installFolder, modId));
  }

  getZipPath(modId: string): string {
    return path.resolve(this.getModFolderFor(modId), "repository.zip");
  }

  unzip(modId: string): boolean {
    const admZip = new Unzipper(this.getZipPath(modId));
    const modJsonEntry = admZip
      .getEntries()
      .find(
        (entry) =>
          entry.entryName.endsWith("mod.json") &&
          entry.entryName.split("/").length === 2
      );
    if (!modJsonEntry) {
      return false;
    }
    const extractSuccess = admZip.extractEntryTo(
      modJsonEntry.entryName,
      this.getModFolderFor(modId),
      false,
      true
    );
    return extractSuccess;
  }

  getModJson(modId: string): ModJSON {
    const modFolder = this.getModFolderFor(modId);
    const modJsonPath = path.resolve(modFolder, "mod.json");
    if (!fs.existsSync(modJsonPath)) {
      throw new Error(`Could not find mod.json for ${modId}`);
    }
    return JSON.parse(fs.readFileSync(modJsonPath, "utf-8"));
  }

  removeMod(modId: string) {
    const modFolder = this.getModFolderFor(modId);
    if (!fs.existsSync(modFolder)) return;
    fs.rmSync(modFolder, { recursive: true });
  }

  listMods(): string[] {
    return fs.readdirSync(this.installFolder).filter((file) => {
      const filePath = path.resolve(this.installFolder, file);
      return fs.statSync(filePath).isDirectory();
    });
  }

  readExternalMod(external: string): ModJSON | null {
    const modJsonPath = path.resolve(external, "mod.json");
    if (!fs.existsSync(modJsonPath)) return null;
    const modJsonContents = fs.readFileSync(modJsonPath, { encoding: "utf-8" });
    const modJson: ModJSON = JSON.parse(modJsonContents);
    return modJson;
  }

  getTempFolder(): string {
    if (!this.temp) this.temp = temp.track().mkdirSync("discord-core");
    return this.temp;
  }

  findDiscordCore(): string {
    if (this.corePath) return this.corePath;
    let discordCorePath: string | undefined;
    if (process.platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA;
      if (!localAppData) throw new Error("Could not find local app data");
      discordCorePath = path.resolve(localAppData, "Discord");
    } else if (process.platform === "linux") {
      const home = process.env.HOME;
      if (!home) throw new Error("Could not find home directory");
      discordCorePath = path.resolve(home, ".config/discord");
    } else if (process.platform === "darwin") {
      const home = process.env.HOME;
      if (!home) throw new Error("Could not find home directory");
      discordCorePath = path.resolve(
        home,
        "Library/Application Support/discord"
      );
    }
    if (!discordCorePath) throw new Error("Could not find discord core path");
    const definitelyDiscordCorePath = discordCorePath;
    const directories = fs.readdirSync(discordCorePath);
    const versionDir = directories.filter((dir) =>
      /app-\d+\.\d+\.\d+/.test(dir)
    );
    if (!versionDir)
      throw new Error("Could not find discord version directory");
    const modules = versionDir.filter((dir) =>
      fs.existsSync(path.resolve(definitelyDiscordCorePath, dir, "modules"))
    );
    modules.sort((a, b) => b.localeCompare(a));
    const highestVersion = modules[0];
    const modulesPath = path.resolve(
      definitelyDiscordCorePath,
      highestVersion,
      "modules"
    );
    const modulesDirectories = fs.readdirSync(modulesPath);
    const coreDir = modulesDirectories.find((dir) =>
      dir.startsWith("discord_desktop_core")
    );
    if (!coreDir)
      throw new Error("Could not find discord desktop core directory");
    const fullPath = path.resolve(modulesPath, coreDir, "discord_desktop_core");
    const coreAsar = path.resolve(fullPath, "core.asar");
    const coreAsarExists = fs.existsSync(coreAsar);
    if (!coreAsarExists)
      throw new Error("Could not find discord desktop core.asar");
    this.corePath = fullPath;
    return fullPath;
  }

  getBackupPath(): string {
    const corePath = this.findDiscordCore();
    return path.resolve(corePath, "core.asar.backup");
  }

  backUpCore() {
    const backupPath = this.getBackupPath();
    const coreFilePath = path.resolve(this.findDiscordCore(), "core.asar");
    const originalExists = fs.existsSync(coreFilePath);
    if (!originalExists) throw new Error("Could not find core.asar to backup");
    const backupExists = fs.existsSync(backupPath);
    if (!backupExists) {
      console.log("backing up core.asar from", coreFilePath, "to", backupPath);
      const noAsarValue = process.noAsar;
      process.noAsar = true;
      fs.copyFileSync(coreFilePath, backupPath);
      process.noAsar = noAsarValue;
    }
  }

  getMainScreen() {
    const corePath = this.findDiscordCore();
    const backup = this.getBackupPath();
    const tempFolder = this.getTempFolder();
    const backUpExists = fs.existsSync(backup);
    if (backUpExists) {
      console.log("using backup");
      extractAll(backup, tempFolder);
    } else {
      console.log("using normal");
      const normal = path.resolve(corePath, "core.asar");
      const normalExists = fs.existsSync(normal);
      if (!normalExists)
        throw new Error("Could not find core.asar or core.asar.backup");
      extractAll(normal, tempFolder);
    }

    console.log("reading mainScreen.js");
    const mainScreen = fs.readFileSync(
      path.resolve(tempFolder, "app", "mainScreen.js"),
      "utf-8"
    );
    return mainScreen;
  }

  writeMainScreen(mainScreen: string, dryRun = false) {
    const tempPath = this.getTempFolder();
    console.log("writing mainScreen.js at", tempPath);
    fs.writeFileSync(
      path.resolve(tempPath, "app", "mainScreen.js"),
      mainScreen
    );
    if (dryRun) return;
    const coreFile = path.resolve(this.findDiscordCore(), "core.asar");
    createPackage(tempPath, coreFile);
    console.log("wrote core.asar at", coreFile);
  }

  unpatch() {
    const corePath = this.findDiscordCore();
    const backupPath = this.getBackupPath();
    const exists = fs.existsSync(backupPath);
    if (!exists) throw new Error("Could not find backup");
    fs.copyFileSync(backupPath, path.resolve(corePath, "core.asar"));
  }

  patch(mainScreen: string, dryRun = false) {
    this.backUpCore();
    this.writeMainScreen(mainScreen, dryRun);
  }

  readFile(path: string) {
    return fs.readFileSync(path, "utf-8");
  }

  exists(path: string) {
    return fs.existsSync(path);
  }
}
