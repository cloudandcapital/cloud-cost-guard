import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AskClaude from './AskClaude';
import { answerBillingQuestion } from '../lib/billing/report';

jest.mock('../lib/billing/report', () => ({ answerBillingQuestion: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, originalFetch;
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = jest.fn();
  originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error('Uploaded questions must stay local')));
  answerBillingQuestion.mockReset();
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); global.fetch = originalFetch;
});

async function askUploadedQuestion() {
  const report = { fixture: 'fictional uploaded report' };
  await act(async () => root.render(<AskClaude billingReport={report} />));
  await act(async () => document.querySelector('[aria-label="Open Lumen"]').click());
  const question = [...document.querySelectorAll('button')].find(b => b.textContent === 'Summarize my spending');
  await act(async () => question.click());
  expect(answerBillingQuestion).toHaveBeenCalledWith(report, 'Summarize my spending');
  expect(global.fetch).not.toHaveBeenCalled();
}

test.each(['', undefined, '   '])('an empty local answer (%p) cannot fall through to the provider', async value => {
  answerBillingQuestion.mockReturnValue(value);
  await askUploadedQuestion();
  expect(document.body.textContent).toContain("I couldn't find a local answer for that question");
  expect(document.body.textContent).toContain('your question stays in this browser');
});
test('a failed local answer stays local and gives a usable fallback', async () => {
  answerBillingQuestion.mockImplementation(() => { throw new Error('Fictional local failure'); });
  await askUploadedQuestion();
  expect(document.body.textContent).toContain("I couldn't find a local answer for that question");
  expect(document.body.textContent).not.toContain('Fictional local failure');
});
test('a valid local answer is preserved without a provider request', async () => {
  answerBillingQuestion.mockReturnValue('Fictional local report answer');
  await askUploadedQuestion();
  expect(document.body.textContent).toContain('Fictional local report answer');
});
