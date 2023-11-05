import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import uglify from "@lopatnov/rollup-plugin-uglify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Building for electron:", process.env.IS_ELECTRON === "true");

const build = path.join(__dirname, "build");
if (!fs.existsSync(build)) {
  fs.mkdirSync(build);
}

console.log("Build folder created");

const isElectron = process.env.IS_ELECTRON === "true";
if (isElectron) {
  console.log("Building for electron");
  const projectPackageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json"), "utf-8")
  );
  const packageJson = {
    main: "app.cjs",
    description: "A mod manager for discord",
    author: projectPackageJson.author,
    version: projectPackageJson.version,
    license: projectPackageJson.license,
    name: "discord-mod-manager",
    scripts: {
      start: "electron .",
    },
    dependencies: {},
    devDependencies: {},
  };

  packageJson.devDependencies["electron"] =
    projectPackageJson.dependencies["electron"];
  Object.keys(projectPackageJson.dependencies).forEach((key) => {
    if (key !== "electron") {
      packageJson.dependencies[key] = projectPackageJson.dependencies[key];
    }
  });

  const packageJsonString = JSON.stringify(packageJson, null, 2);

  if (!fs.existsSync(path.join(__dirname, "build"))) {
    fs.mkdirSync(path.join(__dirname, "build"));
  }
  fs.writeFileSync(
    path.join(__dirname, "build", "package.json"),
    packageJsonString
  );

  console.log("Package json written");

  // // copy node_modules
  // const nodeModules = path.join(__dirname, "node_modules");
  // const buildNodeModules = path.join(__dirname, "build", "node_modules");
  // if (!fs.existsSync(buildNodeModules)) {
  //   fs.mkdirSync(buildNodeModules);
  // }
  // execSync(
  //   `cp -r ${nodeModules} ${buildNodeModules}`,
  //   (err, stdout, stderr) => {
  //     if (err) {
  //       console.error(err);
  //       return;
  //     }
  //     console.log(stdout);
  //     console.log(stderr);
  //   }
  // );

  execSync(
    `cd ${path.join(__dirname, "build")} && npm install --production`,
    (err, stdout, stderr) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(stdout);
      console.log(stderr);
    }
  );

  const assets = path.join(__dirname, "assets");
  const buildAssets = path.join(__dirname, "build", "assets");
  if (!fs.existsSync(buildAssets)) {
    fs.mkdirSync(buildAssets);
  }
  execSync(`cp -r ${assets} ${buildAssets}`, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(stdout);
    console.log(stderr);
  });

  console.log("Electron specific files copied");
}

const templates = path.join(__dirname, "templates");
if (!fs.existsSync(templates)) {
  fs.mkdirSync(templates);
}
execSync(`cp -r ${templates} ${build}`, (err, stdout, stderr) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(stdout);
  console.log(stderr);
});

console.log("Templates copied");

function getTypesConfig(input, output) {
  return {
    input,
    output: {
      file: output,
      format: "cjs",
    },
    plugins: [dts()],
  };
}

function getElectronConfig(input, output) {
  return {
    input,
    output: {
      file: output,
      format: "cjs",
    },
    plugins: [typescript(), uglify()],
  };
}

function getNPMPackageConfig(input, output, cjs = false) {
  return {
    input,
    output: {
      file: output,
      format: cjs ? "cjs" : "esm",
    },
    plugins: cjs ? [typescript()] : [typescript(), uglify()],
  };
}

const config = [
  getTypesConfig("src/types.d.ts", "build/types.d.ts"),
  getElectronConfig("src/mod.ts", "build/mod.cjs"),
  getElectronConfig("src/discord-patcher.ts", "build/discord-patcher.cjs"),
  getElectronConfig("src/app.ts", "build/app.cjs"),
  {
    // just kept this as cjs for now
    input: "src/preload.js",
    output: {
      file: "build/preload.js",
      format: "cjs",
    },
  },
  // this is the types installed by npm. First esm
  getNPMPackageConfig("src/mod.ts", "dist/mod.mjs"),
  getNPMPackageConfig("src/index.ts", "dist/index.mjs"),
  // then cjs
  getNPMPackageConfig("src/mod.ts", "dist/mod.cjs", true),
  getNPMPackageConfig("src/index.ts", "dist/index.cjs", true),
];

console.log("Config created", config);

export default config;
