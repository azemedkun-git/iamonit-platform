import type {
  BacklogTask,
  CodingTask,
  WorkbookTasks,
} from './workbook-reader';

function assertUniqueIds(
  values: string[],
  kind: 'Backlog task ID' | 'coding task ID',
): void {
  const seen = new Set<string>();

  for (const value of values) {
    const id = value.trim();

    if (seen.has(id)) {
      throw new Error(`Duplicate ${kind} "${id}" found.`);
    }

    seen.add(id);
  }
}

export interface ValidatedWorkbookTasks {
  backlogById: ReadonlyMap<string, BacklogTask>;
  codingTasks: readonly CodingTask[];
}

export function validateWorkbookTasks(
  tasks: WorkbookTasks,
): ValidatedWorkbookTasks {
  assertUniqueIds(
    tasks.backlogTasks.map((task) => task.taskId),
    'Backlog task ID',
  );
  assertUniqueIds(
    tasks.codingTasks.map((task) => task.code),
    'coding task ID',
  );

  const backlogById = new Map(
    tasks.backlogTasks.map((task) => [task.taskId.trim(), task]),
  );

  for (const task of tasks.backlogTasks) {
    for (const dependency of task.dependencies) {
      if (!backlogById.has(dependency)) {
        throw new Error(
          `Unknown dependency ID "${dependency}" referenced by Backlog task "${task.taskId}".`,
        );
      }
    }
  }

  for (const codingTask of tasks.codingTasks) {
    for (const relatedJiraTask of codingTask.relatedJiraTasks) {
      if (!backlogById.has(relatedJiraTask)) {
        throw new Error(
          `Unknown related Jira task ID "${relatedJiraTask}" referenced by coding task "${codingTask.code}".`,
        );
      }
    }
  }

  return {
    backlogById,
    codingTasks: tasks.codingTasks,
  };
}
