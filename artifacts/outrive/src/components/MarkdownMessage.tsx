import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  /* ── Headings ── */
  h1: ({ children }) => (
    <div className="text-[11px] font-bold uppercase tracking-widest mb-2 mt-3 first:mt-0"
      style={{ color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace' }}>
      {children}
    </div>
  ),
  h2: ({ children }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 mt-3 first:mt-0"
      style={{ color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace' }}>
      {children}
    </div>
  ),
  h3: ({ children }) => (
    <div className="text-[10px] font-semibold uppercase tracking-wide mb-1 mt-2 first:mt-0"
      style={{ color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace' }}>
      {children}
    </div>
  ),

  /* ── Paragraph ── */
  p: ({ children }) => (
    <p className="text-[12px] leading-relaxed mb-2 last:mb-0"
      style={{ color: 'var(--out-text)', fontFamily: 'JetBrains Mono, monospace' }}>
      {children}
    </p>
  ),

  /* ── Bold / Italic ── */
  strong: ({ children }) => (
    <strong style={{ color: 'var(--out-ink)', fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: 'var(--out-text)', opacity: 0.8 }}>{children}</em>
  ),

  /* ── Lists ── */
  ul: ({ children }) => (
    <ul className="mb-2 last:mb-0 space-y-0.5 pl-0" style={{ listStyle: 'none' }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 last:mb-0 space-y-0.5 pl-0" style={{ listStyle: 'none', counterReset: 'item' }}>
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-[12px] leading-relaxed"
      style={{ color: 'var(--out-text)', fontFamily: 'JetBrains Mono, monospace' }}>
      <span style={{ color: 'var(--out-ink)', flexShrink: 0, minWidth: 10 }}>·</span>
      <span>{children}</span>
    </li>
  ),

  /* ── Code ── */
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <pre className="text-[11px] p-3 my-2 overflow-x-auto border"
          style={{
            background: '#080e08',
            borderColor: 'var(--out-ink-dim)',
            color: 'var(--out-ink)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: '1.6',
          }}>
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="px-1 py-0.5 text-[11px]"
        style={{
          background: '#0a130a',
          color: 'var(--out-ink)',
          fontFamily: 'JetBrains Mono, monospace',
          border: '1px solid var(--out-ink-dim)',
        }}>
        {children}
      </code>
    );
  },

  /* ── Table ── */
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[11px]"
        style={{ fontFamily: 'JetBrains Mono, monospace', borderColor: 'var(--out-ink-dim)' }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ borderBottom: '1px solid var(--out-ink)' }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid var(--out-ink-dim)' }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-widest font-bold"
      style={{ color: 'var(--out-ink)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5"
      style={{ color: 'var(--out-text)', verticalAlign: 'top' }}>
      {children}
    </td>
  ),

  /* ── Blockquote ── */
  blockquote: ({ children }) => (
    <blockquote className="pl-3 my-2 text-[11px]"
      style={{
        borderLeft: '2px solid var(--out-ink)',
        color: 'var(--out-muted)',
        fontFamily: 'JetBrains Mono, monospace',
      }}>
      {children}
    </blockquote>
  ),

  /* ── Horizontal rule — suppress ── */
  hr: () => null,

  /* ── Links ── */
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: 'var(--out-ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
      {children}
    </a>
  ),
};

interface Props {
  content: string;
}

export function MarkdownMessage({ content }: Props) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
