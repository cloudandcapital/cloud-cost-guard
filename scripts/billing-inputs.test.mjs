import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';

// Load the same dependency-free reader that the browser bundles.
const source = fs.readFileSync(new URL('../frontend/src/lib/billing/csv.js', import.meta.url), 'utf8');
const { readBillingFiles, LIMITS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const csv = '\uFEFFDate,Service,Cost,Currency\r\n2026-09-01,Compute,0.00012345678,USD\r\n';
const file = (name, bytes) => new File([bytes], name);

test('Gzip and plain CSV preserve identical original text and exact cost', async () => {
  const plain = await readBillingFiles([file('bill.csv', csv)]);
  const zipped = await readBillingFiles([file('bill.csv.gz', gzipSync(Buffer.from(csv)))]);
  assert.equal(zipped[0].text, csv);
  assert.equal(zipped[0].name, 'bill.csv.gz');
  assert.equal(zipped[0].rows[0].cost, '0.00012345678');
  assert.deepEqual({ ...zipped[0], name: 'bill.csv', rows: plain[0].rows }, plain[0]);
});

test('bad formats, renamed compression, corrupt Gzip and bad expanded UTF-8 have useful errors', async () => {
  await assert.rejects(readBillingFiles([file('bill.zip', Buffer.from([0x50, 0x4b]))]), /CSV|\.csv/);
  await assert.rejects(readBillingFiles([file('bill.csv', gzipSync(Buffer.from(csv)))]), /Gzip data/);
  await assert.rejects(readBillingFiles([file('bill.csv.gz', csv)]), /not a valid Gzip/);
  const corrupt = gzipSync(Buffer.from(csv));
  corrupt[corrupt.length - 8] ^= 0xff;
  await assert.rejects(readBillingFiles([file('bill.csv.gz', corrupt)]), /Gzip file could not be opened/);
  await assert.rejects(readBillingFiles([file('bill.csv.gz', gzipSync(Buffer.from([0xff])))]), /UTF-8/);
});

test('decompressed bytes are bounded both individually and across a mixed selection', async () => {
  const tooLarge = gzipSync(Buffer.alloc(LIMITS.bytes + 1, 0x61));
  await assert.rejects(readBillingFiles([file('large.csv.gz', tooLarge)]), /10 MB.*after decompression/);
  const padded = size => `Date,Service,Cost,Currency,Comment\n2026-09-01,Compute,1,USD,${'a'.repeat(size)}\n`;
  await assert.rejects(readBillingFiles([
    file('first.csv', padded(6 * 1024 * 1024)),
    file('second.csv.gz', gzipSync(Buffer.from(padded(5 * 1024 * 1024)))),
  ]), /10 MB.*after decompression/);
});

test('timezone-less timestamps stop until explicitly confirmed, including inside Gzip', async () => {
  const text = 'ChargePeriodStart,ChargePeriodEnd,ServiceName,BilledCost,BillingCurrency\n2024-09-01 00:00:00,2024-09-02 00:00:00,Compute,0.00000000001,USD';
  const input = [file('focus.csv.gz', gzipSync(Buffer.from(text)))];
  await assert.rejects(readBillingFiles(input), error => error.code === 'TIMEZONE_REQUIRED');
  const parsed = await readBillingFiles(input, { timestampBasis: 'UTC' });
  assert.equal(parsed[0].text, text);
  assert.equal(parsed[0].rows[0].cost, '0.00000000001');
});
