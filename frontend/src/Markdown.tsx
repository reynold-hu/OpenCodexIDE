import React, { useEffect, useRef, useState } from "react";
import { IconGlobe } from "./icons";

function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) nodes.push(<code className="inline" key={`${keyBase}-${i}`}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) nodes.push(<strong key={`${keyBase}-${i}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (mm) {
        if (mm[2].startsWith("preview:")) {
          nodes.push(
            <a
              key={`${keyBase}-${i}`}
              className="preview-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("ocx:preview", { detail: { path: mm[2].slice("preview:".length) } }));
              }}
            >
              <IconGlobe size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{mm[1]}
            </a>
          );
        } else {
          nodes.push(<a key={`${keyBase}-${i}`} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>);
        }
      } else nodes.push(tok);
    } else nodes.push(<em key={`${keyBase}-${i}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* original lightweight tokenizer — keyword/string/comment/number only */
const KW: Record<string, string[]> = {
  js: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "export", "from", "async", "await", "new", "class", "extends", "try", "catch", "throw", "typeof", "default", "module", "require"],
  py: ["def", "return", "if", "elif", "else", "for", "while", "import", "from", "class", "try", "except", "raise", "with", "as", "lambda", "None", "True", "False", "print", "pass"],
  bash: ["if", "then", "fi", "for", "do", "done", "while", "echo", "cd", "export", "function", "local", "set"],
  json: ["true", "false", "null"],
};
function langOf(tag: string) {
  const t = tag.toLowerCase();
  if (t.includes("py") || t === "python") return "py";
  if (t.includes("sh") || t.includes("bash") || t.includes("zsh") || t === "shell") return "bash";
  if (t.includes("json")) return "json";
  return "js";
}
function highlight(code: string, lang: string): React.ReactNode[] {
  const words = KW[lang] || KW.js;
  const re = new RegExp(`(#[^\\n]*$|//[^\\n]*$|"[^"]*"|'[^']*'|\`[^\`]*\`|\\b(?:${words.join("|")})\\b|\\b\\d+(?:\\.\\d+)?\\b)`, "gm");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const tok = m[0];
    let cls = "tk-kw";
    if (/^["'\`]/.test(tok)) cls = "tk-str";
    else if (/^(#|\/\/)/.test(tok)) cls = "tk-com";
    else if (/^\d/.test(tok)) cls = "tk-num";
    out.push(<span key={i++} className={cls}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function CodeBlock({ code, tag }: { code: string; tag: string }) {
  const [copied, setCopied] = useState(false);
  if (tag.toLowerCase().includes("mermaid")) return <Mermaid code={code} />;
  return (
    <div className="codeblock-wrap">
      <div className="codeblock-bar">
        <span className="cb-lang">{tag || "text"}</span>
        <button className="cb-copy" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="codeblock">{highlight(code, langOf(tag))}</pre>
    </div>
  );
}

function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: document.documentElement.getAttribute("data-theme") === "light" ? "default" : "dark", securityLevel: "strict" });
        const { svg } = await mermaid.render(`mm${Math.random().toString(36).slice(2, 8)}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (ref.current) ref.current.innerHTML = `<pre>${code.replace(/</g, "&lt;")}</pre>`;
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  return <div className="mermaid-box" ref={ref} />;
}

export function Markdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let fence: string[] | null = null;
  let fenceTag = "";
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushBuf = () => {
    if (buf.length) {
      parts.push(<p key={key++}>{inline(buf.join("\n"), `p${key}`)}</p>);
      buf = [];
    }
  };
  const flushList = () => {
    if (list) {
      const El = list.ordered ? "ol" : "ul";
      parts.push(
        <El key={key++}>
          {list.items.map((it, idx) => (
            <li key={idx}>{inline(it, `li${key}-${idx}`)}</li>
          ))}
        </El>
      );
      list = null;
    }
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.trimStart().startsWith("```")) {
      if (fence) {
        parts.push(<CodeBlock key={key++} code={fence.join("\n")} tag={fenceTag} />);
        fence = null;
        fenceTag = "";
      } else {
        flushBuf();
        flushList();
        fence = [];
        fenceTag = line.trim().slice(3).trim();
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    // table
    if (line.includes("|") && line.trim().startsWith("|") && lines[li + 1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[li + 1])) {
      flushBuf();
      flushList();
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      li++;
      const rows: string[][] = [];
      while (li + 1 < lines.length && lines[li + 1].includes("|") && lines[li + 1].trim().startsWith("|")) {
        rows.push(lines[li + 1].split("|").slice(1, -1).map((c) => c.trim()));
        li++;
      }
      parts.push(
        <table key={key++} className="md-table">
          <thead><tr>{header.map((h, i) => <th key={i}>{inline(h, `th${i}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c, `td${i}-${j}`)}</td>)}</tr>)}</tbody>
        </table>
      );
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      flushBuf();
      flushList();
      const Tag = (`h${h[1].length}`) as "h1" | "h2" | "h3";
      parts.push(<Tag key={key++}>{inline(h[2], `h${key}`)}</Tag>);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (ul || ol) {
      flushBuf();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ol || ul)![1]);
      continue;
    }
    if (line.trim() === "") {
      flushBuf();
      flushList();
      continue;
    }
    buf.push(line);
  }
  if (fence) parts.push(<CodeBlock key={key++} code={fence.join("\n")} tag={fenceTag} />);
  flushBuf();
  flushList();
  return <div className="agent-msg">{parts}</div>;
}
