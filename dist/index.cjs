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
  __dirname = __dirname || import_path.default.resolve();
}
var splitCompound = (word) => {
  return word.split(/[_\s]+/).flatMap(
    (segment) => segment.split(/(?=[A-Z])|[^a-zA-Z]/).filter(Boolean)
  );
};
function walk(node, callback) {
  callback(node);
  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c.type === "string") walk(c, callback);
        }
      } else if (child && typeof child.type === "string") {
        walk(child, callback);
      }
    }
  }
}
var extractWordsFromCode = (code) => {
  const words = [];
  try {
    const ast = (0, import_typescript_estree.parse)(code, {
      loc: true,
      jsx: true,
      useJSXTextNode: true
    });
    walk(ast, (node) => {
      if (node.type === "Identifier") {
        words.push(...splitCompound(node.name));
      } else if (node.type === "Literal" && typeof node.value === "string") {
        const literalWords = node.value.split(/[^a-zA-Z]+/);
        words.push(...literalWords.filter(Boolean));
      }
    });
  } catch (e) {
  }
  return words;
};
var loadNspell = () => __async(null, null, function* () {
  const dict = yield import_dictionary_en.default;
  return (0, import_nspell.default)(dict);
});
var extractTyposFromCode = (code, spell, projectDict, file) => {
  const typos = [];
  try {
    const ast = (0, import_typescript_estree.parse)(code, {
      loc: true,
      jsx: true,
      useJSXTextNode: true
    });
    walk(ast, (node) => {
      if (node.type === "Identifier" || node.type === "Literal" && typeof node.value === "string") {
        const raw = node.name || node.value;
        const parts = typeof raw === "string" ? splitCompound(raw).filter((w) => /^[a-zA-Z]+$/.test(w)) : [];
        for (const part of parts) {
          const lower = part.toLowerCase();
          if (!lower || lower.length <= 2 || /^[A-Z]+$/.test(part)) continue;
          if (projectDict.has(lower)) continue;
          if (!spell.correct(lower)) {
            const suggestions = spell.suggest(lower);
            typos.push({
              file,
              line: node.loc.start.line,
              word: part,
              suggestions
            });
          }
        }
      }
    });
  } catch (err) {
    console.error(import_chalk.default.red(`Parsing error in ${file}: ${err.message}`));
  }
  return typos;
};
var runChecker = (rootDir) => __async(null, null, function* () {
  const files = yield (0, import_fast_glob.default)(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"]
  });
  console.log(
    import_chalk.default.blue(`\u{1F50D} Building internal dictionary from ${files.length} files...
`)
  );
  const projectDict = /* @__PURE__ */ new Set();
  for (const file of files) {
    const code = import_fs.default.readFileSync(file, "utf8");
    const words = extractWordsFromCode(code);
    for (const word of words) {
      const cleaned = word.toLowerCase();
      if (cleaned && /^[a-zA-Z]+$/.test(cleaned)) {
        projectDict.add(cleaned);
      }
    }
  }
  const spell = yield loadNspell();
  const allTypos = [];
  for (const file of files) {
    const code = import_fs.default.readFileSync(file, "utf8");
    const typos = extractTyposFromCode(
      code,
      spell,
      projectDict,
      import_path.default.relative(rootDir, file)
    );
    allTypos.push(...typos);
  }
  if (allTypos.length > 0) {
    const typoTable = new import_cli_table3.default({
      head: ["File", "Line", "Word", "Suggestions"],
      colWidths: [40, 10, 20, 40]
    });
    for (const { file, line, word, suggestions } of allTypos) {
      typoTable.push([file, line, word, suggestions.join(", ")]);
    }
    console.log(import_chalk.default.yellow("\u26A0\uFE0F  Typos found:\n"));
    console.log(typoTable.toString());
    console.log(import_chalk.default.redBright(`
\u274C Total typos: ${allTypos.length}
`));
  } else {
    const successTable = new import_cli_table3.default({
      head: [import_chalk.default.green("\u2705 Typo Check Passed")]
    });
    successTable.push(["Checked Files: " + files.length]);
    successTable.push(["Total Typos: 0"]);
    successTable.push(["Accuracy: 100%"]);
    console.log(successTable.toString());
  }
});
var checker_default = runChecker;

// bin/index.ts
var projectRoot = process.cwd();
checker_default(projectRoot);
