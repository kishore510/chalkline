/*
 * Build-time information, gathered by vite.config.ts and injected with
 * `define`. Node-only: nothing in the app imports this file (the app reads
 * the injected values through src/version.ts and src/help/credits.ts).
 */

/** Short commit SHA, or "dev" when git or the history isn't available (e.g. a source tarball). */
export function readCommit(run: (command: string) => string): string {
  try {
    const sha = run('git rev-parse --short HEAD').trim()
    return /^[0-9a-f]{4,40}$/.test(sha) ? sha : 'dev'
  } catch {
    return 'dev'
  }
}

/** One bundled open-source package, for the credits list in About. */
export interface Credit {
  name: string
  version: string
  license: string
  /** Project page, if the package names one. */
  url?: string
}

interface PackageJson {
  name?: string
  version?: string
  license?: unknown
  homepage?: unknown
  repository?: unknown
  dependencies?: Record<string, string>
}

function urlOf(pkg: PackageJson): string | undefined {
  const raw = typeof pkg.homepage === 'string' ? pkg.homepage : typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository as { url?: unknown } | undefined)?.url
  if (typeof raw !== 'string') return undefined
  const url = raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
  return /^https:\/\//.test(url) ? url : undefined
}

/**
 * The app's runtime dependencies and everything they depend on, with their
 * licences, read from package metadata. `read` returns a package's parsed
 * package.json (or undefined if it isn't installed). Dev dependencies aren't
 * bundled, so they aren't listed.
 */
export function collectCredits(root: PackageJson, read: (name: string) => PackageJson | undefined): Credit[] {
  const seen = new Map<string, Credit>()
  const queue = Object.keys(root.dependencies ?? {})
  while (queue.length > 0) {
    const name = queue.shift()!
    if (seen.has(name)) continue
    const pkg = read(name)
    if (!pkg) continue
    const url = urlOf(pkg)
    seen.set(name, {
      name,
      version: pkg.version ?? '',
      license: typeof pkg.license === 'string' ? pkg.license : 'See package',
      ...(url && { url }),
    })
    queue.push(...Object.keys(pkg.dependencies ?? {}))
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
