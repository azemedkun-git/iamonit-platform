import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptions } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GitPreflightResult, GitRunner } from './git-preflight';
import { defaultGitRunner, sha256File } from './git-preflight';

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcessWithoutNullStreams;

export interface ParsedJsonlEvent {
  line: string;
  value?: unknown;
  error?: string;
}

export interface CodexExecutionResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutJsonl: string;
  stderr: string;
  events: ParsedJsonlEvent[];
  errorEvents: ParsedJsonlEvent[];
  failureKind?: 'cli-invocation' | 'task-execution';
  finalAssistantMessage: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  spawnError?: string;
  safetyFailures: string[];
  workingTreeChanges: string[];
  eventLogPath: string;
  finalMessagePath: string;
  ok: boolean;
}

export interface CodexExecutorDependencies {
  spawnProcess?: SpawnProcess;
  gitRunner?: GitRunner;
  hashFile?: (filePath: string) => Promise<string>;
  now?: () => Date;
  makeTempDirectory?: () => Promise<string>;
}

export function buildCodexArguments(
  repositoryRoot: string,
  finalMessagePath: string,
): string[] {
  return [
    '--ask-for-approval',
    'never',
    'exec',
    '--cd',
    repositoryRoot,
    '--sandbox',
    'workspace-write',
    '--ephemeral',
    '--json',
    '--color',
    'never',
    '--output-last-message',
    finalMessagePath,
    '--config',
    'sandbox_workspace_write.network_access=false',
    '-',
  ];
}

function redactEnvironmentValues(output: string): string {
  return Object.values(process.env)
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.length >= 8,
    )
    .sort((left, right) => right.length - left.length)
    .reduce(
      (redacted, value) => redacted.split(value).join('[REDACTED]'),
      output,
    );
}

export function parseJsonl(output: string): ParsedJsonlEvent[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return { line, value: JSON.parse(line) };
      } catch (error) {
        return {
          line,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}

function isErrorEvent(event: ParsedJsonlEvent): boolean {
  if (!event.value || typeof event.value !== 'object') {
    return false;
  }

  const value = event.value as Record<string, unknown>;
  return (
    (typeof value.type === 'string' &&
      value.type.toLowerCase().includes('error')) ||
    typeof value.error === 'string'
  );
}

function changedPaths(status: string): string[] {
  return status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
}

async function inspectPostExecution(
  preflight: GitPreflightResult,
  gitRunner: GitRunner,
  hashFile: (filePath: string) => Promise<string>,
): Promise<{ failures: string[]; status: string }> {
  const failures: string[] = [];
  let status = '';

  try {
    const workbookHash = await hashFile(preflight.workbookPath);
    if (workbookHash !== preflight.workbookSha256) {
      failures.push('Authoritative workbook checksum changed.');
    }

    const head = (
      await gitRunner(['rev-parse', 'HEAD'], preflight.repositoryRoot)
    ).stdout.trim();
    if (head !== preflight.headCommit) {
      failures.push('HEAD commit changed during execution.');
    }

    const branch = (
      await gitRunner(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        preflight.repositoryRoot,
      )
    ).stdout.trim();
    if (branch !== preflight.branch) {
      failures.push(
        `Git branch changed from "${preflight.branch}" to "${branch}".`,
      );
    }

    status = (
      await gitRunner(
        ['status', '--porcelain', '--untracked-files=all'],
        preflight.repositoryRoot,
      )
    ).stdout.trimEnd();
  } catch (error) {
    failures.push(
      `Post-execution safety check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return { failures, status };
}

export async function executeCodex(
  prompt: string,
  preflight: GitPreflightResult,
  dependencies: CodexExecutorDependencies = {},
): Promise<CodexExecutionResult> {
  const spawnProcess = dependencies.spawnProcess ?? (spawn as SpawnProcess);
  const gitRunner = dependencies.gitRunner ?? defaultGitRunner;
  const hashFile = dependencies.hashFile ?? sha256File;
  const now = dependencies.now ?? (() => new Date());
  const temporaryDirectory = dependencies.makeTempDirectory
    ? await dependencies.makeTempDirectory()
    : await mkdtemp(path.join(os.tmpdir(), 'iamonit-codex-'));
  const eventLogPath = path.join(temporaryDirectory, 'events.jsonl');
  const finalMessagePath = path.join(
    temporaryDirectory,
    'final-assistant-message.txt',
  );
  const args = buildCodexArguments(
    preflight.repositoryRoot,
    finalMessagePath,
  );
  const started = now();
  let stdoutJsonl = '';
  let stderr = '';
  let spawnError: string | undefined;

  const processResult = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    const child = spawnProcess('codex', args, {
      cwd: preflight.repositoryRoot,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdoutJsonl += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      spawnError = error.message;
    });
    child.on('close', (exitCode, signal) => {
      resolve({ exitCode, signal });
    });
    child.stdin.end(prompt);
  });

  const safeStdoutJsonl = redactEnvironmentValues(stdoutJsonl);
  await writeFile(eventLogPath, safeStdoutJsonl, 'utf8');
  const finalAssistantMessage = redactEnvironmentValues(
    await readFile(finalMessagePath, 'utf8').catch(() => ''),
  );
  const postExecution = await inspectPostExecution(
    preflight,
    gitRunner,
    hashFile,
  );
  const completed = now();
  const safeStderr = redactEnvironmentValues(stderr);
  const events = parseJsonl(safeStdoutJsonl);
  const errorEvents = events.filter(isErrorEvent);
  const safetyFailures = postExecution.failures;
  const ok =
    !spawnError &&
    processResult.exitCode === 0 &&
    safetyFailures.length === 0;

  return {
    command: 'codex',
    args,
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    stdoutJsonl: safeStdoutJsonl,
    stderr: safeStderr,
    events,
    errorEvents,
    failureKind:
      processResult.exitCode === 2
        ? 'cli-invocation'
        : processResult.exitCode !== 0
          ? 'task-execution'
          : undefined,
    finalAssistantMessage,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    durationMs: completed.getTime() - started.getTime(),
    spawnError,
    safetyFailures,
    workingTreeChanges: changedPaths(postExecution.status),
    eventLogPath,
    finalMessagePath,
    ok,
  };
}
