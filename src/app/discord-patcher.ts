import { ModJSON } from "../mod/mod.js";
import { Files } from "../util/files.js";

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
  private files: Files;
  constructor(files: Files, ...modJsons: ModJSON[]) {
    this.files = files;
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

  // matches // MOD: <mod id>\n.*\n// END MOD: <mod id>
  static findModMarker(mainScreen: string, modId: string) {
    console.debug("finding mod marker for", modId);
    const regex = new RegExp(`// MOD: ${modId}.+// END MOD: ${modId}`, "gms");
    const match = regex.exec(mainScreen);
    return match;
  }

  patchMainScreen() {
    let mainScreen = this.files.getMainScreen();
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

      modString += `// MOD: ${modJson.id}\n`;
      if ((modJson.config ?? []).length > 0) {
        const mapped = modJson.config
          ?.map(
            (field) => `${field.name}: ${field.value ?? field.defaultValue}`
          )
          .join(",\n");
        modString += `if (typeof modConfig === "undefined") var modConfig = {};
        modConfig["${modJson.id}"] = {
          ${mapped}
        };
        mainWindow.webContents.executeJavaScript("window['modConfig'] = { ${mapped} };");
        `;
      }

      Object.entries(modJson.events.events).forEach(([event, callback]) => {
        const on = callback.on
          .map(
            (cb) =>
              `mainWindow.webContents.on("${event}", () => (${cb})(mainWindow, modConfig["${modJson.id}"]));`
          )
          .join("\n");
        const once = callback.once
          .map(
            (cb) =>
              `mainWindow.webContents.once("${event}", () => (${cb})(mainWindow, modConfig["${modJson.id}"]));`
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
}
