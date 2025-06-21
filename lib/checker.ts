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
import { placeNames } from "./place-names";
import natural from "natural";

const wordnet = new natural.WordNet();
const nounInflector = new natural.NounInflector();

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
  // Add individual words from place names to handle compound names better
  "cross",
  "river",
  "akwa",
  "ibom",
  "new",
  "york",
  "south",
  "africa",
  "united",
  "states",
  "kingdom",
  "hong",
  "kong",
  "new",
  "zealand",
  "south",
  "dakota",
  "north",
  "carolina",
  "new",
  "hampshire",
  "new",
  "jersey",
  "new",
  "mexico",
  "west",
  "virginia",
  ...Array.from(placeNames).map((name) => name.toLowerCase()),
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

const isLikelyCodeOrReserved = (word: string): boolean => {
  if (!word) return false;

  const lower = word.toLowerCase();
  const urlLike = /^(https?:\/\/|www\.)|(\.[a-z]{2,6})(\/|$)/i;
  if (urlLike.test(word)) return true;

  if (/^[A-Z]{2,}$/.test(word)) return true;

  // Detect mixed-case identifiers (camelCase, PascalCase)
  // If word contains uppercase letters inside (not only first letter), treat as code
  if (/[a-z]+[A-Z]+/.test(word) || /[A-Z]+[a-z]+/.test(word)) {
    return true;
  }

  // Detect words that look like function calls (ending with parentheses)
  if (/^[a-zA-Z0-9_$]+\(\)$/.test(word)) return true;

  if (
    /\.(js|ts|jsx|tsx|json|html|css|scss|sass|less|png|jpg|svg|gif|md|yml|yaml|lock)$/.test(
      lower
    )
  )
    return true;
  if (/^[a-z]{2,5}$/.test(lower)) return true;

  // 7. Detect words with digits inside (version numbers, code identifiers)
  if (/\d/.test(word)) return true;

  // Words starting or ending with underscores or dashes likely code tokens
  if (/^[_\-]+|[_\-]+$/.test(word)) return true;

  // Default: treat as normal English word (check spelling)
  return false;
};

const walkAST = (
  node: any,
  cb: (node: any) => void,
  parent: any = null
): void => {
  if (!node || typeof node !== "object") return;
  node.parent = parent; // set parent manually

  cb(node);

  for (const key in node) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((c) => {
        if (c?.type) walkAST(c, cb, node);
      });
    } else if (child?.type) {
      walkAST(child, cb, node);
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
  // Convert aff and dic from Uint8Array to Buffer
  const aff = Buffer.from(dict.aff);
  const dic = Buffer.from(dict.dic);
  return nspell(aff, dic);
};

const isWordInWordNet = (word: string): Promise<boolean> => {
  return new Promise((resolve) => {
    wordnet.lookup(word, (results: any[]) => {
      resolve(results.length > 0);
    });
  });
};

const isValidWord = async (
  word: string,
  projectDict: ProjectDictionary,
  spell: nspell
): Promise<boolean> => {
  const lower = word.toLowerCase();

  // Ignore hex color codes and hex values (more comprehensive)
  if (
    /^#[0-9a-f]{3,6}$/i.test(word) || // CSS hex colors (#fff, #ffffff)
    /^0x[0-9a-f]+$/i.test(word) || // Hex literals (0xff, 0xffffff)
    /^[0-9a-f]{6,8}$/i.test(word) || // Hex without prefix (ffffff, ffffffff)
    /^[0-9a-f]{3}$/i.test(word) // 3-digit hex (fff)
  ) {
    return false;
  }

  if (
    lower.length <= 2 ||
    /^[A-Z]+$/.test(word) || // Acronyms
    projectDict.has(lower) ||
    dynamicWhitelist.has(lower)
  ) {
    return false;
  }

  if (isLikelyCodeOrReserved(word)) return false;

  if (spell.correct(lower)) return false;

  // Check singular and plural forms with natural
  const singular = nounInflector.singularize(lower);
  const plural = nounInflector.pluralize(lower);

  const [isBaseValid, isSingularValid, isPluralValid] = await Promise.all([
    isWordInWordNet(lower),
    singular !== lower ? isWordInWordNet(singular) : Promise.resolve(false),
    plural !== lower ? isWordInWordNet(plural) : Promise.resolve(false),
  ]);

  if (isBaseValid || isSingularValid || isPluralValid) {
    return false;
  }

  // Check if suggestions are all valid spellings (i.e. US/UK)
  const suggestions = spell.suggest(lower);
  const suggestionSet = new Set(suggestions.map((s) => s.toLowerCase()));
  if (suggestionSet.has(lower)) return false;

  if (
    suggestions.length > 0 &&
    areAllSuggestionsVariants(word, suggestions, spell)
  ) {
    return false;
  }
  return true;
};

/**
 * Check if all suggestions + original word are valid spellings
 * (indicating US/UK spelling variants)
 */
const areAllSuggestionsVariants = (
  word: string,
  suggestions: string[],
  spell: nspell
): boolean => {
  const variants = new Set(suggestions.map((s) => s.toLowerCase()));
  variants.add(word.toLowerCase());

  for (const variant of variants) {
    if (!spell.correct(variant)) {
      return false; // At least one variant not recognized as correct
    }
  }
  return true; // All recognized => likely spelling variants
};

const extractTyposFromCode = async (
  code: string,
  spell: nspell,
  projectDict: ProjectDictionary,
  file: string
): Promise<TypoEntry[]> => {
  const ast = parseCode(code);
  if (!ast) {
    console.error(chalk.red(`Parsing error in ${file}`));
    return [];
  }

  const typos: TypoEntry[] = [];
  const promises: Promise<void>[] = [];

  walkAST(ast, (node) => {
    if (
      node.type === "Literal" &&
      typeof node.value === "string" &&
      shouldCheckLiteral(node)
    ) {
      const raw = node.value;

      // Check if the entire string is a known place name
      const lowerRaw = raw.toLowerCase();
      if (dynamicWhitelist.has(lowerRaw)) {
        return; // Skip entire string if it's a known place name
      }

      const parts = splitCompound(raw).filter((w) => /^[a-zA-Z]+$/.test(w));
      parts.forEach((part) => {
        const check = async () => {
          if (await isValidWord(part, projectDict, spell)) {
            const suggestions = spell
              .suggest(part.toLowerCase())
              .filter((s) => s.toLowerCase() !== part.toLowerCase());

            if (
              suggestions.length > 0 &&
              !areAllSuggestionsVariants(part, suggestions, spell)
            ) {
              typos.push({
                file,
                line: node.loc.start.line,
                word: part,
                suggestions,
              });
            }
          }
        };
        promises.push(check());
      });
    }
  });

  await Promise.all(promises);

  return typos;
};

const shouldCheckLiteral = (node: any): boolean => {
  const parent = node.parent;
  if (!parent) return true;

  if (
    parent.type === "Property" &&
    parent.key === node &&
    !parent.computed // it's just a key, skip
  ) {
    return false;
  }

  if (
    [
      "ImportDeclaration",
      "ExportNamedDeclaration",
      "ExportAllDeclaration",
    ].includes(parent.type)
  ) {
    return false;
  }

  if (
    parent.type === "CallExpression" &&
    parent.callee &&
    ["require", "import"].includes(parent.callee.name)
  ) {
    return false;
  }

  return true;
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

const saveTyposToMarkdown = (
  typos: TypoEntry[],
  outputPath = "typo-report.md"
) => {
  if (typos.length === 0) return;

  let content = `# 📝 Typo Report\n\nGenerated on ${new Date().toLocaleString()}\n\n`;
  content += "| File | Line | Word | Suggestions |\n";
  content += "|------|------|------|-------------|\n";

  for (const { file, line, word, suggestions } of typos) {
    content += `| ${file} | ${line} | ${word} | ${suggestions.join(", ")} |\n`;
  }

  content += `\n> Tip: If some words are valid in your domain, consider adding them to the whitelist.\n`;

  try {
    fs.writeFileSync(path.join(process.cwd(), outputPath), content, "utf8");
    console.log(chalk.green(`📄 Typo report saved to ${outputPath}`));
  } catch (err) {
    console.error(chalk.red("❌ Failed to write typo report:"), err);
  }
};

const displayTypos = (typos: TypoEntry[]) => {
  const table = new Table({
    head: ["File", "Line", "Word", "Suggestions"],
    colWidths: [40, 10, 20, 40],
  });

  typos.forEach(({ file, line, word, suggestions }) =>
    table.push([file, line, word, suggestions.join(", ")])
  );

  console.log(chalk.yellowBright.bold("⚠️ Typos found:\n"));
  console.log(table.toString());
  console.log(chalk.redBright.bold(`\n❌ Total typos: ${typos.length}\n`));
};

const displaySuccess = (fileCount: number) => {
  const table = new Table({
    head: [chalk.greenBright.bold("✅ Typo Check Passed")],
  });
  table.push(["Checked Files: " + fileCount]);
  table.push(["Total Typos: 0"]);
  table.push(["Accuracy: 100%"]);
  console.log(table.toString());
};

const shouldIgnoreFile = (filePath: string, rootDir: string): boolean => {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/"); // normalize slashes

  // Ignore files by exact name
  const ignoredFiles = new Set([
    "babel.config.js",
    "babel.config.ts",
    "metro.config.js",
    "metro.config.ts",
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

const runChecker = async (rootDir: string): Promise<void> => {
  loadConfig(rootDir);

  // Basic ignore for node_modules + specific files/folders
  const allFiles = await fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"],
  });

  // Filter files to ignore the specific configs, styles and assets folders
  const files = allFiles.filter((file) => !shouldIgnoreFile(file, rootDir));

  console.log(
    chalk.blueBright.bold(
      `🔍 Building internal dictionary from ${files.length} files...\n`
    )
  );

  const spell = await loadNspell();
  const projectDict = buildProjectDictionary(files, spell);

  const typoPromises: Promise<TypoEntry[]>[] = files.map((file) =>
    extractTyposFromCode(
      readFileSyncSafe(file),
      spell,
      projectDict,
      path.relative(rootDir, file)
    )
  );
  const typosArrays = await Promise.all(typoPromises);
  const typos: TypoEntry[] = typosArrays.flat();

  const hasTypos = typos.length > 0;

  hasTypos ? displayTypos(typos) : displaySuccess(files.length);

  if (hasTypos) {
    const userResponse = await promptUser(
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
};

const promptUser = (question: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

export default runChecker;
