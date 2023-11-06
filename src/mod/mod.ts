import { BrowserWindow } from "electron";
import { readFileSync } from "fs";
import ts from "typescript";

export type ElectronEvent =
  | "did-finish-load"
  | "did-fail-load"
  | "did-fail-provisional-load"
  | "did-frame-finish-load"
  | "did-start-loading"
  | "did-stop-loading"
  | "dom-ready"
  | "page-title-updated"
  | "page-favicon-updated"
  | "content-bounds-updated"
  | "did-create-window"
  | "will-navigate"
  | "will-frame-navigate"
  | "did-start-navigation"
  | "will-redirect"
  | "did-redirect-navigation"
  | "did-navigate"
  | "did-frame-navigate"
  | "did-navigate-in-page"
  | "will-prevent-unload"
  | "crashed"
  | "render-process-gone"
  | "unresponsive"
  | "responsive"
  | "plugin-crashed"
  | "destroyed"
  | "input-event"
  | "before-input-event"
  | "enter-html-full-screen"
  | "leave-html-full-screen"
  | "zoom-changed"
  | "blur"
  | "focus"
  | "devtools-open-url"
  | "devtools-opened"
  | "devtools-closed"
  | "devtools-focused"
  | "certificate-error"
  | "select-client-certificate"
  | "login"
  | "found-in-page"
  | "media-started-playing"
  | "media-paused"
  | "audio-state-changed"
  | "did-change-theme-color"
  | "update-target-url"
  | "cursor-changed"
  | "context-menu"
  | "select-bluetooth-device"
  | "paint"
  | "devtools-reload-page"
  | "will-attach-webview"
  | "did-attach-webview"
  | "console-message"
  | "preload-error"
  | "ipc-message"
  | "ipc-message-sync"
  | "preferred-size-changed"
  | "frame-created";

export type WindowEventCallback = (mainWindow: BrowserWindow) => void;

export type EventJSON = {
  [key in ElectronEvent]?: {
    on: string[];
    once: string[];
  };
};

export type WindowModificationsJSON = {
  windowModifications?: string[];
};

export type CBJson = {
  events: EventJSON;
} & WindowModificationsJSON;

export type ModSkeleton = {
  id: string;
  version: string;
  repository?: string;
};

export type Dependency = ModSkeleton;

export type ModBase = ModSkeleton & {
  dependencies: Dependency[];
  author?: string;
  description?: string;
  homepage?: string;
};

export type ModJSON = ModBase & {
  events: CBJson;
};

export type IncludeListMod = ModBase & {
  enabled: boolean;
};

export type CombinedMod = ModJSON & IncludeListMod;

export interface ElectronEventWithCallback {
  event: ElectronEvent;
  callback: WindowEventCallback;
}

export interface ConfigurationField {
  name: string;
  description: string;
  type: "string" | "boolean" | "number";
}

/**
 * A discord mod is a collection of event listeners that are executed when the event is fired (on or once).
 * The mod can also have dependencies, which are other mods that must be loaded before this mod.
 * The mod is identified by its id, which should be descriptive of what the mod does, and should be unique.
 *
 * On an event, the callback is called with the event and the main window as arguments. Discord runs on electron,
 * and the main window is an electron BrowserWindow. The main window can be used to access the DOM of the discord
 * app.
 * @see https://www.electronjs.org/docs/api/browser-window
 */
export class Mod {
  id: string;
  onList: ElectronEventWithCallback[] = [];
  onceList: ElectronEventWithCallback[] = [];
  windowModifications: ((mainWindow: BrowserWindow) => void)[] = [];
  dependencies: ModSkeleton[];
  version: string;
  repository?: string;
  author?: string;
  description?: string;
  homepage?: string;
  config?: ConfigurationField[];

  constructor(
    id: string,
    dependencies: ModSkeleton[] = [],
    version: string = "0.0.1",
    repository?: string,
    author?: string,
    description?: string,
    homepage?: string,
    config?: ConfigurationField[]
  ) {
    this.id = id;
    this.dependencies = dependencies;
    this.version = version;
    this.repository = repository;
    this.author = author;
    this.description = description;
    this.homepage = homepage;
    this.config = config;
  }

  /**
   * Allows you to create a callback from a file path.
   * Anything in this file will be executed when the event is fired.
   * This is a nice way to keep your code clean and organized.
   */
  static getCallbackFromFile(
    path: string,
    options?: ts.CompilerOptions
  ): WindowEventCallback {
    const str = readFileSync(path, "utf-8");
    const standardOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.CommonJS,
      allowJs: true,
    };
    const compilerOptions = options
      ? Object.assign(standardOptions, options)
      : standardOptions;
    const func = ts.transpile(
      `(mainWindow) => {
      mainWindow.webContents.executeJavaScript(\`
      ${str
        .replaceAll("\\", "\\\\")
        .replaceAll("`", "\\`")
        .replaceAll("$", "\\$")}
      \`);
    }`,
      compilerOptions
    );
    const cb = new Function(`return ${func}`)();
    return cb;
  }

  on(event: ElectronEvent, callback: WindowEventCallback) {
    this.onList.push({ event, callback });
  }

  once(event: ElectronEvent, callback: WindowEventCallback) {
    this.onceList.push({ event, callback });
  }

  modifyWindow(callback: (mainWindow: BrowserWindow) => void) {
    this.windowModifications.push(callback);
  }

  prepareForInjection() {
    const obj: CBJson = {
      events: {},
    };
    this.onList.forEach(({ event, callback }) => {
      if (!obj.events[event]) obj.events[event] = { on: [], once: [] };
      obj.events[event]?.on.push(callback.toString());
    });
    this.onceList.forEach(({ event, callback }) => {
      if (!obj.events[event]) obj.events[event] = { on: [], once: [] };
      obj.events[event]?.once.push(callback.toString());
    });
    this.windowModifications.forEach((callback) => {
      if (!obj.windowModifications) obj.windowModifications = [];
      obj.windowModifications.push(callback.toString());
    });
    return obj;
  }

  getJSON(): ModJSON {
    return {
      id: this.id,
      version: this.version,
      dependencies: this.dependencies,
      events: this.prepareForInjection(),
      repository: this.repository,
      homepage: this.homepage,
      author: this.author,
      description: this.description,
    };
  }
}
