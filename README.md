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

If you aren't a developer, find the latest release [here](https://github.com/frodi-karlsson/discord-mod-manager/releases/latest).
Otherwise, see the development section below.

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

# Development

The mod manager is built using electron. I've intentionally kept the dependencies to a minimum, so there's no react or anything like that. The UI is built using vanilla HTML, CSS and JS.

Clone the repository and run `npm i` to install dependencies.

Use `npm run build` to build the electron app.
Use `npm run serve` to build and run the electron app.



