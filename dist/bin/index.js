#!/usr/bin/env node
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
import readline from "readline";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import chalk from "chalk";
import Table from "cli-table3";
import nspell from "nspell";
import dictionaryEn from "dictionary-en";
import { parse } from "@typescript-eslint/typescript-estree";
import natural from "natural";
var import_meta = {};
var wordnet = new natural.WordNet();
var nounInflector = new natural.NounInflector();
var __dirname;
try {
  const __filename = fileURLToPath(import_meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  __dirname = path.resolve();
}
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
      ...Array.isArray(config.whitelist) ? config.whitelist.map((w) => w.toLowerCase()) : []
    ].map((w) => w.toLowerCase())
  );
};
var splitCompound = (word) => word.split(/[_\s]+/).flatMap((seg) => seg.split(/(?=[A-Z])|[^a-zA-Z]/).filter(Boolean));
var isLikelyCodeOrReserved = (word) => {
  if (!word) return false;
  const lower = word.toLowerCase();
  const urlLike = /^(https?:\/\/|www\.)|(\.[a-z]{2,6})(\/|$)/i;
  if (urlLike.test(word)) return true;
  if (/^[A-Z]{2,}$/.test(word)) return true;
  if (/[a-z]+[A-Z]+/.test(word) || /[A-Z]+[a-z]+/.test(word)) {
    return true;
  }
  if (/^[a-zA-Z0-9_$]+\(\)$/.test(word)) return true;
  if (/\.(js|ts|jsx|tsx|json|html|css|scss|sass|less|png|jpg|svg|gif|md|yml|yaml|lock)$/.test(
    lower
  ))
    return true;
  if (/^[a-z]{2,5}$/.test(lower)) return true;
  if (/\d/.test(word)) return true;
  if (/^[_\-]+|[_\-]+$/.test(word)) return true;
  return false;
};
var walkAST = (node, cb, parent = null) => {
  if (!node || typeof node !== "object") return;
  node.parent = parent;
  cb(node);
  for (const key in node) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((c) => {
        if (c == null ? void 0 : c.type) walkAST(c, cb, node);
      });
    } else if (child == null ? void 0 : child.type) {
      walkAST(child, cb, node);
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
var isWordInWordNet = (word) => {
  return new Promise((resolve) => {
    wordnet.lookup(word, (results) => {
      resolve(results.length > 0);
    });
  });
};
var isValidWord = (word, projectDict, spell) => __async(null, null, function* () {
  const lower = word.toLowerCase();
  if (lower.length <= 2 || /^[A-Z]+$/.test(word) || // Acronyms
  projectDict.has(lower) || dynamicWhitelist.has(lower)) {
    return false;
  }
  if (isLikelyCodeOrReserved(word)) return false;
  if (spell.correct(lower)) return false;
  const singular = nounInflector.singularize(lower);
  const plural = nounInflector.pluralize(lower);
  const [isBaseValid, isSingularValid, isPluralValid] = yield Promise.all([
    isWordInWordNet(lower),
    singular !== lower ? isWordInWordNet(singular) : Promise.resolve(false),
    plural !== lower ? isWordInWordNet(plural) : Promise.resolve(false)
  ]);
  if (isBaseValid || isSingularValid || isPluralValid) {
    return false;
  }
  const suggestions = spell.suggest(lower);
  const suggestionSet = new Set(suggestions.map((s) => s.toLowerCase()));
  if (suggestionSet.has(lower)) return false;
  if (suggestions.length > 0 && areAllSuggestionsVariants(word, suggestions, spell)) {
    return false;
  }
  return true;
});
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
var extractTyposFromCode = (code, spell, projectDict, file) => __async(null, null, function* () {
  const ast = parseCode(code);
  if (!ast) {
    console.error(chalk.red(`Parsing error in ${file}`));
    return [];
  }
  const typos = [];
  const promises = [];
  walkAST(ast, (node) => {
    if (node.type === "Literal" && typeof node.value === "string" && shouldCheckLiteral(node)) {
      const raw = node.value;
      const parts = splitCompound(raw).filter((w) => /^[a-zA-Z]+$/.test(w));
      parts.forEach((part) => {
        const check = () => __async(null, null, function* () {
          if (yield isValidWord(part, projectDict, spell)) {
            const suggestions = spell.suggest(part.toLowerCase()).filter((s) => s.toLowerCase() !== part.toLowerCase());
            if (suggestions.length > 0 && !areAllSuggestionsVariants(part, suggestions, spell)) {
              typos.push({
                file,
                line: node.loc.start.line,
                word: part,
                suggestions
              });
            }
          }
        });
        promises.push(check());
      });
    }
  });
  yield Promise.all(promises);
  return typos;
});
var shouldCheckLiteral = (node) => {
  const parent = node.parent;
  if (!parent) return true;
  if (parent.type === "Property" && parent.key === node && !parent.computed) {
    return false;
  }
  if ([
    "ImportDeclaration",
    "ExportNamedDeclaration",
    "ExportAllDeclaration"
  ].includes(parent.type)) {
    return false;
  }
  if (parent.type === "CallExpression" && parent.callee && ["require", "import"].includes(parent.callee.name)) {
    return false;
  }
  return true;
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
var saveTyposToMarkdown = (typos, outputPath = "typo-report.md") => {
  if (typos.length === 0) return;
  let content = `# \u{1F4DD} Typo Report

Generated on ${(/* @__PURE__ */ new Date()).toLocaleString()}

`;
  content += "| File | Line | Word | Suggestions |\n";
  content += "|------|------|------|-------------|\n";
  for (const { file, line, word, suggestions } of typos) {
    content += `| ${file} | ${line} | ${word} | ${suggestions.join(", ")} |
`;
  }
  content += `
> Tip: If some words are valid in your domain, consider adding them to the whitelist.
`;
  try {
    fs.writeFileSync(path.join(process.cwd(), outputPath), content, "utf8");
    console.log(chalk.green(`\u{1F4C4} Typo report saved to ${outputPath}`));
  } catch (err) {
    console.error(chalk.red("\u274C Failed to write typo report:"), err);
  }
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
    "metro.config.ts"
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
  const typoPromises = files.map(
    (file) => extractTyposFromCode(
      readFileSyncSafe(file),
      spell,
      projectDict,
      path.relative(rootDir, file)
    )
  );
  const typosArrays = yield Promise.all(typoPromises);
  const typos = typosArrays.flat();
  const hasTypos = typos.length > 0;
  hasTypos ? displayTypos(typos) : displaySuccess(files.length);
  if (hasTypos) {
    const userResponse = yield promptUser(
      "Do you want to save the report as Markdown? (y/n): "
    );
    if (["y", "yes"].includes(userResponse.toLowerCase())) {
      saveTyposToMarkdown(typos);
    } else {
      console.log(chalk.yellow("Markdown report not saved."));
    }
  } else {
    console.log(chalk.green("No typos found."));
  }
});
var promptUser = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};
var checker_default = runChecker;

// bin/index.ts
var projectRoot = process.cwd();
checker_default(projectRoot);
