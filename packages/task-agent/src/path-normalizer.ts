export type PathClassification =
  | 'repository-path'
  | 'non-path-metadata';

export interface NormalizedPathEntry {
  original: string;
  normalized: string;
  classification: PathClassification;
  changed: boolean;
}

export interface NormalizedFileClass {
  original: string;
  entries: NormalizedPathEntry[];
  repositoryPaths: string[];
}

const canonicalPrefixes = [
  'apps/api/',
  'apps/web/',
  'packages/',
  'planning/',
  'docs/',
  'infra/',
] as const;

function validationError(entry: string, reason: string): Error {
  return new Error(`Invalid File / Class entry "${entry}": ${reason}.`);
}

function assertSafePath(entry: string, slashNormalized: string): void {
  if (/^file:\/\//i.test(entry)) {
    throw validationError(entry, 'file:// URLs are not allowed');
  }

  if (/^[A-Za-z]:[\\/]/.test(entry)) {
    throw validationError(entry, 'Windows drive paths are not allowed');
  }

  if (/^\\\\/.test(entry) || slashNormalized.startsWith('//')) {
    throw validationError(entry, 'UNC paths are not allowed');
  }

  if (slashNormalized.startsWith('/')) {
    throw validationError(entry, 'absolute POSIX paths are not allowed');
  }

  if (slashNormalized.split('/').includes('..')) {
    throw validationError(entry, 'directory traversal is not allowed');
  }
}

function looksLikeShorthandFilename(value: string): boolean {
  return !value.includes('/') && /(^|[^.])\.[A-Za-z0-9]+$/.test(value);
}

export function normalizeFileClassEntry(
  rawEntry: string,
): NormalizedPathEntry {
  const original = rawEntry.trim();

  if (!original) {
    throw validationError(rawEntry, 'empty path entries are not allowed');
  }

  let normalized = original.replaceAll('\\', '/');
  assertSafePath(original, normalized);

  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (!normalized) {
    throw validationError(original, 'path is empty after normalization');
  }

  assertSafePath(original, normalized);

  if (normalized.startsWith('backend/')) {
    normalized = `apps/api/${normalized.slice('backend/'.length)}`;
  } else if (normalized.startsWith('frontend/')) {
    normalized = `apps/web/${normalized.slice('frontend/'.length)}`;
  }

  if (looksLikeShorthandFilename(normalized)) {
    throw validationError(
      original,
      'unresolved shorthand filenames require an explicit directory',
    );
  }

  const hasDirectoryComponent = normalized.includes('/');
  const isCanonical = canonicalPrefixes.some((prefix) =>
    normalized.startsWith(prefix),
  );
  const classification: PathClassification =
    hasDirectoryComponent || isCanonical
      ? 'repository-path'
      : 'non-path-metadata';

  return {
    original,
    normalized,
    classification,
    changed: original !== normalized,
  };
}

export function normalizeFileClass(
  fileClass: string,
): NormalizedFileClass {
  const rawEntries = fileClass.split(/[;,]/);
  const entries = rawEntries.map(normalizeFileClassEntry);
  const repositoryPaths = entries
    .filter((entry) => entry.classification === 'repository-path')
    .map((entry) => entry.normalized);

  if (repositoryPaths.length === 0) {
    throw new Error(
      `Invalid File / Class value "${fileClass}": no usable repository-relative path was found.`,
    );
  }

  return {
    original: fileClass,
    entries,
    repositoryPaths,
  };
}
