import ExcelJS from "exceljs";
import {
  applyOverrides,
  getHiddenResourceTypes,
} from "./dependency-tree-overrides.mjs";

const FILTER_SHEET_NAME = "Sheet1";
const VALIDATION_SHEET_NAME = "validation";
const RESOURCE_TYPE_COLUMN = "B";
const FIRST_DATA_ROW = 2;
const LAST_FILTER_ROW = 2001;

export function listResourceTypes(raw, overrides = {}) {
  const hidden = getHiddenResourceTypes(overrides);
  const patched = applyOverrides(raw, overrides);
  const types = new Set();

  for (const resource of patched?.resources || []) {
    if (!resource || typeof resource.type !== "string") continue;
    const type = resource.type.trim();
    if (!type || hidden.has(type)) continue;
    types.add(type);
  }

  return [...types].sort((a, b) => a.localeCompare(b));
}

function resolveWorksheet(workbook, preferredName, fallbackIndex) {
  return (
    workbook.getWorksheet(preferredName) ||
    workbook.worksheets[fallbackIndex] ||
    null
  );
}

function clearValidationRows(validationSheet) {
  const existingRows = validationSheet.rowCount;
  if (existingRows > 1) {
    validationSheet.spliceRows(FIRST_DATA_ROW, existingRows - 1);
  }
}

function buildValidationFormula(lastDataRow) {
  if (lastDataRow < FIRST_DATA_ROW) {
    return `${VALIDATION_SHEET_NAME}!$A$${FIRST_DATA_ROW}:$A$${FIRST_DATA_ROW}`;
  }
  return `${VALIDATION_SHEET_NAME}!$A$${FIRST_DATA_ROW}:$A$${lastDataRow}`;
}

export async function patchFilterBuilderTemplate(templatePath, resourceTypes) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const filterSheet = resolveWorksheet(workbook, FILTER_SHEET_NAME, 0);
  const validationSheet = resolveWorksheet(workbook, VALIDATION_SHEET_NAME, 1);

  if (!filterSheet || !validationSheet) {
    throw new Error(
      `Filter builder template is missing required worksheets (${FILTER_SHEET_NAME}, ${VALIDATION_SHEET_NAME}).`
    );
  }

  clearValidationRows(validationSheet);

  for (let index = 0; index < resourceTypes.length; index += 1) {
    validationSheet.getRow(FIRST_DATA_ROW + index).getCell(1).value =
      resourceTypes[index];
  }

  const lastDataRow =
    resourceTypes.length > 0 ? FIRST_DATA_ROW + resourceTypes.length - 1 : FIRST_DATA_ROW;

  const dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [buildValidationFormula(lastDataRow)],
  };

  for (let row = FIRST_DATA_ROW; row <= LAST_FILTER_ROW; row += 1) {
    filterSheet.getCell(`${RESOURCE_TYPE_COLUMN}${row}`).dataValidation =
      dataValidation;
  }

  await workbook.xlsx.writeFile(templatePath);
}
