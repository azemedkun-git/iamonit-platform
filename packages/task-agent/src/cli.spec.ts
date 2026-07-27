import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExitCode,
  parseCliMode,
  runCli,
} from './cli';
import type { CliDependencies } from './cli';
import type { CodexExecutionResult } from './codex-executor';
import type { GitPreflightResult } from './git-preflight';
import type { SelectedCodingTask } from './task-selector';

function selectedTask(): SelectedCodingTask {
  return {
    codingTask: {
      code: 'CODE-043',
      layer: 'Tooling',
      module: 'task-agent',
      fileClass: 'packages/task-agent/src/cli.ts',
      exactCodingTask: 'Build controlled execution',
      implementationNotes: 'Use spawn.',
      relatedJiraTasks: ['IAM-073'],
      acceptanceCriteria: 'Plan mode is safe.',
      status: 'Todo',
      workbookOrder: 0,
    },
    relatedBacklogTasks: [
      {
        taskId: 'IAM-073',
        title: 'Controlled execution',
        status: 'In Progress',
        dependencies: ['IAM-071'],
      },
    ],
  };
}

function preflight(): GitPreflightResult {
  return {
    repositoryRoot: '/repo',
    branch: 'feature/test',
    headCommit: 'abc',
    statusPorcelain: '',
    workbookPath: '/repo/planning/workbook.xlsx',
    workbookSha256: 'hash',
  };
}

function executionResult(): CodexExecutionResult {
  return {
    command: 'codex',
    args: ['exec', '-'],
    exitCode: 0,
    signal: null,
    stdoutJsonl: '',
    stderr: '',
    events: [],
    errorEvents: [],
    finalAssistantMessage: 'done',
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    durationMs: 1,
    safetyFailures: [],
    workingTreeChanges: [],
    eventLogPath: '/tmp/events.jsonl',
    finalMessagePath: '/tmp/final.txt',
    ok: true,
  };
}

function dependencies(events: string[]): CliDependencies {
  return {
    readTasks: async () => {
      events.push('read');
      return { backlogTasks: [], codingTasks: [] };
    },
    selectTask: () => {
      events.push('select');
      return selectedTask();
    },
    normalizePaths: (fileClass) => {
      events.push('normalize');
      return {
        original: fileClass,
        entries: [
          {
            original: fileClass,
            normalized: fileClass,
            classification: 'repository-path',
            changed: false,
          },
        ],
        repositoryPaths: [fileClass],
      };
    },
    buildPrompt: () => {
      events.push('prompt');
      return 'generated prompt';
    },
    preflight: async () => {
      events.push('preflight');
      return preflight();
    },
    executor: async () => {
      events.push('execute');
      return executionResult();
    },
    log: (message) => events.push(`log:${message}`),
    error: (message) => events.push(`error:${message}`),
    repositoryRoot: '/repo',
    workbookPath: '/repo/planning/workbook.xlsx',
  };
}

test('no arguments default to plan mode', () => {
  assert.equal(parseCliMode([]), 'plan');
});

test('pnpm argument separator is accepted', () => {
  assert.equal(parseCliMode(['--', '--plan']), 'plan');
  assert.equal(parseCliMode(['--', '--execute']), 'execute');
  assert.equal(parseCliMode(['--', '--help']), 'help');
});

test('--plan prints the prompt and never invokes preflight or executor', async () => {
  const events: string[] = [];
  const exitCode = await runCli(['--plan'], dependencies(events));

  assert.equal(exitCode, ExitCode.Success);
  assert.equal(events.includes('preflight'), false);
  assert.equal(events.includes('execute'), false);
  assert.equal(events.includes('log:generated prompt'), true);
});

test('--execute performs preflight before executor invocation', async () => {
  const events: string[] = [];
  const exitCode = await runCli(['--execute'], dependencies(events));

  assert.equal(exitCode, ExitCode.Success);
  assert.ok(events.indexOf('preflight') < events.indexOf('execute'));
});

test('invalid and conflicting flags fail clearly', async () => {
  const unknownEvents: string[] = [];
  const conflictingEvents: string[] = [];

  assert.equal(
    await runCli(['--unknown'], dependencies(unknownEvents)),
    ExitCode.InvalidArguments,
  );
  assert.match(unknownEvents.join('\n'), /Unknown argument/);
  assert.equal(
    await runCli(
      ['--plan', '--execute'],
      dependencies(conflictingEvents),
    ),
    ExitCode.InvalidArguments,
  );
  assert.match(conflictingEvents.join('\n'), /Conflicting arguments/);
});

test('CLI selects exactly one task', async () => {
  const events: string[] = [];
  await runCli([], dependencies(events));

  assert.equal(events.filter((event) => event === 'select').length, 1);
});

test('--help does not read the workbook or select a task', async () => {
  const events: string[] = [];
  const exitCode = await runCli(['--help'], dependencies(events));

  assert.equal(exitCode, ExitCode.Success);
  assert.equal(events.includes('read'), false);
  assert.equal(events.includes('select'), false);
  assert.match(events.join('\n'), /--execute/);
});

test('no eligible task exits distinctly without invoking executor', async () => {
  const events: string[] = [];
  const deps = dependencies(events);
  deps.selectTask = () => null;

  const exitCode = await runCli([], deps);

  assert.equal(exitCode, ExitCode.NoEligibleTask);
  assert.equal(events.includes('execute'), false);
});

test('preflight failure prevents executor invocation', async () => {
  const events: string[] = [];
  const deps = dependencies(events);
  deps.preflight = async () => {
    events.push('preflight');
    throw new Error('dirty tree');
  };

  const exitCode = await runCli(['--execute'], deps);

  assert.equal(exitCode, ExitCode.GitPreflightFailure);
  assert.equal(events.includes('execute'), false);
});

test('non-zero Codex exits print stderr and report task execution failure', async () => {
  const events: string[] = [];
  const deps = dependencies(events);
  deps.executor = async () => ({
    ...executionResult(),
    exitCode: 9,
    stderr: 'task failed',
    failureKind: 'task-execution',
    ok: false,
  });

  const exitCode = await runCli(['--execute'], deps);

  assert.equal(exitCode, ExitCode.CodexNonZeroExit);
  assert.match(events.join('\n'), /Codex stderr:\ntask failed/);
  assert.match(events.join('\n'), /task execution failed with exit code 9/);
});

test('exit code 2 reports a CLI invocation/configuration error and JSONL errors', async () => {
  const events: string[] = [];
  const deps = dependencies(events);
  deps.executor = async () => ({
    ...executionResult(),
    exitCode: 2,
    stderr: 'unexpected argument',
    errorEvents: [
      {
        line: '{"type":"error","message":"invalid configuration"}',
        value: { type: 'error', message: 'invalid configuration' },
      },
    ],
    failureKind: 'cli-invocation',
    ok: false,
  });

  const exitCode = await runCli(['--execute'], deps);

  assert.equal(exitCode, ExitCode.CodexNonZeroExit);
  assert.match(events.join('\n'), /invocation\/configuration error/);
  assert.match(events.join('\n'), /JSONL error events/);
  assert.match(events.join('\n'), /invalid configuration/);
});
