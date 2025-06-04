import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";
import * as acorn from "acorn";
import leven from "leven";
import chalk from "chalk";
import table from "cli-table3";
import * as acornWalk from "acorn-walk";

let __dirname;
try {
  const __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch {
  __dirname = __dirname || path.resolve();
}

type Dictionary = Set<string>;

interface TypoEntry {
  file: string;
  line: number;
  word: string;
  suggestions: string[];
}

const splitCompound = (word: string): string[] => {
  return word
    .split(/[_\s]+/) // snake_case and whitespace
    .flatMap((segment) =>
      segment.split(/(?=[A-Z])|[^a-zA-Z]/).filter(Boolean) // camelCase and non-alphas
    );
};

const extractWordsFromCode = (code: string): string[] => {
  const words: string[] = [];

  try {
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    acornWalk.full(ast, (node: any) => {
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

const extractTyposFromCode = (
  code: string,
  dictionary: Dictionary,
  file: string
): TypoEntry[] => {
  const typos: TypoEntry[] = [];

  try {
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    acornWalk.full(ast, (node: any) => {
      if (node.type === "Identifier" || (node.type === "Literal" && typeof node.value === "string")) {
        const raw = node.name || node.value;
        const parts = typeof raw === "string"
          ? splitCompound(raw).filter((w) => /^[a-zA-Z]+$/.test(w))
          : [];

        for (const part of parts) {
          const lower = part.toLowerCase();
          if (lower && !dictionary.has(lower)) {
            const suggestions = isLikelyTypo(lower, dictionary);
            if (suggestions) {
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

  console.log(chalk.blue(`🔍 Building internal dictionary from ${files.length} files...\n`));

  const dictionary: Dictionary = new Set();

  // Build dictionary
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const words = extractWordsFromCode(code);
    for (const word of words) {
      const cleaned = word.toLowerCase();
      if (cleaned && /^[a-zA-Z]+$/.test(cleaned)) {
        dictionary.add(cleaned);
      }
    }
  }

  // Check typos
  const allTypos: TypoEntry[] = [];

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const typos = extractTyposFromCode(code, dictionary, path.relative(rootDir, file));
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
