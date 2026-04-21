/**
 * Adds explicit vitest imports to spec files that rely on globals.
 * Run with: npx tsx scripts/add-vitest-imports.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'

const VITEST_GLOBALS = ['describe', 'it', 'test', 'expect', 'vi', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']

async function processFile(filePath: string): Promise<boolean> {
  const content = readFileSync(filePath, 'utf-8')

  // Collect which globals are actually used in the file
  const used = VITEST_GLOBALS.filter((name) => {
    // Match as a word boundary usage, not inside an import from 'vitest'
    const regex = new RegExp(`(?<!['"\\w])${name}\\s*[\\(\\.]`, 'g')
    return regex.test(content)
  })

  if (used.length === 0) return false

  // Check which are already imported from vitest
  const existingImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]vitest['"]/)
  const alreadyImported = existingImportMatch
    ? existingImportMatch[1].split(',').map((s) => s.trim())
    : []

  const toAdd = used.filter((name) => !alreadyImported.includes(name))
  if (toAdd.length === 0) return false

  let newContent: string
  if (existingImportMatch) {
    // Merge into existing import
    const allImports = [...new Set([...alreadyImported, ...toAdd])].sort()
    newContent = content.replace(
      /import\s*\{[^}]+\}\s*from\s*['"]vitest['"]/,
      `import { ${allImports.join(', ')} } from 'vitest'`,
    )
  } else {
    // Prepend new import after any leading comments/blank lines
    const importLine = `import { ${toAdd.sort().join(', ')} } from 'vitest'\n`
    // Insert before the first non-comment, non-blank line that isn't already an import
    const lines = content.split('\n')
    let insertAt = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('import ') || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line === '') {
        insertAt = i + 1
      } else {
        break
      }
    }
    lines.splice(insertAt, 0, importLine.trimEnd())
    newContent = lines.join('\n')
  }

  writeFileSync(filePath, newContent)
  return true
}

async function main() {
  const files: string[] = []
  for await (const file of glob('src/**/*.{spec.ts,e2e-spec.ts}')) {
    files.push(file)
  }

  let modified = 0
  for (const file of files.sort()) {
    const changed = await processFile(file)
    if (changed) {
      console.log(`✓ ${file}`)
      modified++
    }
  }
  console.log(`\nDone: ${modified}/${files.length} files modified`)
}

main().catch(console.error)
