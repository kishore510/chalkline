import type { AutosaveLoad } from '@/persistence/autosave'

/*
 * First run: the welcome shows only for someone who has never used Chalkline
 * in this browser (flag in settings) and only when nothing was loaded: no
 * autosave (not even a damaged or newer one), no sample opened from the
 * address, no file. Pure, so it can be tested.
 */

/** What startup found: the autosave status, or 'skipped' when a sample was opened from the address instead. */
export type StartupLoad = AutosaveLoad['status'] | 'skipped'

export function shouldWelcome(firstRunDone: boolean, startup: StartupLoad, diagramEmpty: boolean): boolean {
  return !firstRunDone && startup === 'none' && diagramEmpty
}

/** Startup found saved work (even unreadable), so this isn't a first visit. */
export const foundSavedWork = (startup: StartupLoad) => startup === 'ok' || startup === 'corrupt' || startup === 'newer'
