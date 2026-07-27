import type {
  BacklogTask,
  CodingTask,
  WorkbookTasks,
} from './workbook-reader';
import { validateWorkbookTasks } from './task-validator';

export interface SelectedCodingTask {
  codingTask: CodingTask;
  relatedBacklogTasks: BacklogTask[];
}

function normalizedStatus(status: string): string {
  return status.trim().toLowerCase();
}

function isDone(task: BacklogTask): boolean {
  return normalizedStatus(task.status) === 'done';
}

export function selectEligibleTask(
  tasks: WorkbookTasks,
): SelectedCodingTask | null {
  const validated = validateWorkbookTasks(tasks);

  for (const codingTask of validated.codingTasks) {
    if (normalizedStatus(codingTask.status) !== 'todo') {
      continue;
    }

    const relatedBacklogTasks = codingTask.relatedJiraTasks.map(
      (relatedJiraTask) => {
        const task = validated.backlogById.get(relatedJiraTask);

        if (!task) {
          throw new Error(
            `Unknown related Jira task ID "${relatedJiraTask}" referenced by coding task "${codingTask.code}".`,
          );
        }

        return task;
      },
    );

    const dependenciesAreDone = relatedBacklogTasks.every((backlogTask) =>
      backlogTask.dependencies.every((dependencyId) => {
        const dependency = validated.backlogById.get(dependencyId);
        return dependency ? isDone(dependency) : false;
      }),
    );

    if (dependenciesAreDone) {
      return { codingTask, relatedBacklogTasks };
    }
  }

  return null;
}
