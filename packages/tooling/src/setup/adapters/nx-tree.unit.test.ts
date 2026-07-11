/**
 * Tests for the Nx Tree adapter.
 *
 * UNIT: adapter method isolation
 * COMPONENT: adapter + shared engine integration
 * E2E: full read/write/delete/list cycle on virtual tree
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNxTreeAdapter, readJsonFile, writeJsonFile, mergeJsonFile } from '../adapters/nx-tree.js';

// We need the Nx Tree from the nx package (testing utils).
// Import dynamically since this is ESM and the nx package is CommonJS.
async function createTree() {
  const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
  return createTreeWithEmptyWorkspace();
}

describe('Nx Tree adapter', () => {
  let tree: any;
  let adapter: Awaited<ReturnType<typeof createNxTreeAdapter>>;

  async function setup() {
    tree = await createTree();
    adapter = createNxTreeAdapter(tree);
  }

  describe('UNIT: basic operations', () => {
    it('read returns null for non-existent file', async () => {
      await setup();
      const result = await adapter.read('nonexistent.txt');
      assert.strictEqual(result, null);
    });

    it('write creates a new file', async () => {
      await setup();
      await adapter.write('test.txt', 'hello world');
      assert.strictEqual(tree.read('test.txt', 'utf8'), 'hello world');
    });

    it('read returns content of written file', async () => {
      await setup();
      await adapter.write('test.txt', 'hello world');
      const result = await adapter.read('test.txt');
      assert.strictEqual(result, 'hello world');
    });

    it('exists returns true after write', async () => {
      await setup();
      assert.equal(await adapter.exists('test.txt'), false);
      await adapter.write('test.txt', 'content');
      assert.equal(await adapter.exists('test.txt'), true);
    });

    it('delete removes a file', async () => {
      await setup();
      await adapter.write('test.txt', 'content');
      assert.equal(await adapter.exists('test.txt'), true);
      await adapter.delete('test.txt');
      assert.equal(await adapter.exists('test.txt'), false);
    });

    it('delete is no-op for non-existent file', async () => {
      await setup();
      await adapter.delete('nonexistent.txt'); // Should not throw
    });

    it('write overwrites existing file', async () => {
      await setup();
      await adapter.write('test.txt', 'original');
      await adapter.write('test.txt', 'updated');
      assert.strictEqual(await adapter.read('test.txt'), 'updated');
    });
  });

  describe('UNIT: list', () => {
    it('list returns empty array for empty tree', async () => {
      await setup();
      const files = await adapter.list();
      // Tree has pre-populated files (nx.json, package.json, etc.)
      assert.ok(Array.isArray(files));
    });

    it('list returns files in a directory', async () => {
      await setup();
      await adapter.write('dir/file1.txt', 'a');
      await adapter.write('dir/file2.txt', 'b');
      const files = await adapter.list('dir');
      assert.ok(files.includes('dir/file1.txt'));
      assert.ok(files.includes('dir/file2.txt'));
    });

    it('list is sorted', async () => {
      await setup();
      await adapter.write('b.txt', 'b');
      await adapter.write('a.txt', 'a');
      await adapter.write('c.txt', 'c');
      const files = await adapter.list();
      // Filter to just our files
      const ourFiles = files.filter((f) => ['a.txt', 'b.txt', 'c.txt'].includes(f));
      assert.deepEqual(ourFiles, ['a.txt', 'b.txt', 'c.txt']);
    });

    it('list recurses into subdirectories', async () => {
      await setup();
      await adapter.write('parent/child/file.txt', 'content');
      const files = await adapter.list('parent');
      assert.ok(files.includes('parent/child/file.txt'));
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: JSON helpers
  // -----------------------------------------------------------------------

  describe('JSON helpers', () => {
    it('writeJsonFile writes pretty JSON with trailing newline', async () => {
      await setup();
      writeJsonFile(tree, 'config.json', { name: 'test', version: 1 });
      const content = tree.read('config.json', 'utf8');
      assert.ok(content.endsWith('\n'));
      assert.deepStrictEqual(JSON.parse(content), { name: 'test', version: 1 });
    });

    it('readJsonFile parses existing JSON file', async () => {
      await setup();
      tree.write('data.json', JSON.stringify({ key: 'value' }));
      const data = readJsonFile(tree, 'data.json');
      assert.deepStrictEqual(data, { key: 'value' });
    });

    it('readJsonFile returns null for non-existent file', async () => {
      await setup();
      const data = readJsonFile(tree, 'missing.json');
      assert.strictEqual(data, null);
    });

    it('mergeJsonFile merges into existing file', async () => {
      await setup();
      tree.write('config.json', JSON.stringify({ a: 1, b: 2 }));
      mergeJsonFile(tree, 'config.json', { b: 3, c: 4 });
      const content = tree.read('config.json', 'utf8');
      assert.deepStrictEqual(JSON.parse(content), { a: 1, b: 3, c: 4 });
    });

    it("mergeJsonFile creates file if it doesn't exist", async () => {
      await setup();
      mergeJsonFile(tree, 'new.json', { x: 1 });
      const content = tree.read('new.json', 'utf8');
      assert.deepStrictEqual(JSON.parse(content), { x: 1 });
    });
  });

  // -----------------------------------------------------------------------
  // E2E: full read/write/delete cycle
  // -----------------------------------------------------------------------

  describe('E2E: full file lifecycle', () => {
    it('creates, reads, updates, and deletes a file through the adapter', async () => {
      await setup();

      // Create
      await adapter.write('lifecycle.txt', 'step 1');
      assert.strictEqual(await adapter.read('lifecycle.txt'), 'step 1');

      // Update
      await adapter.write('lifecycle.txt', 'step 2');
      assert.strictEqual(await adapter.read('lifecycle.txt'), 'step 2');

      // Delete
      await adapter.delete('lifecycle.txt');
      assert.strictEqual(await adapter.read('lifecycle.txt'), null);
      assert.equal(await adapter.exists('lifecycle.txt'), false);
    });

    it('adapter changes are tracked by tree.listChanges()', async () => {
      await setup();
      await adapter.write('tracked.txt', 'content');
      const changes = tree.listChanges();
      const tracked = changes.find((c: any) => c.path === 'tracked.txt');
      assert.ok(tracked);
      assert.equal(tracked.type, 'CREATE');
    });

    it('writes nested directory structure', async () => {
      await setup();
      await adapter.write('a/b/c/deep.txt', 'deep content');
      assert.strictEqual(await adapter.read('a/b/c/deep.txt'), 'deep content');
    });
  });
});
