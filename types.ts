export interface TypoEntry {
  file: string;
  line: number;
  word: string;
  suggestions: string[];
}

export interface TypoCheckerConfig {
  whitelist?: string[];
}

export type ProjectDictionary = Set<string>;
