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
var splitCompound = (word) => (
  // Only split on underscores, spaces or non-letter chars, NOT on uppercase letters inside words
  word.split(/[_\s]+|[^a-zA-Z]+/).filter(Boolean)
);
var isValidWord = (word, projectDict, spell) => {
  if (word.length <= 2) return false;
  if (/^[A-Z]{2,}$/.test(word)) return false;
  const lower = word.toLowerCase();
  if (projectDict.has(lower)) return false;
  if (spell.correct(lower)) return false;
  return true;
};
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
  if (node.type === "Identifier") {
    return splitCompound(node.name);
  }
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
var extractTyposFromCode = (code, spell, projectDict, file) => {
  const ast = parseCode(code);
  if (!ast) {
    console.error(import_chalk.default.red(`Parsing error in ${file}`));
    return [];
  }
  const typos = [];
  walkAST(ast, (node) => {
    var _a;
    if (node.type === "Identifier" || node.type === "Literal" && typeof node.value === "string") {
      const raw = (_a = node.name) != null ? _a : node.value;
      if (typeof raw !== "string") return;
      for (const part of splitCompound(raw)) {
        if (!/^[a-zA-Z]+$/.test(part)) continue;
        if (!isValidWord(part, projectDict, spell)) continue;
        const lower = part.toLowerCase();
        const suggestions = spell.suggest(lower);
        typos.push({
          file,
          line: node.loc.start.line,
          word: part,
          suggestions
        });
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
      if (!/^[a-zA-Z]+$/.test(word)) continue;
      if (word.length <= 2) continue;
      const lower = word.toLowerCase();
      if (spell.correct(lower)) {
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
  console.log(import_chalk.default.yellow("\u26A0\uFE0F  Typos found:\n"));
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
