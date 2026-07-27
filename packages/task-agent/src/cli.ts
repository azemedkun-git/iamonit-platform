import path from 'node:path';
import { executeCodex } from './codex-executor';
import type { CodexExecutionResult } from './codex-executor';
import { runGitPreflight } from './git-preflight';
import type { GitPreflightResult } from './git-preflight';
import { normalizeFileClass } from './path-normalizer';
import type { NormalizedFileClass } from './path-normalizer';
import { buildCodexPrompt } from './prompt-builder';
import { selectEligibleTask } from './task-selector';
import type { SelectedCodingTask } from './task-selector';
import {
  AUTHORITATIVE_WORKBOOK_PATH,
  readWorkbookTasks,
} from './workbook-reader';
import type { WorkbookTasks } from './workbook-reader';

export enum ExitCode {
  Success = 0,
  InvalidArguments = 2,
  NoEligibleTask = 3,
  TaskValidationFailure = 4,
  GitPreflightFailure = 5,
  CodexSpawnFailure = 6,
  CodexNonZeroExit = 7,
  PostExecutionSafetyFailure = 8,
}

export type CliMode = 'plan' | 'execute' | 'help';

export interface CliDependencies {
  readTasks: (workbookPath: string) => Promise<WorkbookTasks>;
  selectTask: (tasks: WorkbookTasks) => SelectedCodingTask | null;
  normalizePaths: (fileClass: string) => NormalizedFileClass;
  buildPrompt: typeof buildCodexPrompt;
  preflight: (
    startDirectory: string,
    taskValidationPassed: boolean,
  ) => Promise<GitPreflightResult>;
  executor: (
    prompt: string,
    preflight: GitPreflightResult,
  ) => Promise<CodexExecutionResult>;
  log: (message: string) => void;
  error: (message: string) => void;
  repositoryRoot: string;
  workbookPath: string;
}

export function parseCliMode(args: string[]): CliMode {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;

  if (normalizedArgs.length === 0) {
    return 'plan';
  }

  if (normalizedArgs.length !== 1) {
    throw new Error(
      'Conflicting arguments. Use exactly one of --plan, --execute, or --help.',
    );
  }

  switch (normalizedArgs[0]) {
    case '--plan':
      return 'plan';
    case '--execute':
      return 'execute';
    case '--help':
      return 'help';
    default:
      throw new Error(
        `Unknown argument "${normalizedArgs[0]}". Use --help for usage.`,
      );
  }
}

function helpText(): string {
  return [
    'Usage: pnpm --filter @iamonit/task-agent start -- [mode]',
    '',
    'Modes:',
    '  --plan     Print the generated Codex prompt without executing Codex (default).',
    '  --execute  Run Git preflight, then invoke one controlled Codex execution.',
    '  --help     Show this help.',
  ].join('\n');
}

function defaultDependencies(): CliDependencies {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const workbookPath = path.resolve(
    repositoryRoot,
    AUTHORITATIVE_WORKBOOK_PATH,
  );

  return {
    readTasks: readWorkbookTasks,
    selectTask: selectEligibleTask,
    normalizePaths: normalizeFileClass,
    buildPrompt: buildCodexPrompt,
    preflight: (startDirectory, taskValidationPassed) =>
      runGitPreflight({
        startDirectory,
        workbookRelativePath: AUTHORITATIVE_WORKBOOK_PATH,
        taskValidationPassed,
      }),
    executor: executeCodex,
    log: console.log,
    error: console.error,
    repositoryRoot,
    workbookPath,
  };
}

function printExecutionResult(
  result: CodexExecutionResult,
  log: (message: string) => void,
  error: (message: string) => void,
): void {
  log(`Codex exit code: ${result.exitCode ?? 'none'}`);
  log(`Codex signal: ${result.signal ?? 'none'}`);
  log(`Duration: ${result.durationMs}ms`);
  log(`Final assistant message:\n${result.finalAssistantMessage}`);
  log(
    `Working tree changes: ${
      result.workingTreeChanges.length > 0
        ? result.workingTreeChanges.join(', ')
        : 'None'
    }`,
  );
  if (result.exitCode !== 0 && result.stderr.trim()) {
    error(`Codex stderr:\n${result.stderr.trimEnd()}`);
  }
  if (result.errorEvents.length > 0) {
    error(
      `Codex JSONL error events:\n${result.errorEvents
        .map((event) => event.line)
        .join('\n')}`,
    );
  }
  log('Execution stopped for human review.');
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies = defaultDependencies(),
): Promise<ExitCode> {
  let mode: CliMode;
  try {
    mode = parseCliMode(args);
  } catch (error) {
    dependencies.error(
      error instanceof Error ? error.message : String(error),
    );
    return ExitCode.InvalidArguments;
  }

  if (mode === 'help') {
    dependencies.log(helpText());
    return ExitCode.Success;
  }

  let selectedTask: SelectedCodingTask;
  let normalizedFileClass: NormalizedFileClass;
  try {
    const tasks = await dependencies.readTasks(dependencies.workbookPath);
    const selected = dependencies.selectTask(tasks);
    if (!selected) {
      dependencies.error('No eligible coding task found.');
      return ExitCode.NoEligibleTask;
    }
    selectedTask = selected;
    normalizedFileClass = dependencies.normalizePaths(
      selected.codingTask.fileClass,
    );
  } catch (error) {
    dependencies.error(
      `Task validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return ExitCode.TaskValidationFailure;
  }

  const prompt = dependencies.buildPrompt({
    selectedTask,
    normalizedFileClass,
    repositoryRoot: dependencies.repositoryRoot,
    validationCommands: [
      'pnpm --filter @iamonit/task-agent typecheck',
      'pnpm --filter @iamonit/task-agent test',
      'git diff --check',
    ],
  });

  if (mode === 'plan') {
    dependencies.log(prompt);
    return ExitCode.Success;
  }

  let preflight: GitPreflightResult;
  try {
    preflight = await dependencies.preflight(
      dependencies.repositoryRoot,
      true,
    );
  } catch (error) {
    dependencies.error(
      `Git preflight failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return ExitCode.GitPreflightFailure;
  }

  const result = await dependencies.executor(prompt, preflight);
  printExecutionResult(result, dependencies.log, dependencies.error);

  if (result.spawnError) {
    dependencies.error(`Codex spawn failed: ${result.spawnError}`);
    return ExitCode.CodexSpawnFailure;
  }
  if (result.safetyFailures.length > 0) {
    dependencies.error(
      `Post-execution safety failure: ${result.safetyFailures.join(' ')}`,
    );
    return ExitCode.PostExecutionSafetyFailure;
  }
  if (result.exitCode !== 0) {
    if (result.failureKind === 'cli-invocation') {
      dependencies.error(
        'Codex CLI invocation/configuration error (exit code 2). Check command-line arguments and configuration.',
      );
    } else {
      dependencies.error(
        `Codex task execution failed with exit code ${result.exitCode ?? 'none'}.`,
      );
    }
    return ExitCode.CodexNonZeroExit;
  }

  return ExitCode.Success;
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(
        `Task-agent error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exitCode = ExitCode.TaskValidationFailure;
    });
}
