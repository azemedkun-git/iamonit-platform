import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { GitRunner } from './git-preflight';
import { runGitPreflight } from './git-preflight';

interface GitState {
  root: string;
  branch?: string;
  status?: string;
  head?: string;
  failCommand?: string;
}

function fakeGit(state: GitState): GitRunner {
  return async (args) => {
    const command = args.join(' ');
    if (state.failCommand === command) {
      throw new Error('simulated git failure');
    }
    if (command === 'rev-parse --show-toplevel') {
      return { stdout: `${state.root}\n`, stderr: '' };
    }
    if (command === 'rev-parse --abbrev-ref HEAD') {
      return { stdout: `${state.branch ?? 'feature/test'}\n`, stderr: '' };
    }
    if (command === 'status --porcelain --untracked-files=all') {
      return { stdout: state.status ?? '', stderr: '' };
    }
    if (command === 'rev-parse HEAD') {
      return { stdout: `${state.head ?? 'abc123'}\n`, stderr: '' };
    }
    throw new Error(`unexpected git command: ${command}`);
  };
}

async function repositoryFixture(): Promise<{
  root: string;
  workbook: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preflight-test-'));
  const planning = path.join(root, 'planning');
  await mkdir(planning);
  const workbook = path.join(planning, 'workbook.xlsx');
  await writeFile(workbook, 'workbook');
  return { root, workbook };
}

async function run(
  state: GitState,
  taskValidationPassed = true,
) {
  return runGitPreflight(
    {
      startDirectory: state.root,
      workbookRelativePath: 'planning/workbook.xlsx',
      taskValidationPassed,
    },
    fakeGit(state),
  );
}

test('clean feature branch passes preflight and captures state', async () => {
  const fixture = await repositoryFixture();
  const result = await run({
    root: fixture.root,
    branch: 'feature/test',
    head: 'abc123',
  });

  assert.equal(result.repositoryRoot, fixture.root);
  assert.equal(result.branch, 'feature/test');
  assert.equal(result.headCommit, 'abc123');
  assert.equal(result.workbookSha256.length, 64);
});

test('dirty tracked file fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({ root: fixture.root, status: ' M tracked.ts' }),
    /working tree must be completely clean.*tracked\.ts/s,
  );
});

test('untracked file fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({ root: fixture.root, status: '?? untracked.ts' }),
    /working tree must be completely clean.*untracked\.ts/s,
  );
});

test('main branch fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({ root: fixture.root, branch: 'main' }),
    /protected branch "main"/,
  );
});

test('master branch fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({ root: fixture.root, branch: 'master' }),
    /protected branch "master"/,
  );
});

test('detached HEAD fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({ root: fixture.root, branch: 'HEAD' }),
    /detached HEAD/,
  );
});

test('missing workbook fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    runGitPreflight(
      {
        startDirectory: fixture.root,
        workbookRelativePath: 'planning/missing.xlsx',
        taskValidationPassed: true,
      },
      fakeGit({ root: fixture.root }),
    ),
    /authoritative workbook is missing/,
  );
});

test('Excel lock file fails preflight', async () => {
  const fixture = await repositoryFixture();
  await writeFile(path.join(fixture.root, 'planning', '~$workbook.xlsx'), '');

  await assert.rejects(
    run({ root: fixture.root }),
    /close Excel.*~\$workbook\.xlsx/,
  );
});

test('failed task validation fails preflight', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({ root: fixture.root }, false),
    /has not passed ID, dependency, and path validation/,
  );
});

test('Git command failure is reported with the failed command', async () => {
  const fixture = await repositoryFixture();
  await assert.rejects(
    run({
      root: fixture.root,
      failCommand: 'rev-parse --show-toplevel',
    }),
    /git rev-parse --show-toplevel.*simulated git failure/,
  );
});
