/* global BigInt */
// Browser-only ingestion. Keep money as fixed-point integers until chart/display boundaries.
export const LIMITS = { bytes: 10 * 1024 * 1024, rows: 50000, files: 20, days: 366 };
const PLACES = 18;
const SCALE = 10n ** BigInt(PLACES);
const MAX_AMOUNT = 1000000000000n * SCALE;
const DAY = 86400000;
const fail = (message, code) => { const error = new Error(message); if (code) error.code = code; throw error; };

export function decimalUnits(value) {
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,18})?$/.test(text)) {
    fail('Cost must be a signed number with up to 18 decimal places, such as 12.50 or -2.50. Leave out currency symbols and scientific notation.');
  }
  const clean = text.replaceAll(',', '');
  const [integer, fraction = ''] = clean.replace(/^[+-]/, '').split('.');
  const result = (BigInt(integer) * SCALE + BigInt(fraction.padEnd(PLACES, '0'))) * (clean.startsWith('-') ? -1n : 1n);
  if (result > MAX_AMOUNT || result < -MAX_AMOUNT) fail('A cost exceeds the supported limit of one trillion per currency.');
  return result;
}

export function decimalString(units) {
  const magnitude = units < 0n ? -units : units;
  const fraction = String(magnitude % SCALE).padStart(PLACES, '0').replace(/0+$/, '');
  return `${units < 0n ? '-' : ''}${magnitude / SCALE}${fraction ? `.${fraction}` : ''}`;
}

// RFC 4180 quoting, including embedded commas/newlines, BOM, CRLF, and escaped quotes.
export function parseCsv(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.bytes) fail('Choose CSV files totaling 10 MB or less for each period.');
  if (text.includes('\u0000')) fail('This file is not a readable UTF-8 CSV. Export CSV instead of Excel, ZIP, or Parquet.');
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

function boundary(value, label, timestampBasis) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${day(value, label)}T00:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)) {
    if (timestampBasis !== 'UTC') fail(`${label} has no timezone. Confirm UTC below only if your export uses UTC, or export timestamps with an explicit timezone.`, 'TIMEZONE_REQUIRED');
    value += 'Z';
  }
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

export function normalizeCsv(text, filename = 'billing.csv', { timestampBasis } = {}) {
  if (!/\.csv(?:\.gz)?$/i.test(filename)) fail(`${filename}: choose a .csv or .csv.gz file. Excel, ZIP, and Parquet need conversion first.`);
  if (timestampBasis !== undefined && timestampBasis !== 'UTC') fail('The only supported timestamp confirmation is UTC.');
  let parsed;
  try { parsed = parseCsv(text); }
  catch (error) { fail(`${filename}: ${error.message}`); }
  const headers = parsed[0].cells.map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) fail(`${filename}: every column needs a unique header.`);
  const focus = headers.some((header) => ['billedcost', 'chargeperiodstart', 'servicename'].includes(header));
  const fields = focus
    ? { date: 'chargeperiodstart', end: 'chargeperiodend', service: 'servicename', cost: 'billedcost', currency: 'billingcurrency', provider: 'providername' }
    : { date: 'date', end: 'enddate', service: 'service', cost: 'cost', currency: 'currency', provider: 'provider' };
  const required = [fields.date, fields.service, fields.cost, fields.currency, ...(focus ? [fields.end] : [])];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) {
    const expected = focus ? 'ChargePeriodStart, ChargePeriodEnd, ServiceName, BilledCost, BillingCurrency' : 'Date, Service, Cost, Currency';
    fail(`${filename}: we could not find ${missing.join(', ')}. Use the ${focus ? 'FOCUS' : 'simple'} CSV headers: ${expected}. Rename or map your columns using the template. Summary tables and invoice PDFs cannot be read.`);
  }
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
      const start = focus ? boundary(get(fields.date), 'ChargePeriodStart', timestampBasis) : `${day(get(fields.date), 'Date')}T00:00:00.000Z`;
      if (focus && !get(fields.end)) fail('ChargePeriodEnd is empty. Supply the exclusive end date; the tool will not assume the charge lasted one day.');
      const end = get(fields.end)
        ? (focus ? boundary(get(fields.end), 'ChargePeriodEnd', timestampBasis) : `${day(get(fields.end), 'EndDate')}T00:00:00.000Z`)
        : `${nextDay(start.slice(0, 10))}T00:00:00.000Z`;
      if (end <= start) fail('The charge end must be after its start. End dates are exclusive.');
      const recordId = get('recordid'), accountId = get('billingaccountid');
      if (recordId.length > 300 || accountId.length > 300) fail('Record and account IDs must be 300 characters or fewer.');
      // UI preflight only. The original text goes to FinOps Lite, which owns
      // normalization, full-dimension duplicate identity and period handling.
      return { start, end, service, provider, currency, cost, recordId, accountId, file: filename, line };
    } catch (error) { return fail(`${filename}, line ${line}: ${error.message}`, error.code); }
  });
  return { name: filename, text, format: focus ? 'FOCUS BilledCost' : 'Simple billing CSV', rows };
}

async function expandedBytes(file, remaining) {
  if (!/\.csv(?:\.gz)?$/i.test(file.name)) fail(`${file.name}: choose a .csv or .csv.gz file. Excel, ZIP, and Parquet need conversion first.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!/\.gz$/i.test(file.name)) {
    if (isGzip) fail(`${file.name}: this is Gzip data. Keep the .csv.gz filename or decompress it to CSV first.`);
    if (bytes.length > remaining) fail('Choose CSV files totaling 10 MB or less after decompression for each period.');
    return bytes;
  }
  if (!isGzip) fail(`${file.name}: this is not a valid Gzip file. Choose the original .csv.gz export or an uncompressed .csv.`);
  if (typeof DecompressionStream === 'undefined') fail(`${file.name}: this browser cannot open Gzip. Update your browser or decompress the file to CSV first.`);
  // Feed small compressed chunks so the byte-limit check can stop expansion
  // without handing the decompressor the whole archive at once.
  let compressedOffset = 0;
  const stream = new ReadableStream({ pull(controller) {
    const end = Math.min(compressedOffset + 1024, bytes.byteLength);
    controller.enqueue(bytes.subarray(compressedOffset, end));
    compressedOffset = end;
    if (end === bytes.byteLength) controller.close();
  } });
  const reader = stream.pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > remaining) {
        await reader.cancel();
        fail('Choose CSV files totaling 10 MB or less after decompression for each period.', 'EXPANDED_LIMIT');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error.code === 'EXPANDED_LIMIT') throw error;
    fail(`${file.name}: this Gzip file could not be opened. Download it again or decompress the original export to CSV.`);
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readBillingFiles(fileList, options = {}) {
  const files = [...fileList];
  if (!files.length) fail('Choose at least one CSV file.');
  if (files.length > LIMITS.files) fail('Choose no more than 20 CSV parts per period.');
  if (files.reduce((sum, file) => sum + file.size, 0) > LIMITS.bytes) fail('Choose CSV files totaling 10 MB or less for each period.');
  const data = [];
  let expandedSize = 0;
  for (const file of files) {
    const bytes = await expandedBytes(file, LIMITS.bytes - expandedSize);
    expandedSize += bytes.byteLength;
    let text;
    // Preserve a UTF-8 BOM in the original text for the producer's file hash.
    // The CSV parser separately accepts/removes it from the first header.
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail(`${file.name}: save this file as UTF-8 CSV and try again.`); }
    data.push(normalizeCsv(text, file.name, options));
  }
  if (data.reduce((sum, file) => sum + file.rows.length, 0) > LIMITS.rows) fail('This period has more than 50,000 records across its files. Export a smaller period.');
  return data;
}
