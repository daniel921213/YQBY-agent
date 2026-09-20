"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Heading2, Heading3, ImagePlus, Italic, List, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";
import { Node, type JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileHandler } from "@tiptap/extension-file-handler";
import { Placeholder } from "@tiptap/extensions";
import { journalImageUrl, uploadJournalImage, type Block } from "@/lib/journal-api";

export const emptyDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function legacyDocument(blocks: Block[]): JSONContent {
  if (!blocks.length) return emptyDocument;
  return { type: "doc", content: blocks.map((block) => {
    if (block.type === "image" && block.image_id) return { type: "journalImage", attrs: { imageId: block.image_id, alt: block.text } };
    const text = block.text ? [{ type: "text", text: block.text }] : [];
    if (block.type === "heading") return { type: "heading", attrs: { level: 2 }, content: text };
    if (block.type === "bullet") return { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: text }] }] };
    return { type: "paragraph", content: text };
  }) };
}

export function documentExcerpt(document: JSONContent | null, blocks: Block[]): string {
  if (!document) return blocks.find((block) => block.type !== "image")?.text || "點擊閱讀交易日誌";
  const words: string[] = [];
  const walk = (node: JSONContent) => { if (node.text) words.push(node.text); node.content?.forEach(walk); };
  walk(document);
  return words.join(" ").trim() || "點擊閱讀交易日誌";
}

function ProtectedImage({ imageId, alt }: { imageId: number; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    journalImageUrl(imageId).then((value) => { objectUrl = value; if (active) setUrl(value); else URL.revokeObjectURL(value); }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageId]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="my-4 max-h-[700px] w-full rounded-lg border border-white/10 object-contain" /> : <div className="my-4 flex h-28 items-center justify-center rounded-lg border border-white/10 text-sm text-slate-500">圖片載入中…</div>;
}

function JournalImageView({ node }: NodeViewProps) {
  return <NodeViewWrapper className="journal-image"><ProtectedImage imageId={Number(node.attrs.imageId)} alt={String(node.attrs.alt || "日誌圖片")} /></NodeViewWrapper>;
}

const JournalImage = Node.create({
  name: "journalImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() { return { imageId: { default: null }, alt: { default: "" } }; },
  parseHTML() { return [{ tag: "div[data-journal-image-id]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", { "data-journal-image-id": HTMLAttributes.imageId, "data-alt": HTMLAttributes.alt }]; },
  addNodeView() { return ReactNodeViewRenderer(JournalImageView); }
});

type Props = {
  document: JSONContent;
  journalId?: number;
  editable?: boolean;
  onChange?: (document: JSONContent) => void;
  onError?: (message: string) => void;
};

export function RichJournal({ document, journalId, editable = false, onChange, onError }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [, setSelection] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit,
      JournalImage,
      Placeholder.configure({ placeholder: "直接輸入交易想法，或按 Ctrl+V 貼上截圖…" }),
      FileHandler.configure({
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        onPaste: (editor, files) => { files.forEach((file) => void insertImage(file, editor)); },
        onDrop: (editor, files, pos) => { files.forEach((file) => void insertImage(file, editor, pos)); }
      })
    ],
    content: document,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
    onSelectionUpdate: () => setSelection((value) => value + 1)
  });

  async function insertImage(file: File, current = editor, pos?: number) {
    if (!current || !journalId) return;
    if (file.size > 5_000_000) { onError?.("圖片上限為 5 MB"); return; }
    try {
      setUploading(true);
      const imageId = await uploadJournalImage(journalId, file);
      const node = { type: "journalImage", attrs: { imageId, alt: file.name || "交易截圖" } };
      if (pos === undefined) current.chain().focus().insertContent(node).run();
      else current.chain().focus().insertContentAt(pos, node).run();
    } catch (error) { onError?.(error instanceof Error ? error.message : "圖片上傳失敗"); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  const tool = (label: string, Icon: typeof Bold, action: () => void, active = false, disabled = false) => <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={action} className={`rounded-md p-2 transition hover:bg-white/10 disabled:opacity-40 ${active ? "bg-gold/15 text-gold" : "text-slate-300"}`}><Icon className="h-4 w-4" /></button>;

  return <div className="journal-rich-editor">
    {editable && <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1.5" role="toolbar" aria-label="日誌文字格式">
      {tool("二級標題", Heading2, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
      {tool("三級標題", Heading3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
      <span className="mx-1 h-5 w-px bg-white/10" />
      {tool("粗體", Bold, () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
      {tool("斜體", Italic, () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
      <span className="mx-1 h-5 w-px bg-white/10" />
      {tool("項目清單", List, () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}
      {tool("編號清單", ListOrdered, () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}
      {tool("引言", Quote, () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive("blockquote"))}
      <span className="mx-1 h-5 w-px bg-white/10" />
      {tool("插入圖片", ImagePlus, () => fileInput.current?.click(), false, uploading)}
      <span className="mx-1 h-5 w-px bg-white/10" />
      {tool("復原", Undo2, () => editor?.chain().focus().undo().run(), false, !editor?.can().undo())}
      {tool("重做", Redo2, () => editor?.chain().focus().redo().run(), false, !editor?.can().redo())}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void insertImage(file); }} />
      {uploading && <span className="ml-2 text-xs text-slate-400">圖片上傳中…</span>}
    </div>}
    <EditorContent editor={editor} className={`prose prose-invert max-w-none text-slate-200 prose-headings:text-white prose-p:text-slate-200 prose-li:text-slate-200 [&_.tiptap]:outline-none ${editable ? "[&_.tiptap]:min-h-[360px]" : ""}`} />
  </div>;
}
