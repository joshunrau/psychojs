// @ts-check

import fs from "node:fs/promises";
import module from "node:module";
import path from "node:path";

import esbuild from "esbuild";
import { glsl } from "esbuild-plugin-glsl";

const require = module.createRequire(import.meta.url);

const { version } = require("../package.json");

const outdir = path.resolve(import.meta.dirname, "../out");

await fs.rm(outdir, { force: true, recursive: true });

await esbuild.build({
  banner: {
    js: `/*! For license information please see psychojs-${version}.js.LEGAL.txt */`,
  },
  bundle: true,
  entryPoints: [path.resolve(import.meta.dirname, "../src/index.js")],
  format: "esm",
  legalComments: "external",
  minifySyntax: true,
  minifyWhitespace: true,
  outfile: path.resolve(outdir, `psychojs-${version}.js`),
  plugins: [
    glsl({
      minify: true,
    }),
  ],
  sourcemap: true,
  target: ["es2017", "node14"],
});

await esbuild.build({
  bundle: true,
  entryPoints: [path.resolve(import.meta.dirname, "../src/index.css")],
  minify: true,
  outfile: path.resolve(outdir, `psychojs-${version}.css`),
});
