const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  api: {
    send: (channel, data) => {
      let validChannels = [
        "enable",
        "uninstall",
        "patch",
        "unpatch",
        "refresh",
        "install",
        "download",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = ["mods", "error", "success"];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
  },
});
