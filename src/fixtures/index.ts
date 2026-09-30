import allShapes from './all-shapes.json'
import architecture from './architecture.json'
import container from './container.json'
import empty from './empty.json'
import everyShape from './every-shape.json'
import invalidDanglingEdge from './invalid-dangling-edge.json'
import labelCases from './label-cases.json'
import layers from './layers.json'
import legacyV1 from './legacy-v1.json'
import legacyV2 from './legacy-v2.json'
import legacyV3 from './legacy-v3.json'
import processFlow from './process-flow.json'
import swimlanePool from './swimlane-pool.json'
import unknownShape from './unknown-shape.json'
import webArchitecture from './web-architecture.json'

/** Raw fixtures, exactly as they would be read from a saved file. All must be valid. */
export const fixtures: Record<string, unknown> = {
  empty,
  'all-shapes': allShapes,
  'web-architecture': webArchitecture,
  /** Every shape with short, one-word, multi-word, long and single-long-word labels. */
  'label-cases': labelCases,
  /** A container holding three nodes, plus one outside. */
  container,
  /** A horizontal pool with three lanes and connectors across them. */
  'swimlane-pool': swimlanePool,
  /** A node whose shape this version doesn't know; it must load, draw as a rectangle and save unchanged. */
  'unknown-shape': unknownShape,
  /** Every registry shape once, labelled with its name. */
  'every-shape': everyShape,
  /** Start, input, decision with two branches, and end. */
  'process-flow': processFlow,
  /** User group, cloud, servers, queue and database. */
  architecture,
  /** Base, "Security overlay" and a hidden "Notes" layer, with items and connectors crossing layers. */
  layers,
}

/** Documents saved by older versions, exactly as written then; they must load through migration. */
export const legacyFixtures: Record<string, unknown> = {
  'v1-web-architecture': legacyV1,
  'v2-container': legacyV2,
  'v3-process-flow': legacyV3,
}

/** Deliberately broken documents, used to check loading fails cleanly. */
export const invalidFixtures: Record<string, unknown> = {
  'invalid-dangling-edge': invalidDanglingEdge,
}
