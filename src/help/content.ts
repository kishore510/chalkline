import changelogText from '../../CHANGELOG.md?raw'
import { parseChangelog } from './changelog'
import { buildTopics } from './topics'

/*
 * The help content, bundled at build time. Only the lazily loaded help sheet
 * imports this, so none of it is part of the initial download.
 */

const files = import.meta.glob<string>('./topics/*.md', { query: '?raw', import: 'default', eager: true })

export const HELP_TOPICS = buildTopics(files)

export const topicById = (id: string) => HELP_TOPICS.find((t) => t.id === id)

export const CHANGELOG_TEXT = changelogText

/** Parsed releases, newest first, or null if the file couldn't be parsed (then show the text as is). */
export const CHANGELOG = parseChangelog(changelogText)
