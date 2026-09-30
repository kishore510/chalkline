/* Values injected at build time by vite.config.ts (`define`). See src/build/buildInfo.ts. */

/** package.json version. */
declare const __APP_VERSION__: string
/** Short git commit SHA, or "dev". */
declare const __APP_COMMIT__: string
/** ISO date and time of the build. */
declare const __APP_BUILD_DATE__: string
/** Bundled open-source packages and their licences. */
declare const __APP_CREDITS__: import('./buildInfo').Credit[]
