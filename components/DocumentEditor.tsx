/**
 * Document Editor Component
 * 
 * Provides editable view of the document using TipTap
 * Preserves clause highlighting and allows text editing
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';
import { Clause } from '@/types';

interface DocumentEditorProps {
  html: string;
  clauses: Clause[];
  paragraphs: string[];
  onUpdate?: (html: string) => void;
  onParagraphClick?: (paragraphIndex: number, elementText: string) => void;
}

export default function DocumentEditor({
  html,
  clauses,
  paragraphs,
  onUpdate,
  onParagraphClick,
}: DocumentEditorProps) {
  // Create a mapping of paragraph indices to clauses
  const paragraphClauseMap = new Map<number, Clause>();
  clauses.forEach(clause => {
    paragraphClauseMap.set(clause.paragraphIndex, clause);
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable some features that might interfere with clause detection
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Placeholder.configure({
        placeholder: 'Start editing...',
      }),
    ],
    content: html,
    onUpdate: ({ editor }) => {
      if (onUpdate) {
        onUpdate(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'document-editor prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
      },
      handleDoubleClick: (view, pos, event) => {
        // Handle double-click for clause marking (not single click)
        // This allows normal editing while still supporting clause marking
        if (onParagraphClick) {
          const { state } = view;
          const $pos = state.doc.resolve(pos);
          const paragraph = $pos.parent;
          
          if (paragraph.type.name === 'paragraph' || paragraph.type.name === 'heading') {
            const text = paragraph.textContent.trim();
            // Try to find matching paragraph index
            const paragraphIndex = paragraphs.findIndex(p => {
              const paraText = p.trim();
              return paraText === text || 
                     text.includes(paraText.substring(0, Math.min(50, paraText.length))) ||
                     paraText.includes(text.substring(0, Math.min(50, text.length)));
            });
            
            if (paragraphIndex >= 0) {
              event.preventDefault();
              onParagraphClick(paragraphIndex, text);
              return true; // Prevent default double-click behavior
            }
          }
        }
        return false; // Allow default behavior for other cases
      },
    },
  });

  // Apply clause highlighting to editor content via CSS
  // TipTap doesn't easily support custom marks, so we'll use CSS classes
  // Optimized with debouncing and early exits
  useEffect(() => {
    if (!editor) return;

    // Debounce highlighting updates to avoid excessive DOM manipulation
    const timeoutId = setTimeout(() => {
      const editorElement = editor.view.dom;
      if (!editorElement) return;

      // Batch DOM updates
      requestAnimationFrame(() => {
        // Remove all existing clause highlights
        editorElement.querySelectorAll('.clause-highlight').forEach(el => {
          el.classList.remove('clause-highlight');
        });

        // Create a map for faster lookups
        const paragraphTextMap = new Map<string, number>();
        paragraphs.forEach((p, idx) => {
          const trimmed = p.trim();
          if (trimmed) {
            paragraphTextMap.set(trimmed, idx);
            // Also store first 50 chars for fuzzy matching
            if (trimmed.length > 50) {
              paragraphTextMap.set(trimmed.substring(0, 50), idx);
            }
          }
        });

        // Apply highlights based on clauses (optimized)
        editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((element) => {
          const text = element.textContent?.trim() || '';
          if (!text) return;

          // Fast exact match first
          let paragraphIndex = paragraphTextMap.get(text);
          
          // If no exact match, try prefix match
          if (paragraphIndex === undefined && text.length > 50) {
            paragraphIndex = paragraphTextMap.get(text.substring(0, 50));
          }

          if (paragraphIndex !== undefined) {
            const clause = paragraphClauseMap.get(paragraphIndex);
            if (clause) {
              element.classList.add('clause-highlight');
            }
          }
        });
      });
    }, 150); // Debounce delay

    return () => clearTimeout(timeoutId);
  }, [editor, clauses, paragraphs, paragraphClauseMap]);

  // Update editor content when HTML changes (but not on every update to avoid loops)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (currentHtml !== html) {
      editor.commands.setContent(html, false);
    }
  }, [html, editor]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="document-editor-wrapper">
      <EditorContent editor={editor} />
      <style jsx global>{`
        .document-editor-wrapper {
          height: 100%;
          overflow: auto;
        }
        .document-editor .ProseMirror {
          min-height: 80vh;
          padding: 20px;
          outline: none;
        }
        .document-editor .clause-highlight {
          background-color: yellow;
          padding: 2px 4px;
          border-radius: 3px;
        }
        .document-editor .ProseMirror p,
        .document-editor .ProseMirror h1,
        .document-editor .ProseMirror h2,
        .document-editor .ProseMirror h3,
        .document-editor .ProseMirror h4,
        .document-editor .ProseMirror h5,
        .document-editor .ProseMirror h6 {
          cursor: text;
        }
        .document-editor .ProseMirror .clause-highlight {
          cursor: text;
        }
        .document-editor .ProseMirror p:hover,
        .document-editor .ProseMirror h1:hover,
        .document-editor .ProseMirror h2:hover,
        .document-editor .ProseMirror h3:hover,
        .document-editor .ProseMirror h4:hover,
        .document-editor .ProseMirror h5:hover,
        .document-editor .ProseMirror h6:hover {
          background-color: rgba(0, 0, 0, 0.02);
        }
      `}</style>
    </div>
  );
}

