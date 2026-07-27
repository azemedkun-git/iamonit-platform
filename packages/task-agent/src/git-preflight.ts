import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export type GitRunner = (
  args: string[],
  cwd: string,
) => Promise<GitCommandResult>;

export interface GitPreflightInput {
  startDirectory: string;
  workbookRelativePath: string;
  taskValidationPassed: boolean;
}

export interface GitPreflightResult {
  repositoryRoot: string;
  branch: string;
  headCommit: string;
  statusPorcelain: string;
  workbookPath: string;
  workbookSha256: string;
}

export async function defaultGitRunner(
  args: string[],
  cwd: string,
): Promise<GitCommandResult> {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function sha256File(filePath: string): Promise<string> {
  const contents = await readFile(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

async function runGit(
  runner: GitRunner,
  args: string[],
  cwd: string,
): Promise<string> {
  try {
    const result = await runner(args, cwd);
    return result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Git preflight failed while running "git ${args.join(' ')}": ${message}`,
    );
  }
}

export async function runGitPreflight(
  input: GitPreflightInput,
  gitRunner: GitRunner = defaultGitRunner,
): Promise<GitPreflightResult> {
  const repositoryRoot = await runGit(
    gitRunner,
    ['rev-parse', '--show-toplevel'],
    input.startDirectory,
  );

  if (!repositoryRoot) {
    throw new Error('Git preflight failed: not inside a Git repository.');
  }

  const branch = await runGit(
    gitRunner,
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    repositoryRoot,
  );

  if (!branch || branch === 'HEAD') {
    throw new Error('Git preflight failed: detached HEAD is not allowed.');
  }

  if (branch === 'main' || branch === 'master') {
    throw new Error(
      `Git preflight failed: protected branch "${branch}" is not allowed.`,
    );
  }

  const statusPorcelain = await runGit(
    gitRunner,
    ['status', '--porcelain', '--untracked-files=all'],
    repositoryRoot,
  );

  if (statusPorcelain) {
    throw new Error(
      `Git preflight failed: working tree must be completely clean.\n${statusPorcelain}`,
    );
  }

  if (!input.taskValidationPassed) {
    throw new Error(
      'Git preflight failed: selected task has not passed ID, dependency, and path validation.',
    );
  }

  const workbookPath = path.resolve(
    repositoryRoot,
    input.workbookRelativePath,
  );
  try {
    await access(workbookPath);
  } catch {
    throw new Error(
      `Git preflight failed: authoritative workbook is missing at "${workbookPath}".`,
    );
  }

  const planningDirectory = path.dirname(workbookPath);
  const lockFile = (await readdir(planningDirectory)).find((file) =>
    file.startsWith('~$'),
  );
  if (lockFile) {
    throw new Error(
      `Git preflight failed: close Excel and remove lock file "${lockFile}".`,
    );
  }

  const headCommit = await runGit(
    gitRunner,
    ['rev-parse', 'HEAD'],
    repositoryRoot,
  );
  const workbookSha256 = await sha256File(workbookPath);

  return {
    repositoryRoot,
    branch,
    headCommit,
    statusPorcelain,
    workbookPath,
    workbookSha256,
  };
}
