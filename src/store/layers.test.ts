import { describe, expect, it } from 'vitest'
import { fixtures } from '@/fixtures'
import { parseDiagram, type Diagram } from '@/schema/diagram'
import { isGroupFixed, isNodeLocked } from './groups'
import {
  isEdgeHidden,
  isEdgeLocked,
  isGroupFrameHidden,
  isNodeHidden,
  layerCounts,
  layerIdOf,
  nearestUsableLayer,
  withLayer,
} from './layers'

const base = () => parseDiagram(fixtures.layers)
const node = (d: Diagram, id: string) => d.nodes.find((n) => n.id === id)!
const edge = (d: Diagram, id: string) => d.edges.find((e) => e.id === id)!
const group = (d: Diagram, id: string) => d.groups.find((g) => g.id === id)!
const setLayer = (d: Diagram, id: string, patch: { visible?: boolean; locked?: boolean }): Diagram => ({
  ...d,
  layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
})

describe('layerIdOf', () => {
  it('treats a missing layerId as the default layer', () => {
    const d = base()
    expect(layerIdOf(node(d, 'n_client'))).toBe('default')
    expect(layerIdOf(node(d, 'n_firewall'))).toBe('l_security')
  })
})

describe('isHidden', () => {
  it('hides nodes on hidden layers', () => {
    const d = base()
    expect(isNodeHidden(d, node(d, 'n_note'))).toBe(true)
    expect(isNodeHidden(d, node(d, 'n_client'))).toBe(false)
  })

  it('hides an edge on a hidden layer, or touching a hidden node', () => {
    const d = base()
    expect(isEdgeHidden(d, edge(d, 'e_note_db'))).toBe(true)
    const onBase = { ...d, edges: d.edges.map((e) => (e.id === 'e_note_db' ? withLayer(e, undefined) : e)) }
    expect(isEdgeHidden(onBase, edge(onBase, 'e_note_db'))).toBe(true)
    expect(isEdgeHidden(d, edge(d, 'e_client_api'))).toBe(false)
  })

  it('hiding a group’s layer hides only its frame; members on other layers stay visible', () => {
    const d = setLayer(base(), 'l_security', { visible: false })
    expect(isGroupFrameHidden(d, group(d, 'g_zone'))).toBe(true)
    expect(isNodeHidden(d, node(d, 'n_api'))).toBe(false)
    expect(isNodeHidden(d, node(d, 'n_firewall'))).toBe(true)
    expect(isEdgeHidden(d, edge(d, 'e_firewall_api'))).toBe(true)
    expect(isEdgeHidden(d, edge(d, 'e_api_db'))).toBe(false)
  })
})

describe('isLocked', () => {
  it('locks items on a locked layer, combined with their own flag', () => {
    const d = setLayer(base(), 'l_security', { locked: true })
    expect(isNodeLocked(d, node(d, 'n_firewall'))).toBe(true)
    expect(isNodeLocked(d, node(d, 'n_client'))).toBe(false)
    const flagged = { ...d, nodes: d.nodes.map((n) => (n.id === 'n_client' ? { ...n, locked: true } : n)) }
    expect(isNodeLocked(flagged, node(flagged, 'n_client'))).toBe(true)
  })

  it('an edge is locked by its own layer only', () => {
    const d = setLayer(base(), 'l_security', { locked: true })
    expect(isEdgeLocked(d, edge(d, 'e_firewall_api'))).toBe(true)
    // Its endpoint API is on Base, and the edge to it from the client is on Base: not locked.
    expect(isEdgeLocked(d, edge(d, 'e_client_api'))).toBe(false)
  })

  it('a group on a locked layer is fixed, but its members on other layers are not locked by that', () => {
    const d = setLayer(base(), 'l_security', { locked: true })
    expect(isGroupFixed(d, group(d, 'g_zone'))).toBe(true)
    expect(isNodeLocked(d, node(d, 'n_api'))).toBe(false)
  })

  it('a locked group (4b flag) still locks its members, whatever their layer', () => {
    const d = base()
    const flagged = { ...d, groups: d.groups.map((g) => ({ ...g, locked: true })) }
    expect(isNodeLocked(flagged, node(flagged, 'n_api'))).toBe(true)
  })
})

describe('layer helpers', () => {
  it('counts items per layer', () => {
    expect(layerCounts(base())).toEqual(new Map([['default', 5], ['l_security', 3], ['l_notes', 2]]))
  })

  it('finds the nearest visible, unlocked layer', () => {
    const d = base()
    expect(nearestUsableLayer(d, 'l_notes')).toBe('l_security')
    const locked = setLayer(d, 'l_security', { locked: true })
    expect(nearestUsableLayer(locked, 'l_notes')).toBe('default')
    const none = setLayer(setLayer(locked, 'default', { visible: false }), 'l_notes', { locked: true })
    expect(nearestUsableLayer(none, 'l_notes')).toBeNull()
  })
})
