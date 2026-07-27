import path from 'node:path';
import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';

export const AUTHORITATIVE_WORKBOOK_PATH =
  'planning/IAMONIT_Full_Project_Control_Workbook.xlsx';

export interface BacklogTask {
  taskId: string;
  title: string;
  status: string;
  dependencies: string[];
}

export interface CodingTask {
  code: string;
  layer: string;
  module: string;
  fileClass: string;
  exactCodingTask: string;
  implementationNotes: string;
  relatedJiraTasks: string[];
  acceptanceCriteria: string;
  status: string;
  workbookOrder: number;
}

export interface WorkbookTasks {
  backlogTasks: BacklogTask[];
  codingTasks: CodingTask[];
}

type SheetRecord = Record<string, string>;

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase();
}

function requireSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
): Worksheet {
  const sheet = workbook.getWorksheet(sheetName);

  if (!sheet) {
    throw new Error(`Required worksheet "${sheetName}" was not found.`);
  }

  return sheet;
}

function readRecords(sheet: Worksheet): SheetRecord[] {
  const headers = new Map<number, string>();
  const headerRow = sheet.getRow(1);

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers.set(columnNumber, normalizedHeader(cell.text));
  });

  const records: SheetRecord[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const record: SheetRecord = {};
    let hasContent = false;

    for (const [columnNumber, header] of headers) {
      const value = row.getCell(columnNumber).text.trim();
      record[header] = value;
      hasContent ||= value.length > 0;
    }

    if (hasContent) {
      records.push(record);
    }
  }

  return records;
}

function requiredValue(
  record: SheetRecord,
  header: string,
  sheetName: string,
): string {
  const value = record[normalizedHeader(header)]?.trim();

  if (!value) {
    throw new Error(
      `Missing "${header}" value in worksheet "${sheetName}".`,
    );
  }

  return value;
}

export function parseDependencies(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((dependency) => dependency.trim())
    .filter((dependency) => dependency.length > 0);
}

function assertSafeWorkbookPath(workbookPath: string): void {
  const fileName = path.basename(workbookPath);

  if (fileName.startsWith('~$')) {
    throw new Error(`Refusing to read Excel lock file "${fileName}".`);
  }
}

export async function readWorkbookTasks(
  workbookPath: string,
): Promise<WorkbookTasks> {
  assertSafeWorkbookPath(workbookPath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const backlogSheet = requireSheet(workbook, 'Backlog');
  const codingSheet = requireSheet(workbook, 'IntelliJ Coding Tasks');

  const backlogTasks = readRecords(backlogSheet).map((record) => ({
    taskId: requiredValue(record, 'Task ID', 'Backlog'),
    title: requiredValue(record, 'Title', 'Backlog'),
    status: requiredValue(record, 'Status', 'Backlog'),
    dependencies: parseDependencies(record[normalizedHeader('Dependencies')]),
  }));

  const codingTasks = readRecords(codingSheet).map((record, index) => {
    const relatedJiraTasks = parseDependencies(
      requiredValue(record, 'Related Jira Task', 'IntelliJ Coding Tasks'),
    );

    return {
      code: requiredValue(record, 'Code', 'IntelliJ Coding Tasks'),
      layer: requiredValue(record, 'Layer', 'IntelliJ Coding Tasks'),
      module: requiredValue(record, 'Module', 'IntelliJ Coding Tasks'),
      fileClass: requiredValue(
        record,
        'File / Class',
        'IntelliJ Coding Tasks',
      ),
      exactCodingTask: requiredValue(
        record,
        'Exact Coding Task',
        'IntelliJ Coding Tasks',
      ),
      implementationNotes:
        record[normalizedHeader('Implementation Notes')]?.trim() ?? '',
      relatedJiraTasks,
      acceptanceCriteria: requiredValue(
        record,
        'Acceptance Criteria',
        'IntelliJ Coding Tasks',
      ),
      status: requiredValue(record, 'Status', 'IntelliJ Coding Tasks'),
      workbookOrder: index,
    };
  });

  return { backlogTasks, codingTasks };
}
