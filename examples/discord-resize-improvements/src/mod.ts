import { Mod } from "discord-modding-framework";
import fs from "fs";
import path from "path";
const MinimizeableDms = new Mod("minimizeable-dms");
const SmallerWindow = new Mod("smaller-window");

MinimizeableDms.on("dom-ready", (mainWindow) => {
  mainWindow.webContents.executeJavaScript(`
  async function waitForElementToDisplay(selector, time) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(selector) != null) {
        resolve(true);
      }
      setTimeout(() => {
        resolve(waitForElementToDisplay(selector, time));
      }, time);
    });
  }

  const collapseArrowSvg = \`<svg fill="#FFFFFF" height="20px" width="20px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 489.3 489.3" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <g> <path d="M476.9,232.45H147.2l55.9-55.9c4.8-4.8,4.8-12.5,0-17.3s-12.5-4.8-17.3,0l-76.8,76.8c-4.8,4.8-4.8,12.5,0,17.3l76.8,76.8 c2.4,2.4,5.5,3.6,8.7,3.6s6.3-1.2,8.7-3.6c4.8-4.8,4.8-12.5,0-17.3l-55.9-55.9H477c6.8,0,12.3-5.5,12.3-12.3 C489.2,237.85,483.7,232.45,476.9,232.45z"></path> <path d="M24.5,476.25V13.05c0-6.8-5.5-12.3-12.3-12.3S0,6.25,0,13.05v463.2c0,6.8,5.5,12.3,12.2,12.3S24.5,483.05,24.5,476.25z"></path> </g> </g> </g></svg>\`;
  const rightArrowSvg = \`<svg fill="#FFFFFF" height="15px" width="20px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 330 330" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path id="XMLID_222_" d="M250.606,154.389l-150-149.996c-5.857-5.858-15.355-5.858-21.213,0.001 c-5.857,5.858-5.857,15.355,0.001,21.213l139.393,139.39L79.393,304.394c-5.857,5.858-5.857,15.355,0.001,21.213 C82.322,328.536,86.161,330,90,330s7.678-1.464,10.607-4.394l149.999-150.004c2.814-2.813,4.394-6.628,4.394-10.606 C255,161.018,253.42,157.202,250.606,154.389z"></path> </g></svg>\`;

  function buildExpander(navHeight, navWidth) {
    const expanding = document.createElement("div");
    expanding.id = "expanding";
    expanding.style.height = navHeight;
    expanding.style.width = navWidth;
    return expanding;
  }

  function buildMinimizeArrow(navWidth) {
    const minimizeArrow = document.createElement("div");
    minimizeArrow.style.width = navWidth;
    minimizeArrow.style.height = "20px";
    minimizeArrow.style.display = "flex";
    minimizeArrow.style.justifyContent = "flex-start";
    minimizeArrow.style.margin = "2px 2px 2px 2px";
    minimizeArrow.style.cursor = "pointer";
    return minimizeArrow;
  }

  function buildMinimizeIcon() {
    const minimizeIcon = document.createElement("span");
    minimizeIcon.style.width = "20px";
    minimizeIcon.style.height = "20px";
    minimizeIcon.innerHTML = collapseArrowSvg;
    return minimizeIcon;
  }

  function makeMinimized(expanding, collapsedParent, nav, minimizeIcon) {
    expanding.style.position = "absolute";
    expanding.style.top = "0px";
    expanding.style.right = "0px";
    collapsedParent.appendChild(expanding);
    expanding.style.width = "20px";
    nav.style.visibility = "hidden";
    minimizeIcon.innerHTML = rightArrowSvg;
  }

  function makeMaximized(expanding, navParent, nav, minimizeIcon, navWidth) {
    expanding.style.position = "relative";
    navParent.prepend(expanding);
    expanding.style.width = navWidth;
    nav.style.visibility = "visible";
    minimizeIcon.innerHTML = collapseArrowSvg;
  }

  async function run() {
    console.log("Minimizeable DMs loaded");
    await waitForElementToDisplay("div[class^='sidebar_']", 1000);
    await waitForElementToDisplay("nav[aria-label^='Servers sidebar']", 1000);

    const nav = document.querySelector("div[class^='sidebar_'");
    const navHeight = nav.style.height;
    const navWidth = nav.style.width;
    const expanding = buildExpander(navHeight, navWidth);
    const collapsedParent = document.querySelector(
      "nav[aria-label^='Servers sidebar']"
    );
    const navParent = nav.parentNode;
    expanding.appendChild(nav);
    navParent.prepend(expanding);
    const minimizeArrow = buildMinimizeArrow(navWidth);
    nav.style.height = "calc(100% - 20px)";
    expanding.insertBefore(minimizeArrow, nav);
    const minimizeIcon = buildMinimizeIcon();
    minimizeArrow.appendChild(minimizeIcon);
    let isMinimized = false;
    minimizeArrow.addEventListener("click", () => {
      if (!isMinimized) {
        makeMinimized(expanding, collapsedParent, nav, minimizeIcon);
        isMinimized = true;
      } else {
        makeMaximized(expanding, navParent, nav, minimizeIcon, navWidth);
        isMinimized = false;
      }
    });
  }
  run();
  `);
});

SmallerWindow.modifyWindow((mainWindow) => {
  mainWindow.setMinimumSize(100, 100);
});

SmallerWindow.dependencies = [new Mod("minimizeable-dms")];
const minimizeable = MinimizeableDms.getJSON();
const smaller = SmallerWindow.getJSON();
const mods = [smaller, minimizeable];
const modPath = path.resolve("./mods");
if (!fs.existsSync(modPath)) {
  fs.mkdirSync(modPath);
}
mods.forEach((mod) => {
  const modFolderPath = path.resolve(`${modPath}/${mod.id}`);
  if (!fs.existsSync(modFolderPath)) {
    fs.mkdirSync(modFolderPath);
  }
  const modJsonPath = path.resolve(`${modFolderPath}/mod.json`);
  fs.writeFileSync(modJsonPath, JSON.stringify(mod));
});
