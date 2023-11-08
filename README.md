# Introduction

This repository serves as two things:
- A patcher for discord, allowing for easy installation of modifications to the app
- A package for providing an easy way to make mods in a format supported by the patcher

## patcher

The patcher allows running modifications to the discord app. It does this by patching the discord app using asar.
Mods are JSON files that contain callbacks for various events, such as when the DOM is ready, when the app is ready, etc.
They also contain mod metadata.

# Usage

## Patcher

If you aren't a developer, find the latest release [here](https://github.com/frodi-karlsson/discord-mod-manager/releases/latest). I also recommend reading the "Using the patcher" section below.

Otherwise, see the development section below under the "Using the patcher" section.


### Using the patcher

### Currently implemented features as shown are:
- Refresh: Refreshes the list of installed mods. Should only be necessary if you manually move a mod into the mod folders.
- Patch: Patches the current modlist into the discord app.
- Restore: Restores the discord app to its original state.
- Install: Allows you to select a folder containing a mod.json file. This will install the mod.
- The url field and install button: Allows you to install a mod from a git repository. The url should be the url to the repository, not the mod.json file.

### Mod list
The mod list shows all installed mods. It shows the mod id, description, version, author and repository. Most of these are optional, so don't be surprised if they are missing. Each mod also contains an enabled/disabled toggle, which allows you to disable a mod without uninstalling it. This requires a patch to take effect. The mod list also contains a button to uninstall a mod, which removes all files related to the mod. This also requires a patch to take effect.
At the top left of every mod you can see a little arrow. Clicking this expands/collapses the detailed view that includes configurations, dependencies and the full mod description.

### Configuration
Mod developers now have the option of including configurations. These come with default values, so you probably won't have to touch them unless you feel adventurous or the mod description / repository gives you instructions to do so.

## Modding Framework

```bash
npm i -D discord-modding-framework
```

```ts
import { Mod } from 'discord-modding-framework';
import fs from 'fs';
import path from 'path';

// mod constructor takes the following arguments:
// obj: {id: string, dependencies?: Dependency[], version?: string, repository?: string, author?: string, description?: string, homepage?: string, fullDescription?: string, config?: ConfigurationField[]}
// where dependencies are objects with an id, version and optional repository and
// configuration fields are objects with a name, description, type and optional default value.
// the type can be one of 'boolean', 'string', 'number'.

const modOpts = {
  id: 'example-mod',
  version: '1.0.0',
  config: [
    {
      name: 'enabled',
      description: 'Whether the mod is enabled',
      type: 'boolean',
      defaultValue: true
    },
    {
      name: 'message',
      description: 'The message to log to the console',
      type: 'string',
      defaultValue: 'Hello world!'
    }
  ]
}
const exampleMod = new Mod(modOpts);
exampleMod.on('dom-ready', (mainWindow) => {
  // do stuff with the main window
});
exampleMod.once('dom-ready', (mainWindow, configuration) => {
  // do stuff with the main window or configuration
  // the configuration is a map of your configuration names to their (value ?? default value)s
  // configuration is also available inside the window through window.modConfig[configName] so you can do something like:
  if(configuration.get('enabled')) {
    mainWindow.webContents.executeJavaScript(`
      console.log(window.modConfig['message'])
    `);
  }
  // Beware! This is not fully tested, but it is in the works.
});
// There is more stuff yet, hang in there:
exampleMod.on('ready', Mod.getCallbackFromFile(path.join(__dirname, 'ready.js'))); // this will run the code in ready.js in the window when the app is ready
const modFile = path.join(__dirname 'mod.json');
// this will create a mod.json file in the root of your project. Perfect for the install from repository feature of the patcher.
fs.writeFileSync(modFile, JSON.stringify(exampleMod.getJSON(), null, 2));
```

Let's check out "ready.js" as well:

```js
const msg = window.modConfig['message'];
// make sure not to try ddoing something like this:
// if (!msg) return;
// because the code is run in the window where it cannot return.
// instead, do something like this:
function run() {
  if (!msg) return;
  console.log(msg);
}
run();

// or this:
if (msg) {
  console.log(msg);
}
```
As you can see, it's not very complicated.

This new mod can then be installed by the patcher. If you keep your mod in a git repository, you can install it directly from there as long as mod.json is in the root of the repository, otherwise you can navigate to the folder containing mod.json and install it from there using the file picker dialog.

Here is a real mod as an example that uses configs: [frodi-karlsson-modpack](https://github.com/frodi-karlsson/frodi-karlsson-modpack)

# Development

The patcher is built using electron. I've tried to keep the app small, so there's no react or anything like that. The UI is built using vanilla HTML, CSS and JS.

Clone the repository and run `npm i` to install dependencies.

Use `npm run build` to build the electron app.
Use `npm run serve` to build and run the electron app.



