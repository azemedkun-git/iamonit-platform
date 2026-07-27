import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BacklogTask,
  CodingTask,
  WorkbookTasks,
} from './workbook-reader';
import { selectEligibleTask } from './task-selector';

function backlogTask(
  taskId: string,
  status: string,
  dependencies: string[] = [],
): BacklogTask {
  return {
    taskId,
    title: `Title for ${taskId}`,
    status,
    dependencies,
  };
}

function codingTask(
  code: string,
  relatedJiraTask: string,
  status = 'Todo',
  workbookOrder = 0,
): CodingTask {
  return {
    code,
    layer: 'Tooling',
    module: 'task-agent',
    fileClass: 'packages/task-agent/src/cli.ts',
    exactCodingTask: `Implement ${code}`,
    implementationNotes: '',
    relatedJiraTasks: [relatedJiraTask],
    acceptanceCriteria: `${code} works`,
    status,
    workbookOrder,
  };
}

function workbookTasks(
  backlogTasks: BacklogTask[],
  codingTasks: CodingTask[],
): WorkbookTasks {
  return { backlogTasks, codingTasks };
}

test('status filtering skips Done, In Progress, Blocked, and Review case-insensitively', () => {
  const statuses = [' Done ', 'in progress', 'BLOCKED', ' Review '];
  const backlog = statuses.map((_, index) =>
    backlogTask(`IAM-00${index + 1}`, 'Done'),
  );
  backlog.push(backlogTask('IAM-005', 'In Progress'));

  const coding = statuses.map((status, index) =>
    codingTask(`CODE-00${index + 1}`, `IAM-00${index + 1}`, status, index),
  );
  coding.push(codingTask('CODE-005', 'IAM-005', ' Todo ', 4));

  const selected = selectEligibleTask(workbookTasks(backlog, coding));

  assert.equal(selected?.codingTask.code, 'CODE-005');
});

test('selects a Todo task when every dependency is Done', () => {
  const selected = selectEligibleTask(
    workbookTasks(
      [
        backlogTask('IAM-001', ' done '),
        backlogTask('IAM-002', 'DONE'),
        backlogTask('IAM-003', 'In Progress', ['IAM-001', 'IAM-002']),
      ],
      [codingTask('CODE-001', 'IAM-003')],
    ),
  );

  assert.equal(selected?.codingTask.code, 'CODE-001');
});

test('does not select a task with an incomplete dependency', () => {
  const selected = selectEligibleTask(
    workbookTasks(
      [
        backlogTask('IAM-001', 'Todo'),
        backlogTask('IAM-002', 'In Progress', ['IAM-001']),
      ],
      [codingTask('CODE-001', 'IAM-002')],
    ),
  );

  assert.equal(selected, null);
});

test('fails clearly when a dependency ID is unknown', () => {
  assert.throws(
    () =>
      selectEligibleTask(
        workbookTasks(
          [backlogTask('IAM-002', 'Todo', ['IAM-999'])],
          [codingTask('CODE-001', 'IAM-002')],
        ),
      ),
    /Unknown dependency ID "IAM-999".*"IAM-002"/,
  );
});

test('fails clearly when Backlog or coding task IDs are duplicated', () => {
  assert.throws(
    () =>
      selectEligibleTask(
        workbookTasks(
          [backlogTask('IAM-001', 'Done'), backlogTask('IAM-001', 'Todo')],
          [codingTask('CODE-001', 'IAM-001')],
        ),
      ),
    /Duplicate Backlog task ID "IAM-001"/,
  );

  assert.throws(
    () =>
      selectEligibleTask(
        workbookTasks(
          [backlogTask('IAM-001', 'Done')],
          [
            codingTask('CODE-001', 'IAM-001'),
            codingTask('CODE-001', 'IAM-001'),
          ],
        ),
      ),
    /Duplicate coding task ID "CODE-001"/,
  );
});

test('selects only the first eligible coding task in workbook order', () => {
  const selected = selectEligibleTask(
    workbookTasks(
      [
        backlogTask('IAM-001', 'Done'),
        backlogTask('IAM-002', 'In Progress', ['IAM-001']),
        backlogTask('IAM-003', 'In Progress', ['IAM-001']),
      ],
      [
        codingTask('CODE-001', 'IAM-002', 'Todo', 0),
        codingTask('CODE-002', 'IAM-003', 'Todo', 1),
      ],
    ),
  );

  assert.equal(selected?.codingTask.code, 'CODE-001');
});
