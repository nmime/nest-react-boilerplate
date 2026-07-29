import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runPrompts, type PromptIo } from './prompts.js';

describe('interactive database provider prompt', () => {
  it('chooses one provider instead of prompting for independent provider checkboxes', async () => {
    const questions: string[] = [];
    const io: PromptIo = {
      async ask(question, defaultAnswer) {
        questions.push(question);
        if (question.startsWith('Choose a starting point')) {
          return '1';
        }
        if (question.includes('User Application (user-app)')) {
          return 'y';
        }
        if (question.startsWith('Choose a durable database provider')) {
          return '2';
        }
        return defaultAnswer ?? '';
      },
      write() {},
    };

    const result = await runPrompts(false, null, io);

    assert.ok(result.apps.includes('user-app'));
    assert.ok(result.apps.includes('user-app-api'));
    assert.ok(result.capabilities.includes('mongodb'));
    assert.ok(!result.capabilities.includes('postgres'));
    assert.equal(questions.filter((question) => question.includes('durable database provider')).length, 1);
    assert.ok(!questions.some((question) => question.includes('(postgres)') || question.includes('(mongodb)')));
  });
});
