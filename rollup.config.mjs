import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";

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
  const packageJson = JSON.stringify({
    main: "app.cjs",
    description: "A mod manager for discord",
    author: projectPackageJson.author,
    version: projectPackageJson.version,
    license: projectPackageJson.license,
    name: "discord-mod-manager",
    scripts: {
      start: "electron .",
    },
    devDependencies: projectPackageJson.devDependencies,
    dependencies: projectPackageJson.dependencies,
  });

  if (!fs.existsSync(path.join(__dirname, "build"))) {
    fs.mkdirSync(path.join(__dirname, "build"));
  }
  fs.writeFileSync(path.join(__dirname, "build", "package.json"), packageJson);

  console.log("Package json written");

  // copy node_modules
  const nodeModules = path.join(__dirname, "node_modules");
  const buildNodeModules = path.join(__dirname, "build", "node_modules");
  exec(`cp -r ${nodeModules} ${buildNodeModules}`, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(stdout);
    console.log(stderr);
  });

  console.log("Node modules copied");
}

const templates = path.join(__dirname, "templates");
exec(`cp -r ${templates} ${build}`, (err, stdout, stderr) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(stdout);
  console.log(stderr);
});

console.log("Templates copied");

export default [
  {
    input: "src/types.d.ts",
    output: {
      file: "build/types.d.ts",
      format: "cjs",
    },
    plugins: [dts()],
  },
  {
    input: "src/mod.ts",
    output: {
      file: "build/mod.cjs",
      format: "cjs",
    },
    plugins: [typescript()],
  },
  {
    input: "src/discord-patcher.ts",
    output: {
      file: "build/discord-patcher.cjs",
      format: "cjs",
    },
    plugins: [typescript()],
  },
  {
    input: "src/app.ts",
    output: {
      file: "build/app.cjs",
      format: "cjs",
    },
    plugins: [typescript()],
  },
  {
    input: "src/preload.js",
    output: {
      file: "build/preload.js",
      format: "cjs",
    },
  },
  // this is the types installed by npm. First esm
  {
    input: "src/mod.ts",
    output: {
      file: "dist/mod.mjs",
      format: "esm",
    },
    plugins: [typescript()],
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.mjs",
      format: "esm",
    },
    plugins: [typescript()],
  },
  // then cjs
  {
    input: "src/mod.ts",
    output: {
      file: "dist/mod.cjs",
      format: "cjs",
    },
    plugins: [typescript()],
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.cjs",
      format: "cjs",
    },
    plugins: [typescript()],
  },
];
