import path from "node:path";
import ExcelJS from "exceljs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "scripts", "templates");

export const DEPLOY_SPREADSHEET_TEMPLATE_PATH = path.join(
  TEMPLATES_DIR,
  "cx-as-code-spreadsheet-template.xlsx"
);
export const DEPLOY_SPREADSHEET_SHEET_NAME = "Template";
export const SUPPORTED_RESOURCES_TEMPLATE_PATH = path.join(
  TEMPLATES_DIR,
  "cx-as-code-supported-resources-template.xlsx"
);

export const SPREADSHEET_FONT_NAME = "Calibri";
export const SPREADSHEET_HEADER_FONT_SIZE = 12;
/** Matches deploy spreadsheet template body text (inherits Calibri 12). */
export const SPREADSHEET_DATA_FONT_SIZE = 12;

export const SPREADSHEET_DEFAULT_ROW_HEIGHT = 16;
export const SPREADSHEET_DEFAULT_COL_WIDTH = 11;
export const SPREADSHEET_HEADER_ROW_HEIGHT = 17;

/** Office 2013–2022 lt2 — explicit ARGB so theme differences between workbooks do not shift header gray. */
export const SPREADSHEET_HEADER_GRAY = "FFE7E6E6";

/** Matches deploy spreadsheet template header row (Calibri 12 bold, light gray fill). */
export const HEADER_FONT = {
  bold: true,
  name: SPREADSHEET_FONT_NAME,
  family: 2,
  scheme: "minor",
  size: SPREADSHEET_HEADER_FONT_SIZE,
  color: { theme: 1 },
};

export const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: SPREADSHEET_HEADER_GRAY },
};

/** Gray fill for deploy spreadsheet planning columns (scope, priority, repo). */
export const GRAY_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: SPREADSHEET_HEADER_GRAY },
};

/** Supported-resources top-level menu section row. */
export const MENU_SECTION_FONT = {
  bold: true,
  name: SPREADSHEET_FONT_NAME,
  family: 2,
  scheme: "minor",
  size: SPREADSHEET_HEADER_FONT_SIZE,
  color: { argb: "FF3D4F61" },
};

export const MENU_SECTION_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE3E9EF" },
};

/** Supported-resources subsection row (group under a top-level section). */
export const MENU_SUBSECTION_FONT = {
  bold: true,
  name: SPREADSHEET_FONT_NAME,
  family: 2,
  scheme: "minor",
  size: SPREADSHEET_DATA_FONT_SIZE,
  color: { argb: "FF5B6B7C" },
};

export const MENU_SUBSECTION_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F4F7" },
};

/** Leaf/data rows use the same Calibri 12 as the deploy spreadsheet. */
export const DATA_FONT = {
  name: SPREADSHEET_FONT_NAME,
  family: 2,
  scheme: "minor",
  size: SPREADSHEET_DATA_FONT_SIZE,
  color: { theme: 1 },
};

export const DEPLOY_SPREADSHEET_COLUMN_WIDTHS = {
  A: 67,
  B: 58,
  C: 16,
  D: 15,
  E: 16,
  F: 10,
  G: 9,
  H: 20,
  I: 16,
  J: 27,
  K: 50,
};

export const SUPPORTED_RESOURCES_COLUMN_WIDTHS = {
  A: 34,
  B: 12,
  C: 50,
};

export const SUPPORTED_RESOURCES_HEADERS = [
  "GUI Menu Path",
  "Supported",
  "Resource Types",
];

export const DEPLOY_SPREADSHEET_EDITING_COLUMNS = [5, 6, 7, 8];

/** Notes column (J) values in generated deploy spreadsheets. */
export const SPREADSHEET_SINGLETON_NOTE = "Only one per org";
export const SPREADSHEET_DEPRECATED_NOTE = "Deprecated";
export const SPREADSHEET_NON_EXPORTABLE_NOTE = "Cannot be exported";

/** Deploy spreadsheet column headers (hand-tuned labels; written by build-spreadsheet-templates). */
export const DEPLOY_SPREADSHEET_HEADERS = [
  "GUI Menu Path",
  "CX as Code Resource Type",
  "Division-aware",
  "Dependencies",
  "In/out of scope",
  "Shared?",
  "Priority",
  "Repo/Project/Folder",
  "Transform type",
  "Notes",
  "Recreate attributes",
];

export const DEPLOY_SPREADSHEET_DATA_COLUMN_COUNT = DEPLOY_SPREADSHEET_HEADERS.length;

/** Matches deploy spreadsheet template default zoom. */
export const SPREADSHEET_ZOOM_SCALE = 125;

export function buildWorksheetView({
  showOutlineSymbols = false,
  activeCell = "A2",
} = {}) {
  return [
    {
      state: "frozen",
      ySplit: 1,
      topLeftCell: "A2",
      zoomScale: SPREADSHEET_ZOOM_SCALE,
      zoomScaleNormal: SPREADSHEET_ZOOM_SCALE,
      showOutlineSymbols,
      activeCell,
    },
  ];
}

export function applyWorksheetView(worksheet, options = {}) {
  worksheet.views = buildWorksheetView(options);
}

export function applySpreadsheetWorksheetDefaults(worksheet) {
  worksheet.properties.defaultRowHeight = SPREADSHEET_DEFAULT_ROW_HEIGHT;
  worksheet.properties.defaultColWidth = SPREADSHEET_DEFAULT_COL_WIDTH;
}

export function applyColumnWidths(worksheet, widthsByColumn) {
  for (const [column, width] of Object.entries(widthsByColumn)) {
    worksheet.getColumn(column).width = width;
  }
}

function cellTextLength(value) {
  if (value == null) return 0;

  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.reduce(
        (length, part) => length + String(part?.text ?? "").length,
        0
      );
    }
    if (value instanceof Date) {
      return value.toISOString().length;
    }
    if (typeof value.text === "string") {
      value = value.text;
    } else {
      value = String(value);
    }
  }

  return String(value)
    .split(/[\r\n]+/)
    .reduce((max, line) => Math.max(max, line.length), 0);
}

/**
 * Sets column width from the longest cell value (header + data). One pass per column
 * after all rows are written. Approximates Excel autofit via character count.
 */
export function autoFitWorksheetColumns(
  worksheet,
  {
    columnCount,
    excludeLastColumn = true,
    minWidth = SPREADSHEET_DEFAULT_COL_WIDTH,
    padding = 2,
  } = {}
) {
  const lastFittedColumn = excludeLastColumn ? columnCount - 1 : columnCount;

  for (let column = 1; column <= lastFittedColumn; column += 1) {
    let maxLength = minWidth;
    worksheet.getColumn(column).eachCell({ includeEmpty: false }, (cell) => {
      maxLength = Math.max(maxLength, cellTextLength(cell.value));
    });
    worksheet.getColumn(column).width = maxLength + padding;
  }
}

export function applyDeploySpreadsheetLayout(worksheet) {
  applySpreadsheetWorksheetDefaults(worksheet);
  applyColumnWidths(worksheet, DEPLOY_SPREADSHEET_COLUMN_WIDTHS);

  for (let column = 1; column <= DEPLOY_SPREADSHEET_DATA_COLUMN_COUNT; column += 1) {
    worksheet.getColumn(column).hidden = false;
  }

  // Drop legacy hidden spacer column from older hand-tuned templates.
  const legacySpacer = worksheet.getColumn("L");
  legacySpacer.hidden = false;
  legacySpacer.width = undefined;
}

export function applySupportedResourcesLayout(worksheet) {
  applySpreadsheetWorksheetDefaults(worksheet);
  applyColumnWidths(worksheet, SUPPORTED_RESOURCES_COLUMN_WIDTHS);

  worksheet.properties.outlineProperties = {
    summaryBelow: false,
    summaryRight: false,
  };
}

export function styleHeaderRow(worksheet, { columnCount = worksheet.columnCount } = {}) {
  const headerRow = worksheet.getRow(1);
  headerRow.height = SPREADSHEET_HEADER_ROW_HEIGHT;

  for (let column = 1; column <= columnCount; column += 1) {
    const cell = headerRow.getCell(column);
    cell.font = { ...HEADER_FONT };
    cell.fill = { ...HEADER_FILL };
    cell.alignment = { vertical: "middle" };
  }
}

export function styleDataCell(cell) {
  cell.font = { ...DATA_FONT };
}

export function styleSectionCell(cell) {
  cell.font = { ...MENU_SECTION_FONT };
  cell.fill = { ...MENU_SECTION_FILL };
}

export function styleSubsectionCell(cell) {
  cell.font = { ...MENU_SUBSECTION_FONT };
  cell.fill = { ...MENU_SUBSECTION_FILL };
  cell.alignment = { indent: 1 };
}

export function styleLeafMenuCell(cell, { indent = 1 } = {}) {
  styleDataCell(cell);
  cell.alignment = { indent };
}

export function applyDeployEditingColumnFills(row, columns = DEPLOY_SPREADSHEET_EDITING_COLUMNS) {
  for (const column of columns) {
    row.getCell(column).fill = { ...GRAY_FILL };
  }
}

export async function loadWorkbookFromTemplate(templatePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  return workbook;
}

export function clearDataRows(worksheet, firstDataRow = 2) {
  for (let rowNumber = worksheet.rowCount; rowNumber >= firstDataRow; rowNumber -= 1) {
    worksheet.spliceRows(rowNumber, 1);
  }
}

export async function writeDeploySpreadsheetTemplate(
  templatePath = DEPLOY_SPREADSHEET_TEMPLATE_PATH
) {
  const workbook = await loadWorkbookFromTemplate(templatePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Deploy spreadsheet template is missing a worksheet.");
  }

  worksheet.name = DEPLOY_SPREADSHEET_SHEET_NAME;
  applyDeploySpreadsheetLayout(worksheet);
  clearDataRows(worksheet, 2);

  for (let index = 0; index < DEPLOY_SPREADSHEET_HEADERS.length; index += 1) {
    worksheet.getRow(1).getCell(index + 1).value = DEPLOY_SPREADSHEET_HEADERS[index];
  }

  styleHeaderRow(worksheet, {
    columnCount: DEPLOY_SPREADSHEET_HEADERS.length,
  });

  applyWorksheetView(worksheet, { activeCell: "J2" });

  await workbook.xlsx.writeFile(templatePath);
  return templatePath;
}

export async function writeSupportedResourcesTemplate(templatePath = SUPPORTED_RESOURCES_TEMPLATE_PATH) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Supported Resources");

  applySupportedResourcesLayout(worksheet);

  for (let index = 0; index < SUPPORTED_RESOURCES_HEADERS.length; index += 1) {
    worksheet.getRow(1).getCell(index + 1).value = SUPPORTED_RESOURCES_HEADERS[index];
  }

  styleHeaderRow(worksheet, { columnCount: SUPPORTED_RESOURCES_HEADERS.length });

  applyWorksheetView(worksheet, { showOutlineSymbols: true, activeCell: "C2" });

  await workbook.xlsx.writeFile(templatePath);
  return templatePath;
}
