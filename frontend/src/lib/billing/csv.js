/* global BigInt */
// Browser-only ingestion. Keep money as fixed-point integers until chart/display boundaries.
export const LIMITS = { bytes: 10 * 1024 * 1024, rows: 50000, files: 20, days: 366 };
const SCALE = 100000000n;
const MAX_AMOUNT = 1000000000000n * SCALE;
const DAY = 86400000;
const fail = (message) => { throw new Error(message); };

export function decimalUnits(value) {
  const text = String(value).trim();
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(text)) {
    fail('Cost must be a number with a decimal point and up to 8 decimal places, such as 12.50 or -2.50. Leave out currency symbols.');
  }
  const clean = text.replaceAll(',', '');
  const [integer, fraction = ''] = clean.replace(/^-/, '').split('.');
  const result = (BigInt(integer) * SCALE + BigInt(fraction.padEnd(8, '0'))) * (clean.startsWith('-') ? -1n : 1n);
  if (result > MAX_AMOUNT || result < -MAX_AMOUNT) fail('A cost exceeds the supported limit of one trillion per currency.');
  return result;
}

export function decimalString(units) {
  const magnitude = units < 0n ? -units : units;
  const fraction = String(magnitude % SCALE).padStart(8, '0').replace(/0+$/, '');
  return `${units < 0n ? '-' : ''}${magnitude / SCALE}${fraction ? `.${fraction}` : ''}`;
}

// RFC 4180 quoting, including embedded commas/newlines, BOM, CRLF, and escaped quotes.
export function parseCsv(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.bytes) fail('Choose CSV files totaling 10 MB or less for each period.');
  if (text.includes('\u0000')) fail('This file is not a readable UTF-8 CSV. Export a CSV instead of an Excel, compressed, or Parquet file.');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let cells = [], cell = '', quoted = false, closed = false, line = 1, rowLine = 1;
  const finishCell = () => { cells.push(cell); cell = ''; closed = false; };
  const finishRow = () => {
    finishCell();
    if (cells.some((value) => value.trim() !== '')) rows.push({ cells, line: rowLine });
    cells = [];
    if (rows.length > LIMITS.rows + 1) fail('This period has more than 50,000 rows. Export a smaller period.');
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else { quoted = false; closed = true; }
      } else { cell += char; if (char === '\n') line += 1; }
    } else if (char === '"') {
      if (cell || closed) fail(`Line ${line}: a quote is misplaced. Save the file as a comma-separated CSV again.`);
      quoted = true;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      finishRow(); line += 1; rowLine = line;
    } else {
      if (closed) fail(`Line ${line}: unexpected text after a quoted value.`);
      cell += char;
    }
  }
  if (quoted) fail(`Line ${rowLine}: a quoted value never closes. Save the file as CSV again.`);
  if (cell || cells.length || closed) finishRow();
  if (rows.length < 2) fail('This CSV needs a header and at least one billing record. Download the example to see the format.');
  return rows;
}

function day(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real date written YYYY-MM-DD, such as 2026-09-01.`);
  }
  if (Number(value.slice(0, 4)) < 1900 || Number(value.slice(0, 4)) > 2199) fail(`${label} must be between 1900 and 2199.`);
  return value;
}
const nextDay = (value) => new Date(Date.parse(`${value}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

function boundary(value, label) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${day(value, label)}T00:00:00.000Z`;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value)) {
    fail(`${label} needs YYYY-MM-DD or a UTC timestamp such as 2026-09-01T00:00:00Z. Local times and timezone offsets are not supported.`);
  }
  day(value.slice(0, 10), label);
  const normalized = value.replace(' ', 'T').replace('+00:00', 'Z');
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.slice(0, 10)) fail(`${label} contains an invalid time.`);
  return parsed.toISOString();
}

const knownCurrencies = typeof Intl.supportedValuesOf === 'function'
  ? new Set(Intl.supportedValuesOf('currency'))
  : new Set('USD EUR GBP CAD AUD NZD JPY CHF PLN SEK NOK DKK INR SGD HKD BRL MXN ZAR AED SAR KRW CNY'.split(' '));

export function normalizeCsv(text, filename = 'billing.csv') {
  if (!/\.csv$/i.test(filename)) fail(`${filename}: choose an uncompressed .csv file. Excel, ZIP, Gzip, and Parquet files are not supported.`);
  const parsed = parseCsv(text);
  const headers = parsed[0].cells.map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) fail(`${filename}: every column needs a unique header.`);
  const focus = headers.some((header) => ['billedcost', 'chargeperiodstart', 'serviceName'.toLowerCase()].includes(header));
  const fields = focus
    ? { date: 'chargeperiodstart', end: 'chargeperiodend', service: 'servicename', cost: 'billedcost', currency: 'billingcurrency', provider: 'providername' }
    : { date: 'date', end: 'enddate', service: 'service', cost: 'cost', currency: 'currency', provider: 'provider' };
  const required = [fields.date, fields.service, fields.cost, fields.currency, ...(focus ? [fields.end] : [])];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) {
    const expected = focus ? 'ChargePeriodStart, ChargePeriodEnd, ServiceName, BilledCost, BillingCurrency' : 'Date, Service, Cost, Currency';
    fail(`${filename}: we could not find ${missing.join(', ')}. Use the ${focus ? 'FOCUS' : 'simple'} CSV headers: ${expected}. Rename or map your columns using the template. Summary tables and invoice PDFs cannot be read.`);
  }
  const columnsUsed = new Set([...Object.values(fields), 'recordid', 'billingaccountid', 'chargecategory']);
  const rows = parsed.slice(1).map(({ cells, line }) => {
    try {
      if (cells.length !== headers.length) fail(`Expected ${headers.length} columns but found ${cells.length}. Check commas and quotes.`);
      const get = (key) => (cells[headers.indexOf(key)] || '').trim();
      const service = get(fields.service);
      if (!service) fail('Service is empty. Give each record a service name, including tax or account-level adjustments.');
      if (service.length > 200) fail('Service names must be 200 characters or fewer.');
      const provider = get(fields.provider) || 'Not specified';
      if (provider.length > 200) fail('Provider names must be 200 characters or fewer.');
      const currency = get(fields.currency).toUpperCase();
      if (!knownCurrencies.has(currency)) fail('Currency needs a supported three-letter code such as USD, EUR, or GBP. Currency symbols are ambiguous.');
      const cost = decimalString(decimalUnits(get(fields.cost)));
      if (get('chargecategory').toLowerCase() === 'credit' && decimalUnits(cost) > 0n) fail('This credit has a positive cost. Enter credits as negative amounts; the tool will not guess their sign.');
      const start = focus ? boundary(get(fields.date), 'ChargePeriodStart') : `${day(get(fields.date), 'Date')}T00:00:00.000Z`;
      const end = get(fields.end)
        ? (focus ? boundary(get(fields.end), 'ChargePeriodEnd') : `${day(get(fields.end), 'EndDate')}T00:00:00.000Z`)
        : `${nextDay(start.slice(0, 10))}T00:00:00.000Z`;
      if (end <= start) fail('The charge end must be after its start. End dates are exclusive.');
      const recordId = get('recordid'), accountId = get('billingaccountid');
      if (recordId.length > 300 || accountId.length > 300) fail('Record and account IDs must be 300 characters or fewer.');
      const row = { start, end, service, provider, currency, cost, recordId, accountId, file: filename, line };
      // Preserve extra dimensions in duplicate detection, but do not retain or export them.
      const extras = headers.map((header, index) => [header, cells[index].trim()]).filter(([header]) => !columnsUsed.has(header)).sort(([a], [b]) => a.localeCompare(b));
      return { ...row, fingerprint: JSON.stringify([start, end, service, provider, currency, cost, accountId, get('chargecategory'), extras]) };
    } catch (error) { return fail(`${filename}, line ${line}: ${error.message}`); }
  });
  return { name: filename, format: focus ? 'FOCUS BilledCost' : 'Simple billing CSV', rows };
}

export async function readBillingFiles(fileList) {
  const files = [...fileList];
  if (!files.length) fail('Choose at least one CSV file.');
  if (files.length > LIMITS.files) fail('Choose no more than 20 CSV parts per period.');
  if (files.reduce((sum, file) => sum + file.size, 0) > LIMITS.bytes) fail('Choose CSV files totaling 10 MB or less for each period.');
  const data = [];
  for (const file of files) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { fail(`${file.name}: save this file as UTF-8 CSV and try again.`); }
    data.push(normalizeCsv(text, file.name));
  }
  if (data.reduce((sum, file) => sum + file.rows.length, 0) > LIMITS.rows) fail('This period has more than 50,000 records across its files. Export a smaller period.');
  return data;
}

export function preparePeriod(files, { duplicatePolicy = 'review', start = '', end = '' } = {}) {
  if (!files?.length) fail('Choose your current billing CSV first.');
  const sourceRows = files.flatMap((file) => file.rows);
  if (!sourceRows.length || sourceRows.length > LIMITS.rows) fail('Use between 1 and 50,000 billing records per period.');
  const currencies = [...new Set(sourceRows.map((row) => row.currency))];
  if (currencies.length !== 1) fail(`These records contain ${currencies.join(', ')}. Export one currency at a time; no exchange rates are applied.`);
  const ids = new Map(), fingerprints = new Set(), rows = [];
  let repeatedIds = 0, identicalRows = 0;
  for (const row of sourceRows) {
    if (row.recordId) {
      const key = JSON.stringify([row.provider, row.accountId, row.recordId]);
      if (ids.has(key)) {
        if (ids.get(key) !== row.fingerprint) fail(`${row.file}, line ${row.line}: RecordId ${row.recordId} has conflicting values. Export a single, consistent version of this record.`);
        repeatedIds += 1; continue;
      }
      ids.set(key, row.fingerprint);
    } else if (fingerprints.has(row.fingerprint)) {
      identicalRows += 1;
      if (duplicatePolicy !== 'keep') continue;
    }
    if (!row.recordId) fingerprints.add(row.fingerprint);
    const { fingerprint, ...clean } = row;
    rows.push(clean);
  }
  if (identicalRows && duplicatePolicy === 'review') fail(`${identicalRows} repeated row${identicalRows === 1 ? '' : 's'} without a RecordId need your review. In “Identical rows”, choose “Count once” for repeated exports or “Keep all” for separate charges that happen to match.`);
  const first = rows.reduce((a, row) => row.start < a ? row.start : a, rows[0].start);
  const last = rows.reduce((a, row) => row.end > a ? row.end : a, rows[0].end);
  const coverageEnd = last.includes('T00:00:00.000Z') ? last.slice(0, 10) : nextDay(last.slice(0, 10));
  const startDay = start ? day(start, 'Period start') : first.slice(0, 10);
  const endDay = end ? nextDay(day(end, 'Period end')) : coverageEnd;
  if (`${startDay}T00:00:00.000Z` > first || `${endDay}T00:00:00.000Z` < last) fail('The selected dates leave out billing records. Choose dates that include every charge interval, or export a narrower file.');
  const days = (Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / DAY;
  if (days < 1 || days > LIMITS.days) fail('Choose a reporting period between 1 and 366 days.');
  const warnings = [];
  if (repeatedIds) warnings.push(`${repeatedIds} repeated record ID${repeatedIds === 1 ? '' : 's'} counted once.`);
  if (identicalRows) warnings.push(`${identicalRows} identical row${identicalRows === 1 ? '' : 's'} without IDs ${duplicatePolicy === 'keep' ? 'kept as separate charges' : 'counted once'} by your choice.`);
  if (rows.some((row) => !row.recordId)) warnings.push('Some records have no RecordId. Only identical rows can be checked; overlapping exports may contain other duplicates.');
  if (rows.some((row) => row.provider === 'Not specified')) warnings.push('Provider was not supplied for some records. They are grouped under “Not specified”.');
  return {
    currency: currencies[0], rows, start: startDay, end: endDay, days,
    dateBasis: start || end ? 'Selected dates (inclusive in the form; end exclusive in downloads)' : 'Coverage inferred from charge dates; a complete invoice period is not confirmed',
    sources: files.map(({ name, format, rows: source }) => ({ name, format, rows: source.length })),
    sourceRowCount: sourceRows.length, repeatedIds, identicalRows, duplicatePolicy, warnings,
    spansMultipleDays: rows.some((row) => row.end > `${nextDay(row.start.slice(0, 10))}T00:00:00.000Z`),
  };
}
