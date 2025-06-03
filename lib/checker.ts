import fs from "fs";
import path, {dirname} from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import * as acorn from "acorn";
import leven from "leven";
import chalk from "chalk";

import type { Node } from "acorn";
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

let __dirname;
try {
  // Works in ESM
  const __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch {
  // Fallback for CJS
  __dirname = __dirname || path.resolve();
}

type Dictionary = Set<string>;

const readDictionary = (): Dictionary => {
  const words = fs.readFileSync(
    path.join(__dirname, "../dictionary.txt"),
    "utf8"
  );
  return new Set(
    words
      .split(/\r?\n/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)
  );
};

const isLikelyTypo = (word: string, dictionary: Dictionary): string[] | null => {
  const matches: string[] = [];
  for (const dictWord of dictionary) {
    const distance = leven(word, dictWord);
    if (distance > 0 && distance <= 2) {
      matches.push(dictWord);
    }
  }
  return matches.length ? matches : null;
};

const extractIdentifiersAndStrings = (code: string): {
  identifiers: Set<string>;
  strings: Set<string>;
} => {
  const identifiers = new Set<string>();
  const strings = new Set<string>();

  try {
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    }) as Node;

    const walk = (node: any): void => {
      if (!node || typeof node !== "object") return;

      switch (node.type) {
        case "VariableDeclarator":
          if (node.id?.name) identifiers.add(node.id.name);
          break;
        case "FunctionDeclaration":
          if (node.id?.name) identifiers.add(node.id.name);
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
  } catch (e: any) {
    console.error(chalk.red(`Failed to parse code: ${e.message}`));
  }

  return { identifiers, strings };
};

const runChecker = async (rootDir: string): Promise<void> => {
  const dictionary = readDictionary();
  const files = await fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"],
  });

  console.log(chalk.blue(`Checking for typos in ${files.length} files...\n`));
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
              )}": "${word}" → Suggestions: ${suggestions.join(", ")}`
            )
          );
        }
      }
    }
  }

  if (!typoFound) {
    console.log(chalk.green("✅ No typos found in identifiers or strings."));
  }
};

export default runChecker;
