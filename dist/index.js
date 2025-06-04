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
import { fileURLToPath } from "url";
import fg from "fast-glob";
import chalk from "chalk";
import table from "cli-table3";
import nspell from "nspell";
import dictionaryEn from "dictionary-en";
import { parse } from "@typescript-eslint/typescript-estree";
var import_meta = {};
var __dirname;
try {
  const __filename = fileURLToPath(import_meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  __dirname = __dirname || path.resolve();
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
    const ast = parse(code, {
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
  const dict = yield dictionaryEn;
  return nspell(dict);
});
var extractTyposFromCode = (code, spell, projectDict, file) => {
  const typos = [];
  try {
    const ast = parse(code, {
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
    console.error(chalk.red(`Parsing error in ${file}: ${err.message}`));
  }
  return typos;
};
var runChecker = (rootDir) => __async(null, null, function* () {
  const files = yield fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"]
  });
  console.log(
    chalk.blue(`\u{1F50D} Building internal dictionary from ${files.length} files...
`)
  );
  const projectDict = /* @__PURE__ */ new Set();
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
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
    const code = fs.readFileSync(file, "utf8");
    const typos = extractTyposFromCode(
      code,
      spell,
      projectDict,
      path.relative(rootDir, file)
    );
    allTypos.push(...typos);
  }
  if (allTypos.length > 0) {
    const typoTable = new table({
      head: ["File", "Line", "Word", "Suggestions"],
      colWidths: [40, 10, 20, 40]
    });
    for (const { file, line, word, suggestions } of allTypos) {
      typoTable.push([file, line, word, suggestions.join(", ")]);
    }
    console.log(chalk.yellow("\u26A0\uFE0F  Typos found:\n"));
    console.log(typoTable.toString());
    console.log(chalk.redBright(`
\u274C Total typos: ${allTypos.length}
`));
  } else {
    const successTable = new table({
      head: [chalk.green("\u2705 Typo Check Passed")]
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
