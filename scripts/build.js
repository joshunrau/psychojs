// @ts-check

import module from "node:module";
import path from "node:path";

import esbuild from "esbuild";
import { glsl } from "esbuild-plugin-glsl";

const require = module.createRequire(import.meta.url);

const { version } = require("../package.json");

const outdir = path.resolve(import.meta.dirname, "../out");

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
  outfile: `./${outdir}/psychojs-${version}.js`,
  plugins: [
    glsl({
      minify: true,
    }),
  ],
  sourcemap: true,
  target: ["es2017", "node14"],
});
