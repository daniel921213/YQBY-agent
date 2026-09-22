"use client";

import { useRef, useState } from "react";
import { Bold, Heading2, Heading3, ImagePlus, Italic, List, ListOrdered, Palette, Quote, Redo2, Undo2 } from "lucide-react";
import { Node, type JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileHandler } from "@tiptap/extension-file-handler";
import { Placeholder } from "@tiptap/extensions";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { uploadJournalImage, type Block } from "@/lib/journal-api";
import { ProtectedImage } from "./ProtectedImage";
import { JournalReader } from "./JournalReader";

export const emptyDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
const textColors = [
  { label: "白色", value: "#F3F4F6" },
  { label: "金色", value: "#F0C876" },
  { label: "綠色", value: "#83D89B" },
  { label: "紅色", value: "#E87979" },
  { label: "藍色", value: "#72B9F8" },
  { label: "紫色", value: "#C6A7F7" }
];

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

function JournalImageView({ node }: NodeViewProps) {
  return <NodeViewWrapper className="journal-image"><ProtectedImage key={node.attrs.imageId} imageId={Number(node.attrs.imageId)} alt={String(node.attrs.alt || "日誌圖片")} /></NodeViewWrapper>;
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

export function RichJournal(props: Props) {
  return props.editable ? <JournalEditor {...props} /> : <JournalReader document={props.document} />;
}

function JournalEditor({ document, journalId, editable = false, onChange, onError }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [, setSelection] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      JournalImage,
      Placeholder.configure({ placeholder: "直接輸入交易想法，或按 Ctrl+V 貼上截圖…" }),
      FileHandler.configure({
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        consumePasteEvent: true,
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
  const currentColor = editor?.getAttributes("textStyle").color as string | undefined;

  return <div className="journal-rich-editor">
    {editable && <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1.5" role="toolbar" aria-label="日誌文字格式">
      {tool("二級標題", Heading2, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
      {tool("三級標題", Heading3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
      <span className="mx-1 h-5 w-px bg-white/10" />
      {tool("粗體", Bold, () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
      {tool("斜體", Italic, () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
      <div className="relative">
        <button type="button" title="文字顏色" aria-label="文字顏色" aria-expanded={colorOpen} onClick={() => setColorOpen((value) => !value)} className={`rounded-md p-2 transition hover:bg-white/10 ${colorOpen || currentColor ? "bg-gold/15 text-gold" : "text-slate-300"}`}><Palette className="h-4 w-4" /></button>
        {colorOpen && <div className="absolute left-0 top-full z-20 mt-2 w-52 rounded-lg border border-white/15 bg-[#1c2535] p-3 shadow-2xl" role="group" aria-label="選擇文字顏色">
          <p className="mb-2 text-xs text-slate-400">文字顏色</p>
          <div className="grid grid-cols-6 gap-2">{textColors.map(({ label, value }) => <button key={value} type="button" aria-label={label} title={label} aria-pressed={currentColor?.toLowerCase() === value.toLowerCase()} onMouseDown={(event) => event.preventDefault()} onClick={() => { editor?.chain().focus().setColor(value).run(); setColorOpen(false); }} className={`h-6 w-6 rounded-full border-2 ${currentColor?.toLowerCase() === value.toLowerCase() ? "border-white" : "border-transparent"}`} style={{ backgroundColor: value }} />)}</div>
          <label className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">自訂顏色<input type="color" aria-label="自訂文字顏色" value={currentColor && /^#[0-9a-f]{6}$/i.test(currentColor) ? currentColor : "#F0C876"} onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" /></label>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor?.chain().focus().unsetColor().run(); setColorOpen(false); }} className="mt-3 w-full rounded-md border border-white/10 px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5">清除文字顏色</button>
        </div>}
      </div>
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
