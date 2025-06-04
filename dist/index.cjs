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
var import_chalk = __toESM(require("chalk"), 1);
var import_cli_table3 = __toESM(require("cli-table3"), 1);
var import_nspell = __toESM(require("nspell"), 1);
var import_dictionary_en = __toESM(require("dictionary-en"), 1);
var import_typescript_estree = require("@typescript-eslint/typescript-estree");
var import_meta = {};
var __dirname;
try {
  const __filename = (0, import_url.fileURLToPath)(import_meta.url);
  __dirname = import_path.default.dirname(__filename);
} catch (e) {
  __dirname = import_path.default.resolve();
}
var predefinedWhitelist = /* @__PURE__ */ new Set([
  "eslint",
  "typescript",
  "nodejs",
  "cli",
  "nspell",
  "jsx",
  "tsx",
  "api",
  "json",
  "http",
  "https",
  "uuid",
  "npm",
  "jsx",
  "ts",
  "html",
  "css",
  "scss",
  "sass",
  "less",
  "url",
  "js",
  "tsconfig",
  "config",
  "cli",
  "estree",
  "http",
  "www",
  "utf"
]);
var dynamicWhitelist = /* @__PURE__ */ new Set();
var loadConfig = (rootDir) => {
  const configPath = import_path.default.join(rootDir, "typo-checker.config.json");
  const packageJsonPath = import_path.default.join(rootDir, "package.json");
  let config = {};
  if (import_fs.default.existsSync(configPath)) {
    try {
      config = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
    } catch (err) {
      console.error(import_chalk.default.red("Error parsing typo-checker.config.json"), err);
    }
  } else if (import_fs.default.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(import_fs.default.readFileSync(packageJsonPath, "utf8"));
      if (pkg.typoChecker) {
        config = pkg.typoChecker;
      }
    } catch (err) {
      console.error(import_chalk.default.red("Error parsing package.json"), err);
    }
  }
  dynamicWhitelist = new Set(
    [
      ...predefinedWhitelist,
      ...Array.isArray(config.whitelist) ? config.whitelist.map((w) => w.toLowerCase()) : []
    ].map((w) => w.toLowerCase())
  );
};
var splitCompound = (word) => word.split(/[_\s]+/).flatMap((seg) => seg.split(/(?=[A-Z])|[^a-zA-Z]/).filter(Boolean));
var walkAST = (node, cb) => {
  if (!node || typeof node !== "object") return;
  cb(node);
  for (const key in node) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((c) => (c == null ? void 0 : c.type) && walkAST(c, cb));
    } else if (child == null ? void 0 : child.type) {
      walkAST(child, cb);
    }
  }
};
var parseCode = (code) => {
  try {
    return (0, import_typescript_estree.parse)(code, { loc: true, jsx: true, useJSXTextNode: true });
  } catch (e) {
    return null;
  }
};
var extractWordsFromNode = (node) => {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value.split(/[^a-zA-Z]+/).filter(Boolean);
  }
  return [];
};
var extractWordsFromCode = (code) => {
  const ast = parseCode(code);
  if (!ast) return [];
  const words = [];
  walkAST(ast, (node) => words.push(...extractWordsFromNode(node)));
  return words;
};
var loadNspell = () => __async(null, null, function* () {
  const dict = yield import_dictionary_en.default;
  return (0, import_nspell.default)(dict);
});
var isUsUkVariant = (word1, word2) => {
  if (word1 === word2) return false;
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();
  const variants = [
    [/(.)our$/, /(.)or$/],
    // colour/color
    [/(.)ise$/, /(.)ize$/],
    // organise/organize
    [/(.)yse$/, /(.)yze$/],
    // analyse/analyze
    [/(.)re$/, /(.)er$/],
    // centre/center
    [/(.)ll$/, /(.)l$/],
    // travelling/traveling
    [/(.)ogue$/, /(.)og$/],
    // catalogue/catalog
    [/(.)ce$/, /(.)se$/],
    // defence/defense
    [/(.)ence$/, /(.)ense$/],
    [/(.)vouri$/, /(.)vori$/]
    // favourite/favorite
  ];
  for (const [uk, us] of variants) {
    if (uk.test(w1) && us.test(w2) || us.test(w1) && uk.test(w2)) {
      const stemW1 = w1.replace(uk, "$1");
      const stemW2 = w2.replace(us, "$1");
      if (stemW1 === stemW2) return true;
    }
  }
  return false;
};
var isValidWord = (word, projectDict, spell) => {
  const lower = word.toLowerCase();
  if (lower.length <= 2 || /^[A-Z]+$/.test(word) || // Acronyms
  projectDict.has(lower) || dynamicWhitelist.has(lower)) {
    return false;
  }
  const suggestions = spell.suggest(lower);
  const suggestionSet = new Set(suggestions.map((s) => s.toLowerCase()));
  if (spell.correct(lower) || suggestionSet.has(lower)) {
    return false;
  }
  return true;
};
var extractTyposFromCode = (code, spell, projectDict, file) => {
  const ast = parseCode(code);
  if (!ast) {
    console.error(import_chalk.default.red(`Parsing error in ${file}`));
    return [];
  }
  const typos = [];
  walkAST(ast, (node) => {
    if (node.type === "Literal" && typeof node.value === "string") {
      const raw = node.value;
      if (typeof raw !== "string") return;
      for (const part of splitCompound(raw).filter(
        (w) => /^[a-zA-Z]+$/.test(w)
      )) {
        const lower = part.toLowerCase();
        if (isValidWord(part, projectDict, spell)) {
          let suggestions = spell.suggest(lower).filter((s) => s.toLowerCase() !== lower);
          suggestions = suggestions.filter(
            (s) => !isUsUkVariant(lower, s.toLowerCase())
          );
          if (suggestions.length > 0) {
            typos.push({
              file,
              line: node.loc.start.line,
              word: part,
              suggestions
            });
          }
        }
      }
    }
  });
  return typos;
};
var readFileSyncSafe = (file) => {
  try {
    return import_fs.default.readFileSync(file, "utf8");
  } catch (e) {
    return "";
  }
};
var buildProjectDictionary = (files, spell) => {
  const dict = /* @__PURE__ */ new Set();
  for (const file of files) {
    const code = readFileSyncSafe(file);
    for (const word of extractWordsFromCode(code)) {
      const lower = word.toLowerCase();
      if (lower.length > 2 && /^[a-zA-Z]+$/.test(lower) && spell.correct(lower)) {
        dict.add(lower);
      }
    }
  }
  return dict;
};
var displayTypos = (typos) => {
  const table = new import_cli_table3.default({
    head: ["File", "Line", "Word", "Suggestions"],
    colWidths: [40, 10, 20, 40]
  });
  typos.forEach(
    ({ file, line, word, suggestions }) => table.push([file, line, word, suggestions.join(", ")])
  );
  console.log(import_chalk.default.yellow("\u26A0\uFE0F Typos found:\n"));
  console.log(table.toString());
  console.log(import_chalk.default.redBright(`
\u274C Total typos: ${typos.length}
`));
};
var displaySuccess = (fileCount) => {
  const table = new import_cli_table3.default({
    head: [import_chalk.default.green("\u2705 Typo Check Passed")]
  });
  table.push(["Checked Files: " + fileCount]);
  table.push(["Total Typos: 0"]);
  table.push(["Accuracy: 100%"]);
  console.log(table.toString());
};
var runChecker = (rootDir) => __async(null, null, function* () {
  loadConfig(rootDir);
  const files = yield (0, import_fast_glob.default)(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"]
  });
  console.log(
    import_chalk.default.blue(
      `\u{1F50D} Building internal dictionary from ${files.length} files...
`
    )
  );
  const spell = yield loadNspell();
  const projectDict = buildProjectDictionary(files, spell);
  const typos = files.flatMap(
    (file) => extractTyposFromCode(
      readFileSyncSafe(file),
      spell,
      projectDict,
      import_path.default.relative(rootDir, file)
    )
  );
  typos.length ? displayTypos(typos) : displaySuccess(files.length);
});
var checker_default = runChecker;

// bin/index.ts
var projectRoot = process.cwd();
checker_default(projectRoot);
