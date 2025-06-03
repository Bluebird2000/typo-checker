#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// lib/checker.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_fast_glob = __toESM(require("fast-glob"), 1);
var acorn = __toESM(require("acorn"), 1);
var import_leven = __toESM(require("leven"), 1);
var import_chalk = __toESM(require("chalk"), 1);
var import_meta = {};
var __dirname;
try {
  const __filename = (0, import_url.fileURLToPath)(import_meta.url);
  __dirname = import_path.default.dirname(__filename);
} catch (e) {
  __dirname = __dirname || import_path.default.resolve();
}
var readDictionary = () => {
  const words = import_fs.default.readFileSync(
    import_path.default.join(__dirname, "dictionary.txt"),
    "utf8"
  );
  return new Set(
    words.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean)
  );
};
var isLikelyTypo = (word, dictionary) => {
  const matches = [];
  for (const dictWord of dictionary) {
    const distance = (0, import_leven.default)(word, dictWord);
    if (distance > 0 && distance <= 2) {
      matches.push(dictWord);
    }
  }
  return matches.length ? matches : null;
};
var extractIdentifiersAndStrings = (code) => {
  const identifiers = /* @__PURE__ */ new Set();
  const strings = /* @__PURE__ */ new Set();
  try {
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module"
    });
    const walk = (node) => {
      var _a, _b;
      if (!node || typeof node !== "object") return;
      switch (node.type) {
        case "VariableDeclarator":
          if ((_a = node.id) == null ? void 0 : _a.name) identifiers.add(node.id.name);
          break;
        case "FunctionDeclaration":
          if ((_b = node.id) == null ? void 0 : _b.name) identifiers.add(node.id.name);
          break;
        case "Literal":
          if (typeof node.value === "string") strings.add(node.value);
          break;
      }
      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(walk);
        } else if (typeof child === "object" && child !== null) {
          walk(child);
        }
      }
    };
    walk(ast);
  } catch (e) {
    console.error(import_chalk.default.red(`Failed to parse code: ${e.message}`));
  }
  return { identifiers, strings };
};
var runChecker = (rootDir) => __async(null, null, function* () {
  const dictionary = readDictionary();
  const files = yield (0, import_fast_glob.default)(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"]
  });
  console.log(import_chalk.default.blue(`Checking for typos in ${files.length} files...
`));
  let typoFound = false;
  for (const file of files) {
    const code = import_fs.default.readFileSync(file, "utf8");
    const { identifiers, strings } = extractIdentifiersAndStrings(code);
    for (const word of [...identifiers, ...strings]) {
      const lower = word.toLowerCase();
      if (!dictionary.has(lower)) {
        const suggestions = isLikelyTypo(lower, dictionary);
        if (suggestions) {
          typoFound = true;
          console.log(
            import_chalk.default.yellow(
              `Possible typo in "${import_path.default.relative(
                rootDir,
                file
              )}": "${word}" \u2192 Suggestions: ${suggestions.join(", ")}`
            )
          );
        }
      }
    }
  }
  if (!typoFound) {
    console.log(import_chalk.default.green("\u2705 No typos found in identifiers or strings."));
  }
});
var checker_default = runChecker;

// bin/index.ts
var projectRoot = process.cwd();
checker_default(projectRoot);
