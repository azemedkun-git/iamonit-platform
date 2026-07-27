import path from 'node:path';
import {
  AUTHORITATIVE_WORKBOOK_PATH,
  readWorkbookTasks,
} from './workbook-reader';
import { normalizeFileClass } from './path-normalizer';
import { selectEligibleTask } from './task-selector';

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    __dirname,
    '../../..',
  );
  const requestedPath =
    process.argv[2] ??
    path.resolve(repositoryRoot, AUTHORITATIVE_WORKBOOK_PATH);
  const workbookPath = path.resolve(requestedPath);
  const tasks = await readWorkbookTasks(workbookPath);
  const selected = selectEligibleTask(tasks);

  if (!selected) {
    console.log('No eligible coding task found.');
    return;
  }

  const { codingTask, relatedBacklogTasks } = selected;
  const normalizedFileClass = normalizeFileClass(codingTask.fileClass);
  const dependencies = [
    ...new Set(relatedBacklogTasks.flatMap((task) => task.dependencies)),
  ];

  console.log(`Code task: ${codingTask.code}`);
  console.log(`Related Jira task: ${codingTask.relatedJiraTasks.join(', ')}`);
  console.log(`Task description: ${codingTask.exactCodingTask}`);
  console.log(`Original File / Class: ${normalizedFileClass.original}`);
  console.log(
    `Normalized paths: ${normalizedFileClass.repositoryPaths.join(', ')}`,
  );
  console.log(
    `Path classification: ${normalizedFileClass.entries
      .map((entry) => `${entry.normalized} (${entry.classification})`)
      .join(', ')}`,
  );
  console.log(
    `Dependencies: ${dependencies.length > 0 ? dependencies.join(', ') : 'None'}`,
  );
  console.log(`Acceptance Criteria: ${codingTask.acceptanceCriteria}`);
  console.log(`Status: ${codingTask.status.trim()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Task-agent error: ${message}`);
  process.exitCode = 1;
});
