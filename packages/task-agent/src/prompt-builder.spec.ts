import assert from 'node:assert/strict';
import test from 'node:test';
import type { NormalizedFileClass } from './path-normalizer';
import { buildCodexPrompt } from './prompt-builder';
import type { SelectedCodingTask } from './task-selector';

function fixture(): {
  selectedTask: SelectedCodingTask;
  normalizedFileClass: NormalizedFileClass;
  repositoryRoot: string;
  validationCommands: string[];
} {
  return {
    selectedTask: {
      codingTask: {
        code: 'CODE-043',
        layer: 'Tooling',
        module: 'task-agent',
        fileClass: 'backend/src/main.ts',
        exactCodingTask: 'Build controlled execution',
        implementationNotes: 'Use spawn without a shell.',
        relatedJiraTasks: ['IAM-073'],
        acceptanceCriteria: 'Plan mode never executes Codex.',
        status: 'Todo',
        workbookOrder: 42,
      },
      relatedBacklogTasks: [
        {
          taskId: 'IAM-073',
          title: 'Controlled execution',
          status: 'In Progress',
          dependencies: ['IAM-071', 'IAM-072'],
        },
      ],
    },
    normalizedFileClass: {
      original: 'backend/src/main.ts',
      entries: [
        {
          original: 'backend/src/main.ts',
          normalized: 'apps/api/src/main.ts',
          classification: 'repository-path',
          changed: true,
        },
      ],
      repositoryPaths: ['apps/api/src/main.ts'],
    },
    repositoryRoot: '/workspace/iamonit-platform',
    validationCommands: ['pnpm test'],
  };
}

test('prompt includes every selected-task field and repository root', () => {
  const prompt = buildCodexPrompt(fixture());

  for (const expected of [
    'CODE_TASK_ID: CODE-043',
    'RELATED_JIRA_TASK: IAM-073',
    'EXACT_CODING_TASK: Build controlled execution',
    'IMPLEMENTATION_NOTES: Use spawn without a shell.',
    'DEPENDENCIES: IAM-071, IAM-072',
    'ORIGINAL_FILE_CLASS: backend/src/main.ts',
    'ACCEPTANCE_CRITERIA: Plan mode never executes Codex.',
    'CURRENT_TRACKER_STATUS: Todo',
    'REPOSITORY_ROOT: /workspace/iamonit-platform',
    '- pnpm test',
  ]) {
    assert.match(prompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('prompt includes normalized repository paths', () => {
  assert.match(
    buildCodexPrompt(fixture()),
    /NORMALIZED_REPOSITORY_PATHS: apps\/api\/src\/main\.ts/,
  );
});

test('prompt prohibits workbook changes and task-status changes', () => {
  const prompt = buildCodexPrompt(fixture());

  assert.match(
    prompt,
    /Never modify planning\/IAMONIT_Full_Project_Control_Workbook\.xlsx/,
  );
  assert.match(prompt, /Never modify task IDs or tracker statuses/);
});

test('prompt prohibits Git history changes and push', () => {
  assert.match(
    buildCodexPrompt(fixture()),
    /Never commit, amend, rebase, merge, tag, or push/,
  );
});

test('prompt requires Review or Blocked and never Done', () => {
  const prompt = buildCodexPrompt(fixture());

  assert.match(prompt, /RECOMMENDED_TRACKER_STATUS: Review \| Blocked/);
  assert.match(prompt, /never Done/);
});

test('prompt output is deterministic', () => {
  const input = fixture();

  assert.equal(buildCodexPrompt(input), buildCodexPrompt(input));
});
