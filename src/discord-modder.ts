import fs from "fs";
import * as mkdirp from "mkdirp";
import asar from "@electron/asar";
import path from "path";

export class DiscordModder {
  patch() {
    const corePath = this.findDiscordCore();
    const mainScreen = this.getMainScreen(corePath);
    this.backupCore(corePath);
    const patchedMainScreen = this.patchMainScreen(mainScreen);
    const logDir = path.resolve(__dirname, "logs");
    if (!fs.existsSync(logDir)) mkdirp.sync(logDir);
    fs.writeFileSync(
      path.resolve(__dirname, "logs/mainScreen.js"),
      patchedMainScreen
    );
    console.log("patching at", corePath);
    this.writeMainScreen(corePath, patchedMainScreen);
  }

  findDiscordCore() {
    let discordCorePath;
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
    const directories = fs.readdirSync(discordCorePath);
    const versionDir = directories.find((dir) => /app-\d+\.\d+\.\d+/.test(dir));
    if (!versionDir)
      throw new Error("Could not find discord version directory");
    const modulesPath = path.resolve(discordCorePath, versionDir, "modules");
    const modulesDirectories = fs.readdirSync(modulesPath);
    const coreDir = modulesDirectories.find((dir) =>
      dir.startsWith("discord_desktop_core")
    );
    if (!coreDir)
      throw new Error("Could not find discord desktop core directory");
    const fullPath = path.resolve(modulesPath, coreDir, "discord_desktop_core");
    return fullPath;
  }

  getMainScreen(corePath: string) {
    const backup = path.resolve(corePath, "core.asar.backup");
    const backUpExists = fs.existsSync(backup);
    if (backUpExists) {
      asar.extractAll(backup, path.resolve(__dirname, "temp/discord-core"));
    } else {
      const normal = path.resolve(corePath, "core.asar");
      const normalExists = fs.existsSync(normal);
      if (!normalExists)
        throw new Error("Could not find core.asar or core.asar.backup");
      asar.extractAll(normal, path.resolve(__dirname, "temp/discord-core"));
    }
    const mainScreen = fs.readFileSync(
      path.resolve(__dirname, "temp/discord-core/app/mainScreen.js"),
      "utf-8"
    );
    return mainScreen;
  }

  backupCore(corePath: string) {
    const backupPath = path.resolve(corePath, "core.asar.backup");
    const exists = fs.existsSync(backupPath);
    if (!exists)
      fs.copyFileSync(path.resolve(corePath, "core.asar"), backupPath);
  }

  writeMainScreen(corePath: string, mainScreen: string) {
    const tempDir = path.resolve(__dirname, "temp");
    if (!fs.existsSync(tempDir)) mkdirp.sync(tempDir);
    const coreDir = path.resolve(tempDir, "discord-core");
    const mainScreenPath = path.resolve(coreDir, "app/mainScreen.js");
    fs.writeFileSync(mainScreenPath, mainScreen);
    const coreFile = path.resolve(corePath, "core.asar");
    asar.createPackage(coreDir, coreFile);
    console.log("wrote core.asar at", coreFile);
  }

  getModPath() {
    const modEnv = process.env.MOD_LOCATION;
    if (modEnv) return modEnv;
    const discordCorePath = this.findDiscordCore();
    const discordBasePath = path.resolve(discordCorePath, "../..");
    const modPath = path.resolve(discordBasePath, "mods");
    if (!fs.existsSync(modPath)) mkdirp.sync(modPath);
    return modPath;
  }

  writeModLoader(modLoaderPath: string) {
    const modLoader = fs.readFileSync(
      path.resolve(__dirname, "mod-loader.js"),
      "utf-8"
    );
    const patched = modLoader.replace(
      `const dir = "";`,
      `const dir = "${modLoaderPath}";`
    );
    fs.writeFileSync(modLoaderPath, patched);
  }

  patchMainScreen(mainScreen: string) {
    const modFilesPaths = fs.readdirSync(this.getModPath());
    const modFiles = modFilesPaths.map((file) => {
      const filePath = path.resolve(this.getModPath(), file);
      const fileContents = fs.readFileSync(filePath, "utf-8");
      const sanitized = fileContents.replace(/`/g, "\\`");

      return `mainWindow.webContents.executeJavaScript(\`${sanitized}\`);`;
    });
    // add js loader
    mainScreen = mainScreen.replace(
      "mainWindow.webContents.on('did-fail-load', (e, errCode, errDesc, validatedUrl) => {",
      `console.log("adding mod loader");
      mainWindow.webContents.on("dom-ready", () => {
        console.log("dom ready");
         ${modFiles.join("\n")}
      });
        mainWindow.webContents.on('did-fail-load', (e, errCode, errDesc, validatedUrl) => {`
    );
    return mainScreen;
  }
}
