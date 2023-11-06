import fs from "fs";
import { createPackage, extractAll } from "@electron/asar";
import path from "path";
import { ModJSON } from "../mod/mod.js";

class Graph {
  adjacencyList: { [key: string]: string[] };
  constructor() {
    this.adjacencyList = {};
  }
  addVertex(vertex: string) {
    if (!this.adjacencyList[vertex]) {
      this.adjacencyList[vertex] = [];
    }
  }
  addEdge(v1: string, v2: string) {
    this.adjacencyList[v1].push(v2);
  }
}

export class DiscordPatcher {
  private modJsons: ModJSON[];
  constructor(...modJsons: ModJSON[]) {
    this.modJsons = modJsons;
    this.sortMods();
  }

  sortMods() {
    const mods = [...this.modJsons];
    const graph = new Graph();
    mods.forEach((mod) => {
      graph.addVertex(mod.id);
      mod.dependencies.forEach((dep) => {
        graph.addVertex(dep.id);
        graph.addEdge(mod.id, dep.id);
      });
    });
    const vertices = Object.keys(graph.adjacencyList);
    const inDegree: { [key: string]: number } = {};
    for (const v of vertices) {
      for (const neighbor of graph.adjacencyList[v]) {
        inDegree[neighbor] = inDegree[neighbor] ? inDegree[neighbor] + 1 : 1;
      }
    }

    // Create a queue which stores the vertex without dependencies
    const queue = vertices.filter((v) => !inDegree[v]);
    const topNums: { [key: string]: number } = {};
    let index = 0;
    while (queue.length) {
      const v = queue.shift();
      if (!v) break;
      topNums[v] = index++;
      // adjust the incoming degree of its neighbors
      for (const neighbor of graph.adjacencyList[v]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (index !== vertices.length) {
      throw new Error("Dependency cycle detected. Cannot sort mods");
    }

    this.modJsons.sort((a, b) => topNums[b.id] - topNums[a.id]);
    console.debug(
      "sorted mods",
      this.modJsons.map((mod) => mod.id)
    );
  }

  patch(opts: { dryRun: boolean } = { dryRun: false }) {
    const corePath = DiscordPatcher.findDiscordCore();
    const mainScreen = DiscordPatcher.getMainScreen(corePath);
    DiscordPatcher.backupCore(corePath);
    const patchedMainScreen = this.patchMainScreen(mainScreen);
    console.log("patching at", corePath);
    DiscordPatcher.writeMainScreen(corePath, patchedMainScreen, opts.dryRun);
  }

  // simply replacess core with backup
  unpatch(opts: { dryRun: boolean } = { dryRun: false }) {
    const corePath = DiscordPatcher.findDiscordCore();
    const backupPath = DiscordPatcher.getBackUpPath();
    const exists = fs.existsSync(backupPath);
    if (!exists) throw new Error("Could not find backup");
    if (opts.dryRun) return;
    fs.copyFileSync(backupPath, path.resolve(corePath, "core.asar"));
  }

  static getBackUpPath() {
    const corePath = DiscordPatcher.findDiscordCore();
    const backupDir = path.resolve(corePath);
    return path.resolve(backupDir, "core.asar.backup");
  }

  static cleanUp() {
    const tempFolder = DiscordPatcher.getTempFolder();
    const tempPath = path.resolve(tempFolder, "discord-core");
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
  }

  static getTempFolder() {
    let tempFolder;
    if (process.platform === "win32") {
      tempFolder =
        process.env.TEMP ??
        process.env.TMP ??
        (process.env.SystemRoot ?? process.env.windir) + "\\temp";
    } else {
      tempFolder =
        process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/tmp";
    }
    if (!tempFolder) throw new Error("Could not find temp folder");
    return tempFolder;
  }

  static findDiscordCore() {
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
    const highestVersion = modules.sort((a, b) => b.localeCompare(a))[0];
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
    return fullPath;
  }

  static getMainScreen(corePath: string) {
    const backup = DiscordPatcher.getBackUpPath();
    const tempFolder = DiscordPatcher.getTempFolder();
    const backUpExists = fs.existsSync(backup);
    if (backUpExists) {
      console.log("using backup");
      extractAll(backup, path.resolve(tempFolder, "discord-core"));
    } else {
      console.log("using normal");
      const normal = path.resolve(corePath, "core.asar");
      const normalExists = fs.existsSync(normal);
      if (!normalExists)
        throw new Error("Could not find core.asar or core.asar.backup");
      extractAll(normal, path.resolve(tempFolder, "discord-core"));
    }

    console.log("reading mainScreen.js");
    const mainScreen = fs.readFileSync(
      path.resolve(tempFolder, "discord-core", "app", "mainScreen.js"),
      "utf-8"
    );
    return mainScreen;
  }

  static backupCore(corePath: string) {
    const backupPath = DiscordPatcher.getBackUpPath();
    const coreFilePath = path.resolve(corePath, "core.asar");
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

  static writeMainScreen(corePath: string, mainScreen: string, dryRun = false) {
    const tempFolder = DiscordPatcher.getTempFolder();
    const tempPath = path.resolve(tempFolder, "discord-core");
    console.log("writing mainScreen.js at", tempPath);
    fs.writeFileSync(
      path.resolve(tempPath, "app", "mainScreen.js"),
      mainScreen
    );
    if (dryRun) return;
    const coreFile = path.resolve(corePath, "core.asar");
    createPackage(tempPath, coreFile);
    console.log("wrote core.asar at", coreFile);
  }

  static writeModLoader(modLoaderPath: string) {
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

  // matches // MOD: <mod id>\n.*\n// END MOD: <mod id>
  static findModMarker(mainScreen: string, modId: string) {
    console.debug("finding mod marker for", modId);
    const regex = new RegExp(`// MOD: ${modId}.+// END MOD: ${modId}`, "gms");
    const match = regex.exec(mainScreen);
    return match;
  }

  patchMainScreen(mainScreen: string) {
    return this.modJsons.reduce((mainScreen, modJson) => {
      const depMarkers = modJson.dependencies.map((dep) => {
        console.debug("finding dep", dep, "for mod", modJson.id);
        const depMarker = DiscordPatcher.findModMarker(mainScreen, dep.id);
        console.debug("found dep", dep, "for mod", modJson.id);
        if (!depMarker) {
          throw new Error(
            `Could not find dependency mod ${dep.id}. It is needed for mod ${modJson.id}, make sure to install it.`
          );
        }
        return depMarker;
      });
      const modMarker = DiscordPatcher.findModMarker(mainScreen, modJson.id);
      if (modMarker) {
        mainScreen = mainScreen.replace(modMarker[0], "");
      }

      const defaultEntryMarker =
        /mainWindow\.on\('swipe', \(_, direction\) => \{/g.exec(mainScreen);
      if (!defaultEntryMarker)
        throw new Error("Could not find default entry marker");
      const defaultEntryMarkerIndex = defaultEntryMarker.index;
      if (!defaultEntryMarkerIndex)
        throw new Error("Could not find default entry marker index");
      let entryIndex = defaultEntryMarkerIndex - 1;
      if (depMarkers.length > 0) {
        const lastDepMarker = depMarkers[depMarkers.length - 1];
        const lastDepMarkerIndex = lastDepMarker.index;
        if (!lastDepMarkerIndex)
          throw new Error("Could not find last dependency marker index");
        entryIndex = lastDepMarkerIndex + lastDepMarker[0].length + 1;
      }

      let modString = "";

      modString += `// MOD: ${modJson.id}`;

      Object.entries(modJson.events.events).forEach(([event, callback]) => {
        const on = callback.on
          .map(
            (cb) =>
              `mainWindow.webContents.on("${event}", () => (${cb})(mainWindow));`
          )
          .join("\n");
        const once = callback.once
          .map(
            (cb) =>
              `mainWindow.webContents.once("${event}", () => (${cb})(mainWindow));`
          )
          .join("\n");
        modString += `\n${on}\n${once}`;
      });

      const windowModifications = modJson.events.windowModifications;
      if (windowModifications) {
        const mods = windowModifications
          .map((cb) => `(${cb})(mainWindow);`)
          .join("\n");
        modString += `\n${mods}`;
      }
      modString += `\n// END MOD: ${modJson.id}\n`;
      mainScreen =
        mainScreen.slice(0, entryIndex) +
        modString +
        mainScreen.slice(entryIndex);
      return mainScreen;
    }, mainScreen);
  }

  static removeMod(modId: string) {
    const corePath = DiscordPatcher.findDiscordCore();
    const mainScreen = DiscordPatcher.getMainScreen(corePath);
    const modMarker = DiscordPatcher.findModMarker(mainScreen, modId);
    if (!modMarker) throw new Error(`Could not find mod ${modId}`);
    const patched = mainScreen.replace(modMarker[0], "");
    DiscordPatcher.writeMainScreen(corePath, patched);
  }
}
