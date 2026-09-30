import allShapes from './all-shapes.json'
import empty from './empty.json'
import invalidDanglingEdge from './invalid-dangling-edge.json'
import labelCases from './label-cases.json'
import webArchitecture from './web-architecture.json'

/** Raw fixtures, exactly as they would be read from a saved file. All must be valid. */
export const fixtures: Record<string, unknown> = {
  empty,
  'all-shapes': allShapes,
  'web-architecture': webArchitecture,
  /** Every shape with short, one-word, multi-word, long and single-long-word labels. */
  'label-cases': labelCases,
}

/** Deliberately broken documents, used to check loading fails cleanly. */
export const invalidFixtures: Record<string, unknown> = {
  'invalid-dangling-edge': invalidDanglingEdge,
}
