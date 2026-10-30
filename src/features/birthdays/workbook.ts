import ExcelJS from 'exceljs';

export interface BirthdayRecord {
  readonly name: string;
  readonly userId: string;
  readonly month: number;
  readonly day: number;
}

const snowflake = /^\d{17,20}$/;
const excelEpoch = Date.UTC(1899, 11, 30);
const dayMilliseconds = 24 * 60 * 60 * 1000;

function normalized(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cellString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function monthDay(value: unknown): { month: number; day: number } | undefined {
  let date: Date;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    date = value;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    date = new Date(excelEpoch + Math.round(value * dayMilliseconds));
  } else if (typeof value === 'string') {
    const match = /^(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?$/.exec(value.trim());
    if (!match) return undefined;
    const first = Number(match[1]);
    const second = Number(match[2]);
    const [month, day] = first > 12 ? [second, first] : [first, second];
    if (!Number.isInteger(month) || !Number.isInteger(day)) return undefined;
    const check = new Date(Date.UTC(2000, month - 1, day));
    return check.getUTCMonth() + 1 === month && check.getUTCDate() === day
      ? { month, day }
      : undefined;
  } else {
    return undefined;
  }

  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const check = new Date(Date.UTC(2000, month - 1, day));
  return check.getUTCMonth() + 1 === month && check.getUTCDate() === day
    ? { month, day }
    : undefined;
}

export function parseBirthdayWorkbook(workbook: ExcelJS.Workbook): BirthdayRecord[] {
  let source: ExcelJS.Worksheet | undefined;
  let headerRow = 0;

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row, rowNumber) => {
      if (source) return;
      const headers = [1, 2, 3].map((column) => normalized(row.getCell(column).text));
      if (
        headers[0] === 'nombre' &&
        headers[1] === 'id discord' &&
        headers[2] === 'dia de cumpleanitos'
      ) {
        source = worksheet;
        headerRow = rowNumber;
      }
    });
    if (source) break;
  }
  if (!source) {
    throw new Error('No se encontró la tabla Nombre, ID Discord, Dia de cumpleañitos.');
  }

  const records: BirthdayRecord[] = [];
  const seenIds = new Set<string>();
  source.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const name = cellString(row.getCell(1).value);
    const userIdValue = row.getCell(2).value;
    const userId = cellString(userIdValue);
    const date = monthDay(row.getCell(3).value);
    if (!name && !userId && !row.getCell(3).value) return;
    if (!name || typeof userIdValue !== 'string' || !snowflake.test(userId) || !date) {
      throw new Error(`Fila ${rowNumber} de cumpleaños incompleta o inválida.`);
    }
    if (seenIds.has(userId)) throw new Error(`ID Discord duplicado en la fila ${rowNumber}.`);
    seenIds.add(userId);
    records.push({ name, userId, ...date });
  });

  if (records.length === 0) throw new Error('La tabla de cumpleaños no tiene registros.');
  return records;
}

export async function loadBirthdayWorkbook(path: string): Promise<BirthdayRecord[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return parseBirthdayWorkbook(workbook);
}