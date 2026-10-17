import React from "react";
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

export function Markdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let fence: string[] | null = null;
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

  for (const raw of lines) {
    const line = raw;
    if (line.trimStart().startsWith("```")) {
      if (fence) {
        parts.push(<pre className="codeblock" key={key++}>{fence.join("\n")}</pre>);
        fence = null;
      } else {
        flushBuf();
        flushList();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
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
  if (fence) parts.push(<pre className="codeblock" key={key++}>{fence.join("\n")}</pre>);
  flushBuf();
  flushList();
  return <div className="agent-msg">{parts}</div>;
}
