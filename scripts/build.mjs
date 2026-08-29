/**
 * Build both plugin halves the way the dsh web composition loads them:
 *
 * - lib/index.js  — host half: a plain ESM bundle, all package imports kept
 *   external (the dsh plugin loader resolves @deepseek-ai/* itself).
 * - lib/client.js — browser half: a CJS bundle wrapped in the
 *   window.__ModuleLoader__.load({ id, factory }) envelope, with react and
 *   @deepseek-ai/dsh-client-* satisfied by the web shell's module registry.
 */

import { context } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

/** The host half: ESM with every bare specifier external. */
const hostOptions = {
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: 'external',
  logLevel: 'info',
}

/** The module-loader envelope the dsh web shell expects for client halves. */
const clientOptions = {
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  outfile: resolve(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  packages: 'external',
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
  banner: {
    js: `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(pkg.name)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`,
  },
  footer: { js: '\n\t\treturn module.exports;\n\t}\n});\n' },
}

const host = await context(hostOptions)
const client = await context(clientOptions)
if (watch) {
  await host.watch()
  await client.watch()
} else {
  await host.rebuild()
  await client.rebuild()
  await host.dispose()
  await client.dispose()
}
