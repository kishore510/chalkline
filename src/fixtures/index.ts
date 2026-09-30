import allShapes from './all-shapes.json'
import empty from './empty.json'
import webArchitecture from './web-architecture.json'

/** Raw fixtures, exactly as they would be read from a saved file. */
export const fixtures: Record<string, unknown> = {
  empty,
  'all-shapes': allShapes,
  'web-architecture': webArchitecture,
}
