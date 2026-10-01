/*
 * Sample diagrams on demand: the fixtures and the stress generator are
 * loaded only when one is opened (#/fixture/<name>, or Load example), so they
 * stay out of the app's first download.
 */

const STRESS = /^stress-(\d{1,4})$/

/** A sample by name, or undefined if there is none. stress-<n> generates n shapes (up to 5000). */
export async function loadSample(name: string): Promise<unknown> {
  const stress = STRESS.exec(name)?.[1]
  if (stress) {
    const count = Number(stress)
    if (count < 1 || count > 5000) return undefined
    const { stressDiagram } = await import('./stress')
    return stressDiagram(count)
  }
  const { fixtures } = await import('./index')
  return fixtures[name]
}
