import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  buildCodexArguments,
  executeCodex,
} from './codex-executor';
import type { SpawnProcess } from './codex-executor';
import type { GitPreflightResult, GitRunner } from './git-preflight';

interface SpawnRecord {
  command?: string;
  args?: readonly string[];
  options?: Record<string, unknown>;
  stdin?: string;
}

interface FakeSpawnOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  spawnError?: Error;
  finalMessage?: string;
}

function fakeSpawn(
  fake: FakeSpawnOptions,
  record: SpawnRecord,
): SpawnProcess {
  return (command, args, options) => {
    record.command = command;
    record.args = args;
    record.options = options as Record<string, unknown>;

    const process = new EventEmitter() as ChildProcessWithoutNullStreams;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(process, { stdin, stdout, stderr });

    let input = '';
    stdin.on('data', (chunk) => {
      input += chunk.toString();
    });
    stdin.on('finish', () => {
      record.stdin = input;
    });

    setImmediate(async () => {
      if (fake.stdout) stdout.write(fake.stdout);
      if (fake.stderr) stderr.write(fake.stderr);
      stdout.end();
      stderr.end();

      if (fake.finalMessage !== undefined) {
        const outputIndex = args.indexOf('--output-last-message');
        await writeFile(
          String(args[outputIndex + 1]),
          fake.finalMessage,
          'utf8',
        );
      }

      if (fake.spawnError) {
        process.emit('error', fake.spawnError);
      }
      process.emit(
        'close',
        fake.exitCode === undefined ? 0 : fake.exitCode,
        fake.signal ?? null,
      );
    });

    return process;
  };
}

async function fixture(): Promise<{
  preflight: GitPreflightResult;
  tempDirectory: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'executor-test-'));
  const planning = path.join(root, 'planning');
  await mkdir(planning);
  const workbookPath = path.join(planning, 'workbook.xlsx');
  await writeFile(workbookPath, 'workbook');
  return {
    preflight: {
      repositoryRoot: root,
      branch: 'feature/test',
      headCommit: 'abc123',
      statusPorcelain: '',
      workbookPath,
      workbookSha256: 'hash-before',
    },
    tempDirectory: await mkdtemp(path.join(os.tmpdir(), 'executor-output-')),
  };
}

function postGit(
  preflight: GitPreflightResult,
  overrides: { head?: string; branch?: string; status?: string } = {},
): GitRunner {
  return async (args) => {
    const command = args.join(' ');
    if (command === 'rev-parse HEAD') {
      return { stdout: `${overrides.head ?? preflight.headCommit}\n`, stderr: '' };
    }
    if (command === 'rev-parse --abbrev-ref HEAD') {
      return { stdout: `${overrides.branch ?? preflight.branch}\n`, stderr: '' };
    }
    if (command === 'status --porcelain --untracked-files=all') {
      return { stdout: overrides.status ?? '', stderr: '' };
    }
    throw new Error(`unexpected command ${command}`);
  };
}

test('constructs the required safe codex exec arguments', () => {
  const args = buildCodexArguments('/repo', '/tmp/final.txt');

  assert.deepEqual(args, [
    '--ask-for-approval',
    'never',
    'exec',
    '--cd',
    '/repo',
    '--sandbox',
    'workspace-write',
    '--ephemeral',
    '--json',
    '--color',
    'never',
    '--output-last-message',
    '/tmp/final.txt',
    '--config',
    'sandbox_workspace_write.network_access=false',
    '-',
  ]);
  const execIndex = args.indexOf('exec');
  assert.ok(args.indexOf('--ask-for-approval') < execIndex);
  assert.ok(args.indexOf('never') < execIndex);
  for (const execFlag of [
    '--cd',
    '--sandbox',
    '--ephemeral',
    '--json',
    '--color',
    '--output-last-message',
    '--config',
  ]) {
    assert.ok(args.indexOf(execFlag) > execIndex);
  }
  for (const forbidden of [
    '--full-auto',
    '--dangerously-bypass-approvals-and-sandbox',
    '--skip-git-repo-check',
    '--search',
    '--ignore-rules',
  ]) {
    assert.equal(args.includes(forbidden), false);
  }
});

test('uses spawn with shell false and passes the complete prompt through stdin', async () => {
  const { preflight, tempDirectory } = await fixture();
  const record: SpawnRecord = {};
  await executeCodex('full prompt', preflight, {
    spawnProcess: fakeSpawn({}, record),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.equal(record.command, 'codex');
  assert.equal(record.args?.[2], 'exec');
  assert.equal(record.options?.shell, false);
  assert.equal(record.options?.cwd, preflight.repositoryRoot);
  assert.equal(record.args?.at(-1), '-');
  assert.equal(record.stdin, 'full prompt');
});

test('captures successful JSONL and the final assistant message', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn(
      {
        stdout: '{"type":"started"}\n{"type":"completed"}\n',
        finalMessage: 'Completed safely.',
      },
      {},
    ),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].error, undefined);
  assert.equal(result.finalAssistantMessage, 'Completed safely.');
});

test('reports malformed JSONL without crashing result collection', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn({ stdout: '{"ok":true}\nnot-json\n' }, {}),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.equal(result.events.length, 2);
  assert.match(result.events[1].error ?? '', /Unexpected token|JSON/);
});

test('handles a missing Codex executable', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn(
      { spawnError: new Error('spawn codex ENOENT'), exitCode: null },
      {},
    ),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.match(result.spawnError ?? '', /ENOENT/);
  assert.equal(result.ok, false);
});

test('captures a non-zero Codex exit and stderr', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn({ exitCode: 9, stderr: 'failed' }, {}),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.equal(result.exitCode, 9);
  assert.equal(result.stderr, 'failed');
  assert.equal(result.ok, false);
  assert.equal(result.failureKind, 'task-execution');
});

test('classifies exit code 2 as a CLI invocation error and retains JSONL errors', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn(
      {
        exitCode: 2,
        stderr: 'unexpected argument',
        stdout: '{"type":"error","message":"invalid configuration"}\n',
      },
      {},
    ),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.equal(result.failureKind, 'cli-invocation');
  assert.equal(result.stderr, 'unexpected argument');
  assert.equal(result.errorEvents.length, 1);
});

test('redacts environment-variable values from captured Codex output', async () => {
  const { preflight, tempDirectory } = await fixture();
  const variableName = 'IAMONIT_EXECUTOR_TEST_SECRET';
  const previousValue = process.env[variableName];
  process.env[variableName] = 'super-secret-value';

  try {
    const result = await executeCodex('prompt', preflight, {
      spawnProcess: fakeSpawn(
        {
          exitCode: 2,
          stderr: 'failure: super-secret-value',
          stdout:
            '{"type":"error","message":"super-secret-value"}\n',
          finalMessage: 'super-secret-value',
        },
        {},
      ),
      gitRunner: postGit(preflight),
      hashFile: async () => 'hash-before',
      makeTempDirectory: async () => tempDirectory,
    });

    assert.equal(result.stderr.includes('super-secret-value'), false);
    assert.equal(result.stdoutJsonl.includes('super-secret-value'), false);
    assert.equal(
      result.finalAssistantMessage.includes('super-secret-value'),
      false,
    );
    assert.match(result.stderr, /\[REDACTED\]/);
  } finally {
    if (previousValue === undefined) {
      delete process.env[variableName];
    } else {
      process.env[variableName] = previousValue;
    }
  }
});

test('detects a changed workbook checksum', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn({}, {}),
    gitRunner: postGit(preflight),
    hashFile: async () => 'hash-after',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.deepEqual(result.safetyFailures, [
    'Authoritative workbook checksum changed.',
  ]);
});

test('detects a changed HEAD commit', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn({}, {}),
    gitRunner: postGit(preflight, { head: 'different' }),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.deepEqual(result.safetyFailures, [
    'HEAD commit changed during execution.',
  ]);
});

test('detects a changed branch', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn({}, {}),
    gitRunner: postGit(preflight, { branch: 'feature/other' }),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.match(result.safetyFailures[0], /Git branch changed/);
});

test('reports every post-run working-tree change without cleaning it', async () => {
  const { preflight, tempDirectory } = await fixture();
  const result = await executeCodex('prompt', preflight, {
    spawnProcess: fakeSpawn({}, {}),
    gitRunner: postGit(preflight, {
      status: ' M src/changed.ts\n?? src/new.ts\n D src/deleted.ts',
    }),
    hashFile: async () => 'hash-before',
    makeTempDirectory: async () => tempDirectory,
  });

  assert.deepEqual(result.workingTreeChanges, [
    'src/changed.ts',
    'src/new.ts',
    'src/deleted.ts',
  ]);
});
