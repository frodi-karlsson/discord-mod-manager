# Introduction

This repository serves as two things:
- A mod manager for discord, allowing for easy installation of modifications to the app
- A package for providing an easy way to make mods in a format supported by the mod manager

## Mod Manager

The mod manager allows running modifications to the discord app. It does this by patching the discord app using asar.
Mods are JSON files that contain callbacks for various events, such as when the DOM is ready, when the app is ready, etc.
They also contain mod metadata.

# Usage

## Mod Manager

If you aren't a developer, find the latest release [here](https://github.com/frodi-karlsson/discord-mod-manager/releases/latest). I also recommend reading the "Using the mod manager" section below.

Otherwise, see the development section below under the "Using the mod manager" section.


### Using the mod manager
Here is an image of the mod manager in action:


![Mod Manager](https://gcdnb.pbrd.co/images/DOo2llUSBkXl.png?o=1)

### Currently implemented features as shown are:
- Refresh: Refreshes the list of installed mods. Should only be necessary if you manually move a mod into the mod folders.
- Patch: Patches the current modlist into the discord app.
- Restore: Restores the discord app to its original state.
- Choose File: Allows you to select a folder containing a mod.json file. This will install the mod.
- The url field and install button: Allows you to install a mod from a git repository. The url should be the url to the repository, not the mod.json file.

### Mod list
The mod list shows all installed mods. It shows the mod id, description, version, author and repository. Most of these are optional, so don't be surprised if they are missing. Each mod also contains an enabled/disabled toggle, which allows you to disable a mod without uninstalling it. This requires a patch to take effect. The mod list also contains a button to uninstall a mod, which removes all files related to the mod. This also requires a patch to take effect.

## Modding Framework

```bash
npm i -D discord-modding-framework
```

```ts
import { Mod } from 'discord-modding-framework';
import fs from 'fs';
import path from 'path';

// mod constructor takes the following arguments:
// (id: string, dependencies?: Dependency[], version?: string, repository?: string, author?: string, description?: string, homepage?: string);
// where dependencies are objects with an id, version and optional repository

const exampleMod = new Mod('example-mod', [], '1.0.0', undefined, 'Frodi', 'An example mod');
exampleMod.on('dom-ready', (mainWindow) => {
  // do stuff with the main window
});
exampleMod.once('dom-ready', (mainWindow) => {
  // do stuff with the main window
});
const modFolder = path.join(__dirname, 'example-mod');
const modFile = path.join(modFolder, 'mod.json');
if (!fs.existsSync(modFolder)) fs.mkdirSync(modFolder);
fs.writeFileSync(modFile, JSON.stringify(exampleMod.getJSON(), null, 2));
```

This new mod can then be installed by the mod manager. If you keep your mod in a git repository, you can also install it directly from there as long as mod.json is in the root of the repository.

Here is a real mod as an example: [frodi-karlsson-modpack](https://github.com/frodi-karlsson/frodi-karlsson-modpack)

# Development

The mod manager is built using electron. I've intentionally kept the dependencies to a minimum, so there's no react or anything like that. The UI is built using vanilla HTML, CSS and JS.

Clone the repository and run `npm i` to install dependencies.

Use `npm run build` to build the electron app.
Use `npm run serve` to build and run the electron app.



