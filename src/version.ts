import { SCHEMA_VERSION } from '@/schema/diagram'

/*
 * Which build this is. Values are injected at build time (vite.config.ts);
 * nothing here makes a network request.
 */

const injected = (value: unknown, fallback: string) => (typeof value === 'string' && value ? value : fallback)

export interface VersionInfo {
  /** Semver from package.json, e.g. "0.13.0". */
  version: string
  /** Short git commit SHA, or "dev" when git wasn't available at build time. */
  commit: string
  /** ISO date and time of the build. */
  buildDate: string
  /** The diagram schema version this build reads and writes. */
  schemaVersion: number
}

export const VERSION_INFO: VersionInfo = {
  version: injected(typeof __APP_VERSION__ === 'undefined' ? undefined : __APP_VERSION__, '0.0.0'),
  commit: injected(typeof __APP_COMMIT__ === 'undefined' ? undefined : __APP_COMMIT__, 'dev'),
  buildDate: injected(typeof __APP_BUILD_DATE__ === 'undefined' ? undefined : __APP_BUILD_DATE__, ''),
  schemaVersion: SCHEMA_VERSION,
}

export const APP_VERSION = VERSION_INFO.version

/** Plain-text details for bug reports ("Copy details" in About). */
export function formatVersionDetails(info: VersionInfo, userAgent: string): string {
  return [
    `Chalkline ${info.version}`,
    `Commit: ${info.commit}`,
    `Built: ${info.buildDate || 'unknown'}`,
    `Diagram schema: v${info.schemaVersion}`,
    `User agent: ${userAgent || 'unknown'}`,
  ].join('\n')
}
