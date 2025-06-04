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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import chalk from "chalk";
import Table from "cli-table3";
import nspell from "nspell";
import dictionaryEn from "dictionary-en";
import { parse } from "@typescript-eslint/typescript-estree";
var import_meta = {};
var __dirname;
try {
  const __filename = fileURLToPath(import_meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  __dirname = path.resolve();
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
  "utf",
  "skia",
  "utils",
  "shopify",
  "react",
  "redux",
  "reactjs",
  "tanstack",
  "src",
  "react-query",
  "png",
  "jpg",
  "svg",
  "util",
  "redux",
  "debounce",
  "colours",
  "naira",
  "enquiry",
  "telco",
  "otp",
  "rgba",
  "dayjs",
  "glo",
  "mtn",
  "airtel",
  "etisalat",
  "9mobile"
]);
var dynamicWhitelist = /* @__PURE__ */ new Set();
var loadConfig = (rootDir) => {
  const configPath = path.join(rootDir, "typo-checker.config.json");
  const packageJsonPath = path.join(rootDir, "package.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (err) {
      console.error(chalk.red("Error parsing typo-checker.config.json"), err);
    }
  } else if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (pkg.typoChecker) {
        config = pkg.typoChecker;
      }
    } catch (err) {
      console.error(chalk.red("Error parsing package.json"), err);
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
    return parse(code, { loc: true, jsx: true, useJSXTextNode: true });
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
  const dict = yield dictionaryEn;
  const aff = Buffer.from(dict.aff);
  const dic = Buffer.from(dict.dic);
  return nspell(aff, dic);
});
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
  if (suggestions.length > 0 && areAllSuggestionsVariants(word, suggestions, spell)) {
    return false;
  }
  return true;
};
var areAllSuggestionsVariants = (word, suggestions, spell) => {
  const variants = new Set(suggestions.map((s) => s.toLowerCase()));
  variants.add(word.toLowerCase());
  for (const variant of variants) {
    if (!spell.correct(variant)) {
      return false;
    }
  }
  return true;
};
var extractTyposFromCode = (code, spell, projectDict, file) => {
  const ast = parseCode(code);
  if (!ast) {
    console.error(chalk.red(`Parsing error in ${file}`));
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
          const suggestions = spell.suggest(lower).filter((s) => s.toLowerCase() !== lower);
          if (suggestions.length > 0 && areAllSuggestionsVariants(part, suggestions, spell)) {
            return;
          }
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
    return fs.readFileSync(file, "utf8");
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
  const table = new Table({
    head: ["File", "Line", "Word", "Suggestions"],
    colWidths: [40, 10, 20, 40]
  });
  typos.forEach(
    ({ file, line, word, suggestions }) => table.push([file, line, word, suggestions.join(", ")])
  );
  console.log(chalk.yellowBright.bold("\u26A0\uFE0F Typos found:\n"));
  console.log(table.toString());
  console.log(chalk.redBright.bold(`
\u274C Total typos: ${typos.length}
`));
};
var displaySuccess = (fileCount) => {
  const table = new Table({
    head: [chalk.greenBright.bold("\u2705 Typo Check Passed")]
  });
  table.push(["Checked Files: " + fileCount]);
  table.push(["Total Typos: 0"]);
  table.push(["Accuracy: 100%"]);
  console.log(table.toString());
};
var shouldIgnoreFile = (filePath, rootDir) => {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
  const ignoredFiles = /* @__PURE__ */ new Set([
    "babel.config.js",
    "babel.config.ts",
    "metro.config.js",
    "metro.config.ts",
    "styles.ts",
    "styles.js",
    "config.js",
    "config.ts",
    "store.ts",
    "store.js",
    "colours.ts",
    "colours.js",
    "theme.ts",
    "theme.js"
  ]);
  const baseName = path.basename(relPath).toLowerCase();
  if (ignoredFiles.has(baseName)) {
    return true;
  }
  const pathParts = relPath.toLowerCase().split("/");
  if (pathParts.some((part) => part.includes("asset"))) {
    return true;
  }
  return false;
};
var runChecker = (rootDir) => __async(null, null, function* () {
  loadConfig(rootDir);
  const allFiles = yield fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"]
  });
  const files = allFiles.filter((file) => !shouldIgnoreFile(file, rootDir));
  console.log(
    chalk.blueBright.bold(
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
      path.relative(rootDir, file)
    )
  );
  typos.length ? displayTypos(typos) : displaySuccess(files.length);
});
var checker_default = runChecker;

export {
  checker_default
};
