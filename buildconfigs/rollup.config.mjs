import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import uglify from "@lopatnov/rollup-plugin-uglify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Building for electron:", process.env.IS_ELECTRON === "true");

const build = path.join(__dirname, "../build");
if (!fs.existsSync(build)) {
  fs.mkdirSync(build);
}

console.log("Build folder created");

const isElectron = process.env.IS_ELECTRON === "true";
if (isElectron) {
  console.log("Building for electron");
  const projectPackageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")
  );
  const packageJson = {
    main: "app/app.cjs",
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

  fs.writeFileSync(path.join(build, "package.json"), packageJsonString);

  console.log("Package json written");

  execSync(`cd ${build} && npm install --production`, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(stdout);
    console.log(stderr);
  });

  const assets = path.join(__dirname, "../assets");
  const buildAssets = path.join(build, "assets");
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

const templates = path.join(__dirname, "../src/app/templates");
const buildApp = path.join(build, "app");
if (!fs.existsSync(buildApp)) {
  fs.mkdirSync(buildApp, { recursive: true });
}
execSync(`cp -r ${templates} ${buildApp}`, (err, stdout, stderr) => {
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
    external: [
      "electron",
      "fs",
      "path",
      "https",
      "adm-zip",
      "@electron/asar",
      "typescript",
      "temp",
    ],
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
    external: [
      "electron",
      "fs",
      "path",
      "https",
      "adm-zip",
      "@electron/asar",
      "typescript",
      "temp",
    ],
  };
}

const config = [
  // this is the electron app
  getTypesConfig("src/types.d.ts", "build/types.d.ts"),
  getElectronConfig("src/app/app.ts", "build/app/app.cjs"),
  getElectronConfig(
    "src/app/discord-patcher.ts",
    "build/app/discord-patcher.cjs"
  ),
  getElectronConfig("src/app/preload.js", "build/app/preload.js"),
  getElectronConfig("src/util/files.ts", "build/util/files.cjs"),
  getElectronConfig("src/util/download.ts", "build/util/download.cjs"),
  // this is the types installed by npm. First esm
  getNPMPackageConfig("src/mod/mod.ts", "dist/mod/mod.mjs"),
  getNPMPackageConfig("src/index.ts", "dist/index.mjs"),
  // then cjs
  getNPMPackageConfig("src/mod/mod.ts", "dist/mod/mod.cjs", true),
  getNPMPackageConfig("src/index.ts", "dist/index.cjs", true),
];

console.log("Config created", config);

export default config;
