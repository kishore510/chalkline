import allShapes from './all-shapes.json'
import container from './container.json'
import empty from './empty.json'
import invalidDanglingEdge from './invalid-dangling-edge.json'
import labelCases from './label-cases.json'
import legacyV1 from './legacy-v1.json'
import swimlanePool from './swimlane-pool.json'
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
}

/** Documents saved by older versions, exactly as written then; they must load through migration. */
export const legacyFixtures: Record<string, unknown> = {
  'v1-web-architecture': legacyV1,
}

/** Deliberately broken documents, used to check loading fails cleanly. */
export const invalidFixtures: Record<string, unknown> = {
  'invalid-dangling-edge': invalidDanglingEdge,
}
