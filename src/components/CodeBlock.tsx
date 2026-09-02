import React, { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CONTROL_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
  "return", "yield", "await", "async", "import", "export", "from", "default",
  "try", "catch", "finally", "throw", "with", "pass", "raise", "elif"
]);

const DECLARATION_KEYWORDS = new Set([
  "const", "let", "var", "function", "class", "interface", "type", "enum",
  "extends", "implements", "public", "private", "protected", "static",
  "readonly", "override", "new", "typeof", "instanceof", "void", "as",
  "in", "of", "def", "fn", "val", "mut", "struct", "impl", "pub", "trait",
  "use", "mod", "package", "namespace", "select", "insert", "update", "delete",
  "where", "from", "join", "group", "order", "by", "create", "table", "drop",
  "alter", "index", "into", "values", "having", "limit"
]);

const CONSTANTS = new Set([
  "true", "false", "null", "undefined", "True", "False", "None", "NaN", "Nil", "self", "this", "super"
]);

const BUILTIN_TYPES = new Set([
  "string", "number", "boolean", "any", "unknown", "never", "object", "symbol",
  "bigint", "void", "int", "float", "double", "char", "bool", "long", "short",
  "uint", "byte", "i32", "i64", "u32", "u64", "f32", "f64", "str", "String",
  "Number", "Boolean", "Object", "Array", "Promise", "Map", "Set", "Record",
  "Partial", "Required", "Readonly", "Error", "Response", "Request", "HTMLElement"
]);

function highlightLine(line: string, langName: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    // Single line comments
    if (
      (line.startsWith("//", i) || line.startsWith("#", i)) &&
      !(langName === "html" && line[i] === "#")
    ) {
      const commentText = line.slice(i);
      nodes.push(
        <span key={i} className="text-[#6a9955] italic">
          {commentText}
        </span>
      );
      break;
    }

    // HTML / XML comment <!-- ... -->
    if (line.startsWith("<!--", i)) {
      const endIdx = line.indexOf("-->", i);
      const commentText = endIdx !== -1 ? line.slice(i, endIdx + 3) : line.slice(i);
      nodes.push(
        <span key={i} className="text-[#6a9955] italic">
          {commentText}
        </span>
      );
      i += commentText.length;
      continue;
    }

    // Strings (double quotes, single quotes, backticks)
    const char = line[i];
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      let j = i + 1;
      let escaped = false;
      while (j < len) {
        if (line[j] === "\\" && !escaped) {
          escaped = true;
        } else if (line[j] === quote && !escaped) {
          j++;
          break;
        } else {
          escaped = false;
        }
        j++;
      }
      const strText = line.slice(i, j);
      nodes.push(
        <span key={i} className="text-[#ce9178]">
          {strText}
        </span>
      );
      i = j;
      continue;
    }

    // Numbers
    if (/\d/.test(char) && (i === 0 || !/[a-zA-Z0-9_$]/.test(line[i - 1]))) {
      let j = i;
      while (j < len && /[0-9a-fA-FxX._]/.test(line[j])) {
        j++;
      }
      const numText = line.slice(i, j);
      nodes.push(
        <span key={i} className="text-[#b5cea8]">
          {numText}
        </span>
      );
      i = j;
      continue;
    }

    // HTML / JSX Tags: <tag or </tag
    if (char === "<" && i + 1 < len && /[a-zA-Z_/!]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_:-]/.test(line[j])) {
        j++;
      }
      const tagText = line.slice(i, j);
      nodes.push(
        <span key={i} className="text-[#808080]">
          {"<"}
        </span>
      );
      if (tagText.length > 1) {
        const namePart = tagText.slice(1);
        const isPascal = /^[A-Z]/.test(namePart);
        nodes.push(
          <span key={i + 1} className={isPascal ? "text-[#4ec9b0]" : "text-[#569cd6]"}>
            {namePart}
          </span>
        );
      }
      i = j;
      continue;
    }

    // Identifiers (Keywords, Functions, Types, Variables)
    if (/[a-zA-Z_$]/.test(char)) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_$]/.test(line[j])) {
        j++;
      }
      const word = line.slice(i, j);

      // Peek ahead to see if it's a function call
      let isFunc = false;
      let k = j;
      while (k < len && /\s/.test(line[k])) k++;
      if (k < len && line[k] === "(") {
        isFunc = true;
      }

      if (CONTROL_KEYWORDS.has(word)) {
        nodes.push(
          <span key={i} className="text-[#c586c0] font-medium">
            {word}
          </span>
        );
      } else if (DECLARATION_KEYWORDS.has(word)) {
        nodes.push(
          <span key={i} className="text-[#569cd6] font-medium">
            {word}
          </span>
        );
      } else if (CONSTANTS.has(word)) {
        nodes.push(
          <span key={i} className="text-[#569cd6]">
            {word}
          </span>
        );
      } else if (BUILTIN_TYPES.has(word)) {
        nodes.push(
          <span key={i} className="text-[#4ec9b0]">
            {word}
          </span>
        );
      } else if (isFunc && !CONTROL_KEYWORDS.has(word) && !DECLARATION_KEYWORDS.has(word)) {
        nodes.push(
          <span key={i} className="text-[#dcdcaa]">
            {word}
          </span>
        );
      } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word)) {
        // PascalCase -> Type or Class
        nodes.push(
          <span key={i} className="text-[#4ec9b0]">
            {word}
          </span>
        );
      } else {
        // Regular Variable / Property
        nodes.push(
          <span key={i} className="text-[#9cdcfe]">
            {word}
          </span>
        );
      }
      i = j;
      continue;
    }

    // Operators and Symbols
    if (/[=+\-*/%&|^~!<>;:.,?(){}\[\]]/.test(char)) {
      nodes.push(
        <span key={i} className="text-[#d4d4d4]">
          {char}
        </span>
      );
      i++;
      continue;
    }

    // Spaces & whitespace
    nodes.push(<span key={i}>{char}</span>);
    i++;
  }

  return nodes;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = "code" }) => {
  const [copied, setCopied] = useState(false);
  const cleanCode = code.trim();
  const lines = cleanCode.split("\n");
  const normalizedLang = (language || "code").toLowerCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl bg-[#1e1e1e] border border-zinc-800 font-mono text-xs overflow-hidden shadow-md text-left select-text">
      {/* VS Code Dark+ Header Bar */}
      <div className="bg-[#252526] px-3.5 py-2 border-b border-zinc-800/80 flex justify-between items-center select-none font-sans">
        <div className="flex items-center space-x-2">
          {/* Traffic Dots */}
          <div className="flex items-center space-x-1.5 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
            {normalizedLang}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded-md hover:bg-zinc-700/60 text-zinc-400 hover:text-white transition-colors cursor-pointer text-[11px] font-medium"
          title="Copy Code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body with Line Numbers & VS Code Dark+ Colors */}
      <div className="p-4 overflow-x-auto text-[#d4d4d4] font-mono leading-relaxed flex text-[12px] sm:text-[13px]">
        {lines.length > 1 && (
          <div className="pr-4 mr-3 border-r border-zinc-800/80 text-zinc-600 select-none text-right shrink-0">
            {lines.map((_, idx) => (
              <div key={idx} className="leading-relaxed">
                {idx + 1}
              </div>
            ))}
          </div>
        )}
        <pre className="flex-1 font-mono whitespace-pre overflow-x-auto">
          {lines.map((line, lineIdx) => {
            const nodes = highlightLine(line, normalizedLang);
            return (
              <div key={lineIdx} className="leading-relaxed">
                {nodes.length > 0 ? nodes : "\u00A0"}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
};
