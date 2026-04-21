/**
 * Adds .js extensions to relative imports in TypeScript files (required for nodenext moduleResolution).
 * Skips imports that already have an extension or point to node_modules.
 * Run with: npx tsx scripts/add-js-extensions.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { dirname, resolve, extname } from 'node:path'
import { existsSync } from 'node:fs'

// Matches: from './foo' | from '../foo' | from './foo/bar'
// Excludes: already has extension, node: protocol
const RELATIVE_IMPORT_RE = /(from\s+['"])(\.[^'"]+)(['"])/g

function hasExtension(p: string): boolean {
  return extname(p) !== ''
}

function resolveExtension(importPath: string, fromFile: string): string | null {
  if (hasExtension(importPath)) return null // already has extension

  const dir = dirname(resolve(process.cwd(), fromFile))
  const abs = resolve(dir, importPath)

  // Try .ts first, then index.ts
  if (existsSync(`${abs}.ts`)) return `${importPath}.js`
  if (existsSync(`${abs}/index.ts`)) return `${importPath}/index.js`

  return null
}

function processFile(filePath: string): boolean {
  const content = readFileSync(filePath, 'utf-8')
  let modified = false

  const newContent = content.replace(RELATIVE_IMPORT_RE, (match, prefix, importPath, suffix) => {
    const resolved = resolveExtension(importPath, filePath)
    if (resolved) {
      modified = true
      return `${prefix}${resolved}${suffix}`
    }
    return match
  })

  if (modified) {
    writeFileSync(filePath, newContent)
  }
  return modified
}

async function main() {
  const files: string[] = []
  for await (const file of glob('src/**/*.ts')) {
    files.push(file)
  }

  let modified = 0
  for (const file of files.sort()) {
    const changed = processFile(file)
    if (changed) {
      console.log(`✓ ${file}`)
      modified++
    }
  }
  console.log(`\nDone: ${modified}/${files.length} files modified`)
}

main().catch(console.error)
