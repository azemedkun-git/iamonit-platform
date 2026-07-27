import type { NormalizedFileClass } from './path-normalizer';
import type { SelectedCodingTask } from './task-selector';

export interface PromptBuilderInput {
  selectedTask: SelectedCodingTask;
  normalizedFileClass: NormalizedFileClass;
  repositoryRoot: string;
  validationCommands?: string[];
}

export function buildCodexPrompt(input: PromptBuilderInput): string {
  const { codingTask, relatedBacklogTasks } = input.selectedTask;
  const dependencies = [
    ...new Set(relatedBacklogTasks.flatMap((task) => task.dependencies)),
  ];
  const commands =
    input.validationCommands && input.validationCommands.length > 0
      ? input.validationCommands.map((command) => `- ${command}`).join('\n')
      : '- Determine and run the applicable non-mutating validation commands.';

  return [
    `Implement coding task ${codingTask.code}.`,
    '',
    'TASK CONTEXT',
    `CODE_TASK_ID: ${codingTask.code}`,
    `RELATED_JIRA_TASK: ${codingTask.relatedJiraTasks.join(', ')}`,
    `EXACT_CODING_TASK: ${codingTask.exactCodingTask}`,
    `IMPLEMENTATION_NOTES: ${codingTask.implementationNotes || 'None'}`,
    `DEPENDENCIES: ${dependencies.length > 0 ? dependencies.join(', ') : 'None'}`,
    `ORIGINAL_FILE_CLASS: ${input.normalizedFileClass.original}`,
    `NORMALIZED_REPOSITORY_PATHS: ${input.normalizedFileClass.repositoryPaths.join(', ')}`,
    `ACCEPTANCE_CRITERIA: ${codingTask.acceptanceCriteria}`,
    `CURRENT_TRACKER_STATUS: ${codingTask.status.trim()}`,
    `REPOSITORY_ROOT: ${input.repositoryRoot}`,
    '',
    'REQUIRED VALIDATION COMMANDS',
    commands,
    '',
    'MANDATORY INSTRUCTIONS',
    '1. Read and follow AGENTS.md.',
    '2. Implement only the selected coding task.',
    '3. Inspect existing code before editing.',
    '4. Modify only task-related files.',
    '5. Treat normalized paths as repository-relative boundaries.',
    '6. Add or update appropriate tests.',
    '7. Run applicable type-check, tests, lint, and build commands.',
    '8. Avoid mutating formatter or lint commands unless required by the task.',
    '9. Never modify planning/IAMONIT_Full_Project_Control_Workbook.xlsx.',
    '10. Never modify task IDs or tracker statuses.',
    '11. Never commit, amend, rebase, merge, tag, or push.',
    '12. Never access secrets or display .env values.',
    '13. Never use live web access or install unrelated dependencies.',
    '14. Stop after completing this one task.',
    '15. Return the structured completion report below.',
    '',
    'COMPLETION REPORT',
    'STATUS: SUCCESS | PARTIAL | BLOCKED | FAILURE',
    `TASK_ID: ${codingTask.code}`,
    `RELATED_JIRA_TASK: ${codingTask.relatedJiraTasks.join(', ')}`,
    'SUMMARY:',
    'FILES_CREATED:',
    'FILES_MODIFIED:',
    'COMMANDS_RUN:',
    'TEST_RESULTS:',
    'REMAINING_ISSUES:',
    'RECOMMENDED_TRACKER_STATUS: Review | Blocked',
    '',
    'RECOMMENDED_TRACKER_STATUS must be Review or Blocked, never Done.',
  ].join('\n');
}
