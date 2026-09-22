"use client";

import { Fragment, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import { ProtectedImage } from "./ProtectedImage";

function safeLink(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value, "https://journal.invalid");
    if (["https:", "http:", "mailto:"].includes(url.protocol)) return value;
  } catch { /* Invalid links render as ordinary text. */ }
}

function renderNode(node: JSONContent, key: string): ReactNode {
  const children = node.content?.map((child, index) => renderNode(child, `${key}-${index}`));
  if (node.type === "text") {
    let text: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold": text = <strong>{text}</strong>; break;
        case "italic": text = <em>{text}</em>; break;
        case "strike": text = <s>{text}</s>; break;
        case "underline": text = <u>{text}</u>; break;
        case "code": text = <code>{text}</code>; break;
        case "textStyle": text = <span style={{ color: typeof mark.attrs?.color === "string" ? mark.attrs.color : undefined }}>{text}</span>; break;
        case "link": {
          const href = safeLink(mark.attrs?.href);
          if (href) text = <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
          break;
        }
      }
    }
    return <Fragment key={key}>{text}</Fragment>;
  }
  switch (node.type) {
    case "paragraph": return <p key={key}>{children?.length ? children : <br />}</p>;
    case "heading": {
      const level = Number(node.attrs?.level);
      const Heading = ([1, 2, 3, 4, 5, 6].includes(level) ? `h${level}` : "h2") as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Heading key={key}>{children}</Heading>;
    }
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": return <ol key={key} start={Number(node.attrs?.start) || 1}>{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock": return <pre key={key}><code>{children}</code></pre>;
    case "horizontalRule": return <hr key={key} />;
    case "hardBreak": return <br key={key} />;
    case "journalImage": {
      const imageId = Number(node.attrs?.imageId);
      return Number.isInteger(imageId) && imageId > 0 ? <ProtectedImage key={`${key}-${imageId}`} imageId={imageId} alt={String(node.attrs?.alt || "日誌圖片")} releaseOffscreen /> : null;
    }
    default: return <Fragment key={key}>{children}</Fragment>;
  }
}

// Published journals need ordinary HTML, not an active ProseMirror editor.
export function JournalReader({ document }: { document: JSONContent }) {
  return <div className="journal-reader prose prose-invert max-w-none break-words text-slate-200 prose-headings:text-white prose-p:text-slate-200 prose-li:text-slate-200">{renderNode(document, "doc")}</div>;
}
