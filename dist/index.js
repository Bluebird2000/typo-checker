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
import * as acorn from "acorn";
import leven from "leven";
import chalk from "chalk";
var import_meta = {};
var __dirname;
try {
  const __filename = fileURLToPath(import_meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  __dirname = __dirname || path.resolve();
}
var readDictionary = () => {
  const words = fs.readFileSync(
    path.join(__dirname, "dictionary.txt"),
    "utf8"
  );
  return new Set(
    words.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean)
  );
};
var isLikelyTypo = (word, dictionary) => {
  const matches = [];
  for (const dictWord of dictionary) {
    const distance = leven(word, dictWord);
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
    console.error(chalk.red(`Failed to parse code: ${e.message}`));
  }
  return { identifiers, strings };
};
var runChecker = (rootDir) => __async(null, null, function* () {
  const dictionary = readDictionary();
  const files = yield fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"]
  });
  console.log(chalk.blue(`Checking for typos in ${files.length} files...
`));
  let typoFound = false;
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const { identifiers, strings } = extractIdentifiersAndStrings(code);
    for (const word of [...identifiers, ...strings]) {
      const lower = word.toLowerCase();
      if (!dictionary.has(lower)) {
        const suggestions = isLikelyTypo(lower, dictionary);
        if (suggestions) {
          typoFound = true;
          console.log(
            chalk.yellow(
              `Possible typo in "${path.relative(
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
    console.log(chalk.green("\u2705 No typos found in identifiers or strings."));
  }
});
var checker_default = runChecker;

// bin/index.ts
var projectRoot = process.cwd();
checker_default(projectRoot);
