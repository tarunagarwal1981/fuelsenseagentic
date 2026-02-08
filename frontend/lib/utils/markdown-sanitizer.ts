/**
 * Markdown sanitizer for LLM/template output displayed in the chat.
 * Escapes angle brackets (< >) in prose to prevent raw HTML from being rendered,
 * while preserving code blocks (content inside ``` is left as-is; code blocks
 * are already escaped by the markdown renderer).
 *
 * Used for defense-in-depth when rendering assistant messages via ReactMarkdown.
 */

/**
 * Sanitize markdown text for safe display.
 * Escapes < and > in prose to prevent HTML injection, without breaking code blocks.
 */
export function sanitizeMarkdownForDisplay(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // Split by code blocks (```). Odd-indexed parts are inside code blocks.
  const parts = text.split(/```/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // Inside code block - renderer handles escaping
      return part.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    })
    .join('```');
}
