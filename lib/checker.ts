import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import chalk from "chalk";
import Table from "cli-table3";
import nspell from "nspell";
import dictionaryEn from "dictionary-en";
import { parse } from "@typescript-eslint/typescript-estree";

let __dirname: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch {
  __dirname = path.resolve();
}

type ProjectDictionary = Set<string>;

interface TypoEntry {
  file: string;
  line: number;
  word: string;
  suggestions: string[];
}

interface TypoCheckerConfig {
  whitelist?: string[];
}

// Predefined whitelist (all lowercase for consistency)
const predefinedWhitelist = new Set<string>([
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
]);

let dynamicWhitelist = new Set<string>();

const loadConfig = (rootDir: string): void => {
  const configPath = path.join(rootDir, "typo-checker.config.json");
  const packageJsonPath = path.join(rootDir, "package.json");

  let config: TypoCheckerConfig = {};

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
      ...(Array.isArray(config.whitelist)
        ? config.whitelist.map((w) => w.toLowerCase())
        : []),
    ].map((w) => w.toLowerCase())
  );
};

const splitCompound = (word: string): string[] =>
  word
    .split(/[_\s]+/)
    .flatMap((seg) => seg.split(/(?=[A-Z])|[^a-zA-Z]/).filter(Boolean));

const walkAST = (node: unknown, cb: (node: any) => void): void => {
  if (!node || typeof node !== "object") return;
  cb(node);
  for (const key in node) {
    const child = (node as any)[key];
    if (Array.isArray(child)) {
      child.forEach((c) => c?.type && walkAST(c, cb));
    } else if (child?.type) {
      walkAST(child, cb);
    }
  }
};

const parseCode = (code: string) => {
  try {
    return parse(code, { loc: true, jsx: true, useJSXTextNode: true });
  } catch {
    return null;
  }
};

const extractWordsFromNode = (node: any): string[] => {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value.split(/[^a-zA-Z]+/).filter(Boolean);
  }
  return [];
};

const extractWordsFromCode = (code: string): string[] => {
  const ast = parseCode(code);
  if (!ast) return [];

  const words: string[] = [];
  walkAST(ast, (node) => words.push(...extractWordsFromNode(node)));
  return words;
};

const loadNspell = async (): Promise<nspell> => {
  const dict = await dictionaryEn;
  return nspell(dict);
};

/**
 * Checks if two words differ only by common US/UK spelling variants.
 */
const isUsUkVariant = (word1: string, word2: string): boolean => {
  if (word1 === word2) return false;

  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();

  const variants: [RegExp, RegExp][] = [
    [/(.)our$/, /(.)or$/], // colour/color
    [/(.)ise$/, /(.)ize$/], // organise/organize
    [/(.)yse$/, /(.)yze$/], // analyse/analyze
    [/(.)re$/, /(.)er$/], // centre/center
    [/(.)ll$/, /(.)l$/], // travelling/traveling
    [/(.)ogue$/, /(.)og$/], // catalogue/catalog
    [/(.)ce$/, /(.)se$/], // defence/defense
    [/(.)ence$/, /(.)ense$/],
    [/(.)vouri$/, /(.)vori$/], // favourite/favorite
  ];

  for (const [uk, us] of variants) {
    if ((uk.test(w1) && us.test(w2)) || (us.test(w1) && uk.test(w2))) {
      // Remove endings and compare stems
      const stemW1 = w1.replace(uk, "$1");
      const stemW2 = w2.replace(us, "$1");
      if (stemW1 === stemW2) return true;
    }
  }

  return false;
};

const isValidWord = (
  word: string,
  projectDict: ProjectDictionary,
  spell: nspell
): boolean => {
  const lower = word.toLowerCase();
  if (
    lower.length <= 2 ||
    /^[A-Z]+$/.test(word) || // Acronyms
    projectDict.has(lower) ||
    dynamicWhitelist.has(lower)
  ) {
    return false;
  }

  // If the word is valid and suggestions contain itself, ignore
  const suggestions = spell.suggest(lower);
  const suggestionSet = new Set(suggestions.map((s) => s.toLowerCase()));
  if (spell.correct(lower) || suggestionSet.has(lower)) {
    return false;
  }

  return true;
};

const extractTyposFromCode = (
  code: string,
  spell: nspell,
  projectDict: ProjectDictionary,
  file: string
): TypoEntry[] => {
  const ast = parseCode(code);
  if (!ast) {
    console.error(chalk.red(`Parsing error in ${file}`));
    return [];
  }

  const typos: TypoEntry[] = [];
  walkAST(ast, (node) => {
    if (node.type === "Literal" && typeof node.value === "string") {
      const raw = node.value;
      if (typeof raw !== "string") return;

      for (const part of splitCompound(raw).filter((w) =>
        /^[a-zA-Z]+$/.test(w)
      )) {
        const lower = part.toLowerCase();

        if (isValidWord(part, projectDict, spell)) {
          // Get suggestions excluding exact match
          let suggestions = spell
            .suggest(lower)
            .filter((s) => s.toLowerCase() !== lower);

          // Filter out suggestions that are only US/UK variants of the word itself
          suggestions = suggestions.filter(
            (s) => !isUsUkVariant(lower, s.toLowerCase())
          );

          if (suggestions.length > 0) {
            typos.push({
              file,
              line: node.loc.start.line,
              word: part,
              suggestions,
            });
          }
        }
      }
    }
  });

  return typos;
};

const readFileSyncSafe = (file: string): string => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const buildProjectDictionary = (
  files: string[],
  spell: nspell
): ProjectDictionary => {
  const dict: ProjectDictionary = new Set();

  for (const file of files) {
    const code = readFileSyncSafe(file);
    for (const word of extractWordsFromCode(code)) {
      const lower = word.toLowerCase();
      if (
        lower.length > 2 &&
        /^[a-zA-Z]+$/.test(lower) &&
        spell.correct(lower)
      ) {
        dict.add(lower);
      }
    }
  }

  return dict;
};

const displayTypos = (typos: TypoEntry[]) => {
  const table = new Table({
    head: ["File", "Line", "Word", "Suggestions"],
    colWidths: [40, 10, 20, 40],
  });

  typos.forEach(({ file, line, word, suggestions }) =>
    table.push([file, line, word, suggestions.join(", ")])
  );

  console.log(chalk.yellow("⚠️ Typos found:\n"));
  console.log(table.toString());
  console.log(chalk.redBright(`\n❌ Total typos: ${typos.length}\n`));
};

const displaySuccess = (fileCount: number) => {
  const table = new Table({
    head: [chalk.green("✅ Typo Check Passed")],
  });
  table.push(["Checked Files: " + fileCount]);
  table.push(["Total Typos: 0"]);
  table.push(["Accuracy: 100%"]);
  console.log(table.toString());
};

const runChecker = async (rootDir: string): Promise<void> => {
  loadConfig(rootDir);

  const files = await fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"],
  });

  console.log(
    chalk.blue(
      `🔍 Building internal dictionary from ${files.length} files...\n`
    )
  );

  const spell = await loadNspell();
  const projectDict = buildProjectDictionary(files, spell);

  const typos: TypoEntry[] = files.flatMap((file) =>
    extractTyposFromCode(
      readFileSyncSafe(file),
      spell,
      projectDict,
      path.relative(rootDir, file)
    )
  );

  typos.length ? displayTypos(typos) : displaySuccess(files.length);
};

export default runChecker;
