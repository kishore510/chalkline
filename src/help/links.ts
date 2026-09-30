/*
 * Topic ids that the rest of the app links to. Small and eagerly loaded; the
 * topics themselves load with the help sheet. A test checks each id exists.
 */

export const HELP_AREAS = {
  quickStart: 'quick-start',
  gestures: 'gestures-and-shortcuts',
} as const

/** "Learn more" links from the editor chrome. */
export const LEARN_MORE = {
  linkMode: 'connectors',
  connectorProperties: 'connectors',
} as const
