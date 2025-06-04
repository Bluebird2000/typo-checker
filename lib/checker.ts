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
  if (node.type === "Identifier") {
    return splitCompound(node.name);
  }
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

const isValidWord = (
  word: string,
  projectDict: ProjectDictionary,
  spell: nspell
): boolean => {
  if (word.length <= 2 || /^[A-Z]+$/.test(word)) return false; // skip acronyms and short words
  if (projectDict.has(word.toLowerCase())) return false;
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
    if (
      node.type === "Identifier" ||
      (node.type === "Literal" && typeof node.value === "string")
    ) {
      const raw = node.name ?? node.value;
      if (typeof raw !== "string") return;

      for (const part of splitCompound(raw).filter((w) =>
        /^[a-zA-Z]+$/.test(w)
      )) {
        const lower = part.toLowerCase();
        if (!isValidWord(part, projectDict, spell)) continue;
        if (!spell.correct(lower)) {
          typos.push({
            file,
            line: node.loc.start.line,
            word: part,
            suggestions: spell.suggest(lower),
          });
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

  console.log(chalk.yellow("⚠️  Typos found:\n"));
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

