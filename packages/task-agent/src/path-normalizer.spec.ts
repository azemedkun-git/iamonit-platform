import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeFileClass,
  normalizeFileClassEntry,
} from './path-normalizer';

test('normalizes backend paths to apps/api', () => {
  const result = normalizeFileClass('backend/src/main.ts');

  assert.deepEqual(result.repositoryPaths, ['apps/api/src/main.ts']);
  assert.equal(result.entries[0].changed, true);
});

test('normalizes frontend paths to apps/web', () => {
  const result = normalizeFileClass('frontend/app/layout.tsx');

  assert.deepEqual(result.repositoryPaths, ['apps/web/app/layout.tsx']);
});

test('preserves already canonical paths', () => {
  const result = normalizeFileClass('apps/api/src/main.ts');

  assert.deepEqual(result.repositoryPaths, ['apps/api/src/main.ts']);
  assert.equal(result.entries[0].changed, false);
});

test('normalizes Windows separators', () => {
  const result = normalizeFileClass('frontend\\app\\layout.tsx');

  assert.deepEqual(result.repositoryPaths, ['apps/web/app/layout.tsx']);
});

test('removes a leading dot-slash', () => {
  const result = normalizeFileClass('./apps/api/src/main.ts');

  assert.deepEqual(result.repositoryPaths, ['apps/api/src/main.ts']);
});

test('normalizes multiple semicolon-separated paths in order', () => {
  const result = normalizeFileClass(
    'backend/src/main.ts; frontend/app/layout.tsx',
  );

  assert.deepEqual(result.repositoryPaths, [
    'apps/api/src/main.ts',
    'apps/web/app/layout.tsx',
  ]);
});

test('normalizes multiple comma-separated paths in order', () => {
  const result = normalizeFileClass(
    'frontend/lib/api.ts, backend/src/app.module.ts',
  );

  assert.deepEqual(result.repositoryPaths, [
    'apps/web/lib/api.ts',
    'apps/api/src/app.module.ts',
  ]);
});

test('rejects absolute POSIX paths', () => {
  assert.throws(
    () => normalizeFileClass('/Users/name/file.ts'),
    /absolute POSIX paths are not allowed/,
  );
});

test('rejects Windows drive paths', () => {
  assert.throws(
    () => normalizeFileClass('C:\\project\\file.ts'),
    /Windows drive paths are not allowed/,
  );
});

test('rejects UNC paths', () => {
  assert.throws(
    () => normalizeFileClass('\\\\server\\share\\file.ts'),
    /UNC paths are not allowed/,
  );
});

test('rejects file URLs', () => {
  assert.throws(
    () => normalizeFileClass('file:///tmp/file.ts'),
    /file:\/\/ URLs are not allowed/,
  );
});

test('rejects directory traversal', () => {
  assert.throws(
    () => normalizeFileClass('apps/api/../web/file.ts'),
    /directory traversal is not allowed/,
  );
});

test('rejects empty path entries', () => {
  assert.throws(
    () => normalizeFileClass('apps/api/src/main.ts;;apps/web/app/page.tsx'),
    /empty path entries are not allowed/,
  );
});

test('rejects ambiguous shorthand filenames', () => {
  assert.throws(
    () => normalizeFileClass('login.dto.ts'),
    /unresolved shorthand filenames require an explicit directory/,
  );
});

test('classifies plain class names as non-path metadata', () => {
  const entry = normalizeFileClassEntry('TasksService');

  assert.equal(entry.classification, 'non-path-metadata');
  assert.equal(entry.normalized, 'TasksService');
  assert.throws(
    () => normalizeFileClass('TasksService'),
    /no usable repository-relative path was found/,
  );
});

test('accepts future canonical paths without checking the filesystem', () => {
  const result = normalizeFileClass(
    'packages/future-tool/src/not-created-yet.ts',
  );

  assert.deepEqual(result.repositoryPaths, [
    'packages/future-tool/src/not-created-yet.ts',
  ]);
});
