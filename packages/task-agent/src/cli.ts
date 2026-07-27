import path from 'node:path';
import {
  AUTHORITATIVE_WORKBOOK_PATH,
  readWorkbookTasks,
} from './workbook-reader';
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
  const dependencies = [
    ...new Set(relatedBacklogTasks.flatMap((task) => task.dependencies)),
  ];

  console.log(`Code task: ${codingTask.code}`);
  console.log(`Related Jira task: ${codingTask.relatedJiraTasks.join(', ')}`);
  console.log(
    `Jira title: ${relatedBacklogTasks.map((task) => task.title).join('; ')}`,
  );
  console.log(`Task: ${codingTask.exactCodingTask}`);
  console.log(
    `Dependencies: ${dependencies.length > 0 ? dependencies.join(', ') : 'None'}`,
  );
  console.log(`File / Class: ${codingTask.fileClass}`);
  console.log(`Acceptance Criteria: ${codingTask.acceptanceCriteria}`);
  console.log(`Status: ${codingTask.status.trim()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Task-agent error: ${message}`);
  process.exitCode = 1;
});
