"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";

const JOB_TEMPLATE = `<h2>About the role</h2>
<p>What will this person do day-to-day?</p>
<h2>Requirements</h2>
<ul>
<li>Must-have skill or experience</li>
<li>Another requirement</li>
</ul>
<h2>Nice to have</h2>
<ul>
<li>Bonus skill (not a dealbreaker)</li>
</ul>
<h2>What we offer</h2>
<ul>
<li>Remote-first, flexible hours, etc.</li>
</ul>`;

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-lime underline" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Describe the role...",
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] px-4 py-3 text-sm normal-case leading-relaxed",
      },
      // Strip Word/Google Docs garbage on paste
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text && event.clipboardData?.types.includes("text/html")) {
          // Check if pasted HTML is from Word/Docs (has mso- or google-docs)
          const html = event.clipboardData.getData("text/html");
          if (html.includes("mso-") || html.includes("docs-internal") || html.includes("google-docs")) {
            // Use plain text instead to avoid formatting garbage
            event.preventDefault();
            _view.dispatch(
              _view.state.tr.insertText(text),
            );
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  const insertTemplate = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(JOB_TEMPLATE);
    onChange(JOB_TEMPLATE);
  }, [editor, onChange]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = prompt("URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border-[3px] border-border bg-bg focus-within:border-lime transition-colors">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b-[3px] border-border px-2 py-1.5">
        <ToolbarBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          B
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em>I</em>
        </ToolbarBtn>

        <span className="mx-1 h-4 w-px bg-border/50" />

        <ToolbarBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading"
        >
          H2
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          {"• —"}
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          {"1."}
        </ToolbarBtn>

        <span className="mx-1 h-4 w-px bg-border/50" />

        <ToolbarBtn
          active={editor.isActive("link")}
          onClick={addLink}
          title="Add link"
        >
          Link
        </ToolbarBtn>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Template button */}
        <button
          onClick={insertTemplate}
          className="px-2 py-1 text-[10px] text-lime transition-colors hover:text-cream normal-case"
          title="Insert template"
        >
          Use template
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Styles are in globals.css under .tiptap */}
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      className="px-2 py-1 text-xs transition-colors"
      style={{
        color: active ? "#c8e64a" : "var(--color-muted)",
        backgroundColor: active ? "rgba(200,230,74,0.1)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}
