import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import * as acorn from "acorn";
import chalk from "chalk";
import table from "cli-table3";
import nspell from "nspell";
import dictionaryEn from "dictionary-en";
import { parse } from '@typescript-eslint/typescript-estree';

let __dirname;
try {
  const __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch {
  __dirname = __dirname || path.resolve();
}

type ProjectDictionary = Set<string>;

interface TypoEntry {
  file: string;
  line: number;
  word: string;
  suggestions: string[];
}

const splitCompound = (word: string): string[] => {
  return word
    .split(/[_\s]+/)
    .flatMap((segment) =>
      segment.split(/(?=[A-Z])|[^a-zA-Z]/).filter(Boolean)
    );
};

// Recursive simple walker for typescript-estree AST
function walk(node: any, callback: (node: any) => void) {
  callback(node);
  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c.type === 'string') walk(c, callback);
        }
      } else if (child && typeof child.type === 'string') {
        walk(child, callback);
      }
    }
  }
}


const extractWordsFromCode = (code: string): string[] => {
  const words: string[] = [];

  try {
    const ast = parse(code, {
      loc: true,
      jsx: true,
      useJSXTextNode: true,
    });

    walk(ast as any, (node: any) => {
      if (node.type === "Identifier") {
        words.push(...splitCompound(node.name));
      } else if (node.type === "Literal" && typeof node.value === "string") {
        const literalWords = node.value.split(/[^a-zA-Z]+/);
        words.push(...literalWords.filter(Boolean));
      }
    });
  } catch {
    // ignore parse errors
  }

  return words;
};

// ✅ FIXED VERSION
const loadNspell = async (): Promise<nspell> => {
  const dict = await dictionaryEn; // now async
  return nspell(dict);
};

const extractTyposFromCode = (
  code: string,
  spell: nspell,
  projectDict: ProjectDictionary,
  file: string
): TypoEntry[] => {
  const typos: TypoEntry[] = [];

  try {
    const ast = parse(code, {
      loc: true,
      jsx: true,
      useJSXTextNode: true,
    });

    walk(ast as any, (node: any) => {
      if (
        node.type === "Identifier" ||
        (node.type === "Literal" && typeof node.value === "string")
      ) {
        const raw = node.name || node.value;
        const parts =
          typeof raw === "string"
            ? splitCompound(raw).filter((w) => /^[a-zA-Z]+$/.test(w))
            : [];

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
              suggestions,
            });
          }
        }
      }
    });
  } catch (err: any) {
    console.error(chalk.red(`Parsing error in ${file}: ${err.message}`));
  }

  return typos;
};

const runChecker = async (rootDir: string): Promise<void> => {
  const files = await fg(["**/*.{js,ts,jsx,tsx}"], {
    cwd: rootDir,
    absolute: true,
    ignore: ["node_modules"],
  });

  console.log(
    chalk.blue(`🔍 Building internal dictionary from ${files.length} files...\n`)
  );

  const projectDict: ProjectDictionary = new Set();

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

  const spell = await loadNspell();

  const allTypos: TypoEntry[] = [];

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
      colWidths: [40, 10, 20, 40],
    });

    for (const { file, line, word, suggestions } of allTypos) {
      typoTable.push([file, line, word, suggestions.join(", ")]);
    }

    console.log(chalk.yellow("⚠️  Typos found:\n"));
    console.log(typoTable.toString());
    console.log(chalk.redBright(`\n❌ Total typos: ${allTypos.length}\n`));
  } else {
    const successTable = new table({
      head: [chalk.green("✅ Typo Check Passed")],
    });

    successTable.push(["Checked Files: " + files.length]);
    successTable.push(["Total Typos: 0"]);
    successTable.push(["Accuracy: 100%"]);

    console.log(successTable.toString());
  }
};

export default runChecker;
