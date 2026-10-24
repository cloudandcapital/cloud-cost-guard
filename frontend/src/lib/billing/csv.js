/* global BigInt */
// Browser-only ingestion. Keep money as fixed-point integers until chart/display boundaries.
export const LIMITS = { bytes: 10 * 1024 * 1024, rows: 50000, files: 20, days: 366 };
const PLACES = 18;
const SCALE = 10n ** BigInt(PLACES);
const MAX_AMOUNT = 1000000000000n * SCALE;
const DAY = 86400000;
const MAX_GOOGLE_DOCUMENT_ROWS = 32;
const GOOGLE_DOCUMENT_FIELDS = new Set('invoice number|invoice date|invoice total|invoice total amount|total amount due|due date|payment due date|payment terms|statement number|statement date|statement total|total new activity|statement total new activity|billing account id|billing account name|currency|currency code|invoice currency|statement currency|exchange rate|currency exchange rate|publisher type|invoice month|billing period'.split('|'));
const GOOGLE_CURRENCY_FIELDS = new Set(['currency', 'currency code', 'invoice currency', 'statement currency']);
const SYMBOL_CURRENCIES = { '€': ['EUR'], '£': ['GBP'], '$': 'USD CAD AUD NZD SGD HKD TWD BBD BMD BSD BZD FJD GYD JMD KYD LRD NAD SBD SRD TTD XCD ZWL MXN ARS CLP COP UYU DOP CUP CUC PHP BND'.split(' ') };
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
export function parseCsv(text, { documentHeaderAllowance = false } = {}) {
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
    if (rows.length > LIMITS.rows + 1 + (documentHeaderAllowance === true ? MAX_GOOGLE_DOCUMENT_ROWS : 0)) fail('This period has more than 50,000 rows. Export a smaller period.');
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
  if (value.endsWith(' UTC')) value = `${value.slice(0, -4)}Z`;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(value)) {
    if (timestampBasis !== 'UTC') fail(`${label} has no timezone. Confirm UTC below only if your export uses UTC, or export timestamps with an explicit timezone.`, 'TIMEZONE_REQUIRED');
    value += 'Z';
  }
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|\+00:00)$/.test(value)) {
    fail(`${label} needs YYYY-MM-DD or a UTC timestamp such as 2026-09-01T00:00:00Z. Local times and timezone offsets are not supported.`);
  }
  day(value.slice(0, 10), label);
  const normalized = value.replace(' ', 'T').replace('+00:00', 'Z');
  const fraction = normalized.match(/\.(\d+)Z$/)?.[1] || '';
  const millisecondText = normalized.replace(/\.(\d+)Z$/, (_, digits) => `.${digits.padEnd(3, '0').slice(0, 3)}Z`);
  const parsed = new Date(millisecondText);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.slice(0, 10)) fail(`${label} contains an invalid time.`);
  return fraction.length > 3 && /[1-9]/.test(fraction.slice(3))
    ? `${parsed.toISOString().slice(0, -5)}.${fraction.padEnd(6, '0')}Z`
    : parsed.toISOString();
}

function timestampMicros(value) {
  const fraction = value.match(/\.(\d+)Z$/)?.[1] || '';
  const milliseconds = value.replace(/\.(\d+)Z$/, (_, digits) => `.${digits.padEnd(3, '0').slice(0, 3)}Z`);
  return BigInt(Date.parse(milliseconds)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}

const knownCurrencies = typeof Intl.supportedValuesOf === 'function'
  ? new Set(Intl.supportedValuesOf('currency'))
  : new Set('USD EUR GBP CAD AUD NZD JPY CHF PLN SEK NOK DKK INR SGD HKD BRL MXN ZAR AED SAR KRW CNY'.split(' '));

export const validBillingCurrency = value => knownCurrencies.has(value);

export function googleCostColumn(headers) {
  const found = {};
  for (const base of ['unrounded cost', 'cost']) {
    const matches = headers.filter(key => new RegExp(`^${base}(?:\\s*\\([^()]+\\))?$`).test(key));
    if (matches.length > 1) fail('Choose a Google Cost table export with one cost column per precision, in one currency.');
    if (matches.length) found[base] = matches[0];
  }
  if (!found['unrounded cost'] && !found.cost) fail('Include Unrounded cost (recommended) or Cost in the Google Cost table CSV.');
  return { cost: found['unrounded cost'] || found.cost, rounded: found.cost };
}

function billingHeader(parsed) {
  const normalized = row => row.cells.map(value => value.trim().toLowerCase());
  const isGoogle = headers => headers.includes('service description') && headers.includes('cost type');
  const first = normalized(parsed[0]);
  const isExisting = ['date', 'service', 'cost', 'currency'].every(key => first.includes(key)) || ['chargeperiodstart', 'chargeperiodend', 'servicename', 'billedcost', 'billingcurrency'].every(key => first.includes(key));
  if (isGoogle(first) || isExisting) return { parsed, documentCurrency: null, documentMonth: null };
  if (!GOOGLE_DOCUMENT_FIELDS.has(first[0])) {
    if (parsed.slice(1, 40).some(row => isGoogle(normalized(row)))) fail(`Unrecognized Google document header: ${parsed[0].cells[0].slice(0, 100)}. No billing rows were skipped. Download the English ungrouped Cost table or use the simple template.`);
    return { parsed, documentCurrency: null, documentMonth: null };
  }
  const currencies = new Set();
  const months = new Set();
  let index = 0;
  for (; index < parsed.length && !isGoogle(normalized(parsed[index])); index += 1) {
    const { cells } = parsed[index], label = normalized(parsed[index])[0];
    if (index >= MAX_GOOGLE_DOCUMENT_ROWS || !GOOGLE_DOCUMENT_FIELDS.has(label) || cells.slice(2).some(value => value.trim())) fail('Unrecognized information before the Google Cost table. Use its English CSV with Service description, Cost type and Unrounded cost. No billing rows were skipped.');
    const currency = (cells[1] || '').trim().toUpperCase();
    if (GOOGLE_CURRENCY_FIELDS.has(label) && knownCurrencies.has(currency)) currencies.add(currency);
    if (label === 'invoice month') months.add((cells[1] || '').trim());
  }
  if (index === parsed.length) fail('Invoice information alone is not a Cost table. Include Service description, Cost type and Unrounded cost in the Google CSV.');
  if (currencies.size > 1) fail('Google document headers contain conflicting currencies.');
  if (months.size > 1) fail('Google document headers contain conflicting invoice months.');
  const month = [...months][0] || null;
  if (month && !/^\d{4}-\d{2}$/.test(month)) fail('The Google Invoice month header needs YYYY-MM. Check it against the invoice.');
  return { parsed: parsed.slice(index), documentCurrency: [...currencies][0] || null, documentMonth: month };
}

function googleInvoiceWindow(details, filename, columns, documentCurrency, documentMonth) {
  const columnCurrency = columns.cost.match(/\(([a-z]{3})\)$/i)?.[1]?.toUpperCase();
  if (documentCurrency && columnCurrency && documentCurrency !== columnCurrency) fail('The Google cost column and document header contain different currencies.');
  if (!details || details.confirmed !== true) {
    const error = new Error('This looks like a Google Cloud Cost table. Confirm its invoice month and billing currency below; you do not need to edit the CSV.');
    error.code = 'GOOGLE_COST_TABLE_REQUIRED';
    const dates = filename.match(/_Cost table,\s*(\d{4}-\d{2})-\d{2}\s*[—–-]\s*(\d{4}-\d{2})-\d{2}/i);
    const currency = documentCurrency || columnCurrency || '';
    error.details = { month: documentMonth || (dates && dates[1] === dates[2] ? dates[1] : ''), currency, costColumn: columns.cost };
    throw error;
  }
  if (!/^\d{4}-\d{2}$/.test(details.month || '')) fail('Choose the Google Cost table invoice month as YYYY-MM.');
  const start = day(`${details.month}-01`, 'Invoice month');
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = day(next.toISOString().slice(0, 10), 'Invoice month end');
  if (!knownCurrencies.has(details.currency)) fail('Confirm the Google bill’s three-letter billing currency; currency symbols are ambiguous.');
  if (documentCurrency && documentCurrency !== details.currency) fail('The confirmed currency does not match the Google document header.');
  if (documentMonth && documentMonth !== details.month) fail(`The confirmed invoice month does not match the Google Invoice month header (${documentMonth}). Choose the month on the file.`);
  for (const key of [columns.cost, columns.rounded].filter(Boolean)) {
    const unit = key.match(/\(([^()]+)\)$/)?.[1]?.trim();
    if ((unit && /^[a-z]{3}$/i.test(unit) && unit.toUpperCase() !== details.currency) || (SYMBOL_CURRENCIES[unit] && !SYMBOL_CURRENCIES[unit].includes(details.currency))) fail('The confirmed currency does not match the Google cost column.');
  }
  return { start: `${start}T00:00:00.000Z`, end: `${end}T00:00:00.000Z`, currency: details.currency };
}

function normalizeGoogleCostTable(text, filename, parsed, headers, details, documentCurrency, documentMonth) {
  const columns = googleCostColumn(headers);
  const period = googleInvoiceWindow(details, filename, columns, documentCurrency, documentMonth);
  const rows = [];
  let totals = 0;
  for (const { cells, line } of parsed.slice(1)) {
    try {
      if (cells.length !== headers.length) fail(`Expected ${headers.length} columns but found ${cells.length}. Check commas and quotes.`);
      const get = key => (cells[headers.indexOf(key)] || '').trim();
      const kind = get('cost type').toLowerCase();
      if (!['usage', 'adjustment', 'rounding error', 'tax', 'total'].includes(kind)) fail('Use the English Google Cost table CSV with Cost type included and Group by set to No grouping.');
      const rowCurrency = get('currency') || get('currency code');
      if (rowCurrency && rowCurrency.toUpperCase() !== period.currency) fail('Google records contain a different currency; review one billing currency at a time.');
      const cost = decimalString(decimalUnits(get(columns.cost) || (columns.rounded ? get(columns.rounded) : '')));
      if (kind === 'total') { totals += 1; continue; }
      const service = get('service description') || `${get('cost type')} · service not supplied`;
      const accountId = get('billing account id');
      if (service.length > 200 || accountId.length > 300) fail('Keep service names to 200 characters and billing account IDs to 300.');
      rows.push({ ...period, service, provider: 'Google Cloud', cost, accountId, recordId: '', file: filename, line });
    } catch (error) { fail(`${filename}, line ${line}: ${error.message}`, error.code); }
  }
  if (!rows.length) fail('The Google CSV has no charge records; a Total row alone cannot supply a service review.');
  if (totals > 1) fail('This Google CSV has multiple Total rows. Download one flat, ungrouped Cost table, in one currency.');
  // Preflight only. The original CSV and confirmed context go to FinOps Lite,
  // which owns Total-row reconciliation, duplicate identity and aggregation.
  return { name: filename, text, format: 'Google Cloud Cost table CSV', rows, inputRowCount: parsed.length - 1 };
}

export function normalizeCsv(text, filename = 'billing.csv', { timestampBasis, googleCostTable, simpleDateBasis } = {}) {
  if (!/\.csv(?:\.gz)?$/i.test(filename)) fail(`${filename}: choose a .csv or .csv.gz file. Excel, ZIP, and Parquet need conversion first.`);
  if (timestampBasis !== undefined && timestampBasis !== 'UTC') fail('The only supported timestamp confirmation is UTC.');
  let parsed;
  try { parsed = parseCsv(text, { documentHeaderAllowance: true }); }
  catch (error) { fail(`${filename}: ${error.message}`); }
  const table = billingHeader(parsed);
  parsed = table.parsed;
  if (parsed.length - 1 > LIMITS.rows) fail('This period has more than 50,000 rows. Export a smaller period.');
  const headers = parsed[0].cells.map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) fail(`${filename}: every column needs a unique header.`);
  if (headers.includes('service description') && headers.includes('cost type')) return normalizeGoogleCostTable(text, filename, parsed, headers, googleCostTable, table.documentCurrency, table.documentMonth);
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
      const service = get(fields.service) || (focus ? `${get('chargecategory') || 'Charge'} · service not supplied` : '');
      if (!service) fail('Service is empty. Give each record a service name, including tax or account-level adjustments.');
      if (service.length > 200) fail('Service names must be 200 characters or fewer.');
      if (!focus && /^(?:(?:grand\s+|sub\s*|net\s+)?total(?:\s+costs?)?|amount\s+due|balance\s+due):?$/i.test(service)) fail(`${service} looks like a total line. Remove it so it is not counted twice; keep the individual charges, taxes and negative credits.`);
      const provider = get(fields.provider) || 'Not specified';
      if (provider.length > 200) fail('Provider names must be 200 characters or fewer.');
      const currency = get(fields.currency).toUpperCase();
      if (!knownCurrencies.has(currency)) fail('Currency needs a supported three-letter code such as USD, EUR, or GBP. Currency symbols are ambiguous.');
      const cost = decimalString(decimalUnits(get(fields.cost)));
      if (!focus && decimalUnits(cost) > 0n && /\b(?:credits?|refunds?|discounts?)\b/i.test(service)) fail(`${service} has a positive cost. Check the bill and enter credits, refunds or discounts as negative amounts; their sign is never guessed.`);
      if (get('chargecategory').toLowerCase() === 'credit' && decimalUnits(cost) > 0n) fail('This credit has a positive cost. Enter credits as negative amounts; the tool will not guess their sign.');
      const start = focus ? boundary(get(fields.date), 'ChargePeriodStart', timestampBasis) : `${day(get(fields.date), 'Date')}T00:00:00.000Z`;
      if (focus && !get(fields.end)) fail('ChargePeriodEnd is empty. Supply the exclusive end date; the tool will not assume the charge lasted one day.');
      let end = get(fields.end)
        ? (focus ? boundary(get(fields.end), 'ChargePeriodEnd', timestampBasis) : `${day(get(fields.end), 'EndDate')}T00:00:00.000Z`)
        : `${nextDay(start.slice(0, 10))}T00:00:00.000Z`;
      if (!focus && !get(fields.end) && simpleDateBasis === 'monthly') {
        if (start.slice(8, 10) !== '01') fail('Confirmed monthly totals need Date on the first of the month, or an explicit EndDate.');
        const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
        end = `${day(next.toISOString().slice(0, 10), 'Monthly EndDate')}T00:00:00.000Z`;
      }
      if (timestampMicros(end) <= timestampMicros(start)) fail('The charge end must be after its start. End dates are exclusive.');
      let billingPeriod = {};
      if (focus && (get('billingperiodstart') || get('billingperiodend'))) {
        if (!get('billingperiodstart') || !get('billingperiodend')) fail('Supply both BillingPeriodStart and BillingPeriodEnd, or neither.');
        const billStart = boundary(get('billingperiodstart'), 'BillingPeriodStart', timestampBasis);
        const billEnd = boundary(get('billingperiodend'), 'BillingPeriodEnd', timestampBasis);
        if (!billStart.endsWith('T00:00:00.000Z') || !billEnd.endsWith('T00:00:00.000Z') || timestampMicros(billEnd) <= timestampMicros(billStart)) fail('Billing period boundaries must be UTC midnights, with the exclusive end after the start.');
        billingPeriod = { billingStart: billStart.slice(0, 10), billingEnd: billEnd.slice(0, 10) };
      }
      const recordId = get('recordid'), accountId = get('billingaccountid');
      if (recordId.length > 300 || accountId.length > 300) fail('Record and account IDs must be 300 characters or fewer.');
      // UI preflight only. The original text goes to FinOps Lite, which owns
      // normalization, full-dimension duplicate identity and period handling.
      return { start, end, service, provider, currency, cost, recordId, accountId, ...billingPeriod, file: filename, line };
    } catch (error) { return fail(`${filename}, line ${line}: ${error.message}`, error.code); }
  });
  return { name: filename, text, format: focus ? 'FOCUS BilledCost' : 'Simple billing CSV', rows, needsDateCheck: !focus && !simpleDateBasis && rows.every(row => row.start.slice(8, 10) === '01' && row.end === `${nextDay(row.start.slice(0, 10))}T00:00:00.000Z` && parsed.slice(1).every(row => !(row.cells[headers.indexOf(fields.end)] || '').trim())) };
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
  if (data.reduce((sum, file) => sum + (file.inputRowCount ?? file.rows.length), 0) > LIMITS.rows) fail('This period has more than 50,000 records across its files. Export a smaller period.');
  if (data.some(file => file.format === 'Google Cloud Cost table CSV') && data.some(file => file.format !== 'Google Cloud Cost table CSV')) fail('Review Google Cost table files separately from FOCUS or simple CSVs; do not combine different export representations of the same bill.');
  return data;
}
