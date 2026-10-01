import type { LucideIcon } from 'lucide-react'
import type { NodeStyle, Size } from '@/schema/diagram'

/*
 * What a shape is. Every shape the editor knows lives in the registry
 * (registry.ts) as one ShapeDefinition; the canvas, palette, label fitting,
 * connector attachment and export all read from it.
 */

export type ShapeCategory = 'basic' | 'process' | 'architecture' | 'networking' | 'ai' | 'annotation'
export type Side = 'top' | 'right' | 'bottom' | 'left'
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Artwork in the node's own coordinate space (0,0 to width,height).
 * `body` paths are filled and stroked, `detail` paths are stroke only, and
 * `extent` bounds what is drawn.
 */
export interface ShapeGeometry {
  body: string[]
  detail: string[]
  extent: Box
}

/**
 * Where the label goes. `contain` labels wrap inside the box; `free` labels
 * are centred on it and may spread wider than the node.
 */
export interface LabelLayout {
  box: Box
  fit: 'contain' | 'free'
  /** Vertical alignment inside the box. */
  align: 'center' | 'start'
}

export interface ShapeDefinition {
  /** Stable id stored in diagrams. Never rename one that has shipped. */
  id: string
  name: string
  category: ShapeCategory
  /** Palette icon. */
  icon: LucideIcon
  /** What it stands for, in a few words (help reference and palette search). */
  description?: string
  /** Extra search words, so similar shapes can be told apart. */
  keywords?: readonly string[]
  defaultSize: Size
  minSize: Size
  /** Resize keeps the width:height ratio. */
  keepAspect: boolean
  defaultLabel: string
  /** Style applied to new nodes (token colours only). */
  defaultStyle: NodeStyle
  geometry: (size: Size) => ShapeGeometry
  /** The inset area where the label is laid out, clear of the artwork. */
  label: (size: Size) => LabelLayout
  /** A closed polygon approximating the visible outline (used to check attachment points). */
  outline: (size: Size) => Point[]
  /** Sides connectors may attach to. */
  sides: readonly Side[]
  /** Where a connector attaches for a side: a point on the visible outline. */
  anchor: (size: Size, side: Side) => Point
  /** Sides flat enough to spread several connectors along without leaving the outline. */
  spreadSides: readonly Side[]
}
