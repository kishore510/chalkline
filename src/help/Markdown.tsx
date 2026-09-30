import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { HELP_LINK, type Block, type Inline } from './markdown'

/*
 * Renders parsed help Markdown as React elements. No HTML strings are ever
 * injected; links are either help topics or https pages in a new tab.
 */

function InlineView({ nodes, onTopic }: { nodes: Inline[]; onTopic: (id: string) => void }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-text">
            <InlineView nodes={node.children} onTopic={onTopic} />
          </strong>
        )
      case 'em':
        return (
          <em key={i}>
            <InlineView nodes={node.children} onTopic={onTopic} />
          </em>
        )
      case 'code':
        return (
          <kbd key={i} className="rounded-sm border border-border bg-surface-muted px-1 font-mono text-xs whitespace-nowrap text-text">
            {node.text}
          </kbd>
        )
      case 'link': {
        const topic = HELP_LINK.exec(node.href)?.[1]
        const children = <InlineView nodes={node.children} onTopic={onTopic} />
        return topic ? (
          <button key={i} type="button" onClick={() => onTopic(topic)} className="font-medium text-accent underline underline-offset-2">
            {children}
          </button>
        ) : (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">
            {children}
            <ExternalLink aria-label="(opens in a new tab)" className="ml-0.5 inline size-3 align-baseline" />
          </a>
        )
      }
    }
  })
}

export function Markdown({ blocks, onTopic }: { blocks: Block[]; onTopic: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm text-text">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h3 key={i} className="pt-2 text-base font-semibold">
                <InlineView nodes={block.children} onTopic={onTopic} />
              </h3>
            ) : (
              <h4 key={i} className="pt-1 text-sm font-semibold">
                <InlineView nodes={block.children} onTopic={onTopic} />
              </h4>
            )
          case 'paragraph':
            return (
              <p key={i}>
                <InlineView nodes={block.children} onTopic={onTopic} />
              </p>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={i} className={block.ordered ? 'flex list-decimal flex-col gap-1.5 pl-5' : 'flex list-disc flex-col gap-1.5 pl-5'}>
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    <InlineView nodes={item} onTopic={onTopic} />
                  </li>
                ))}
              </List>
            )
          }
          case 'tip':
            return (
              <aside key={i} className="rounded-md border border-border bg-accent-subtle px-3 py-2">
                <InlineView nodes={block.children} onTopic={onTopic} />
              </aside>
            )
        }
      })}
    </div>
  )
}
