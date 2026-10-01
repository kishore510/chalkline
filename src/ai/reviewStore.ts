import { create } from 'zustand'
import type { Diagram } from '@/schema/diagram'
import { ancestors, groupById } from '@/store/groups'
import { isEdgeHidden, isGroupFrameHidden, isLayerHidden, isNodeHidden, layerIdOf } from '@/store/layers'
import type { AiModel } from './models'
import type { ReviewFinding } from './reviewFindings'
import type { ReviewFocus } from './reviewPrompt'
import type { SummaryScope } from './summaryPrompt'

/*
 * Review results: view state only. Never saved, never an undo step, never
 * exported; gone on reload. They outlive the AI sheet, so "Show shapes" can
 * close it and the AI button brings the review back. Each part remembers the
 * diagram it looked at, so an edit afterwards marks it out of date.
 */

export interface LocalRun {
  diagram: Diagram
  findings: ReviewFinding[]
}

export interface AiRun {
  diagram: Diagram
  findings: ReviewFinding[]
  note: string
  warnings: string[]
  model: AiModel
  scope: SummaryScope
  focus: readonly ReviewFocus[]
}

interface ReviewState {
  local: LocalRun | null
  ai: AiRun | null
  /** Findings dismissed for this visit, by id. Cleared when that part is run again. */
  dismissed: ReadonlySet<string>
  setLocal: (run: LocalRun) => void
  setAi: (run: AiRun) => void
  dismiss: (id: string) => void
  undismissAll: () => void
  /** For tests. */
  reset: () => void
}

const NONE: ReadonlySet<string> = new Set()
const without = (dismissed: ReadonlySet<string>, source: 'local' | 'ai') => new Set([...dismissed].filter((id) => !id.startsWith(`${source}:`)))

export const useReviewStore = create<ReviewState>()((set) => ({
  local: null,
  ai: null,
  dismissed: NONE,
  setLocal: (local) => set((s) => ({ local, dismissed: without(s.dismissed, 'local') })),
  setAi: (ai) => set((s) => ({ ai, dismissed: without(s.dismissed, 'ai') })),
  dismiss: (id) => set((s) => ({ dismissed: new Set([...s.dismissed, id]) })),
  undismissAll: () => set({ dismissed: NONE }),
  reset: () => set({ local: null, ai: null, dismissed: NONE }),
}))

/**
 * Whether the diagram's content changed since `reviewed`: its shapes,
 * connectors, groups or title. Showing or hiding a layer, selecting and
 * moving the view don't count; undoing back to the reviewed state does.
 */
export const hasChangedSince = (reviewed: Diagram, current: Diagram) =>
  reviewed.nodes !== current.nodes || reviewed.edges !== current.edges || reviewed.groups !== current.groups || reviewed.meta.title !== current.meta.title

/* ---------- Show shapes ---------- */

export interface ShapeTargets {
  /** Ids to select: the items themselves, or the collapsed group they're folded into. */
  select: string[]
  /** Items on hidden layers. */
  hidden: number
  /** The hidden layers they're on. */
  hiddenLayerIds: string[]
  /** Items folded into a collapsed group (that group is selected instead). */
  collapsed: number
  /** Items no longer in the diagram. */
  missing: number
}

/** The outermost collapsed group around a group (not counting the group itself), if any. */
function outerCollapsed(d: Diagram, groupId: string | undefined, includeSelf: boolean): string | undefined {
  const group = groupById(d, groupId)
  if (!group) return undefined
  const chain = [...(includeSelf ? [group] : []), ...ancestors(d, group)]
  return chain.filter((g) => g.collapsed).at(-1)?.id
}

/** What "Show shapes" selects for some finding ids, and what it can't show as things are. Pure. */
export function shapeTargets(d: Diagram, ids: readonly string[]): ShapeTargets {
  const select = new Set<string>()
  const hiddenLayers = new Set<string>()
  let hidden = 0
  let collapsed = 0
  let missing = 0
  const hide = (...layerIds: string[]) => {
    hidden++
    for (const id of layerIds) if (isLayerHidden(d, id)) hiddenLayers.add(id)
  }
  const fold = (id: string, into: string | undefined) => {
    if (into) {
      collapsed++
      select.add(into)
    } else select.add(id)
  }
  for (const id of ids) {
    const node = d.nodes.find((n) => n.id === id)
    if (node) {
      if (isNodeHidden(d, node)) hide(layerIdOf(node))
      else fold(id, outerCollapsed(d, node.groupId, true))
      continue
    }
    const group = d.groups.find((g) => g.id === id)
    if (group) {
      if (isGroupFrameHidden(d, group)) hide(layerIdOf(group))
      else fold(id, outerCollapsed(d, group.id, false))
      continue
    }
    const edge = d.edges.find((e) => e.id === id)
    if (edge) {
      const ends = [edge.source, edge.target].map((end) => d.nodes.find((n) => n.id === end)).filter((n) => n !== undefined)
      if (isEdgeHidden(d, edge)) hide(layerIdOf(edge), ...ends.map(layerIdOf))
      else {
        // A connector folded inside a collapsed group isn't drawn: select the group.
        const into = ends.map((n) => outerCollapsed(d, n.groupId, true)).find((g) => g !== undefined)
        fold(id, into)
      }
      continue
    }
    missing++
  }
  return { select: [...select], hidden, hiddenLayerIds: [...hiddenLayers], collapsed, missing }
}
