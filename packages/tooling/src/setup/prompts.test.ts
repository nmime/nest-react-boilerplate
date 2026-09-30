// @requirements REQ-SCAFFOLD-TOOLING-005 REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runPrompts, type PromptIo } from './prompts.js';
import { parseNrbConfig, schemaVersion } from './schema.js';

describe('interactive configuration defaults', () => {
  it('retains existing product and deployment namespaces when accepting prompt defaults', async () => {
    const existing = parseNrbConfig({
      schemaVersion,
      apps: ['landing-app'],
      product: { ciMode: 'maintainer', frontendApiMode: 'split-origin', mobileTargets: ['android'] },
      deployment: {
        publicDomain: 'orchard.example',
        imageRegistry: 'ghcr.io/example/orchard',
        kubernetesDelivery: 'argocd',
        targets: ['kubernetes'],
        infrastructure: { s3: 'external' },
      },
    });
    const result = await runPrompts(false, existing, {
      async ask(_question, defaultAnswer) {
        return defaultAnswer ?? '';
      },
      write() {},
    });
    assert.deepEqual(result.product, existing.product);
    assert.deepEqual(result.deployment, existing.deployment);
  });
});

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

describe('interactive public domain prompt', () => {
  it('asks for the domain and which app owns the apex', async () => {
    const questions: string[] = [];
    const io: PromptIo = {
      async ask(question, defaultAnswer) {
        questions.push(question);
        if (question.startsWith('Choose a starting point')) {
          return '1';
        }
        if (question.includes('Marketing Site (site-app)')) {
          return 'y';
        }
        if (question.startsWith('Enter the public domain')) {
          return 'dehqonhub.uz';
        }
        if (question.startsWith('Choose which app is served on')) {
          return '2';
        }
        return defaultAnswer ?? '';
      },
      write() {},
    };

    const result = await runPrompts(false, null, io);

    assert.equal(result.deployment.publicDomain, 'dehqonhub.uz');
    assert.equal(result.deployment.primaryApp, 'site-app');
    assert.ok(questions.some((question) => question.startsWith('Enter the public domain')));
  });

  it('offers no apex owner when the selection has no frontend app', async () => {
    const io: PromptIo = {
      async ask(question, defaultAnswer) {
        if (question.startsWith('Choose a starting point')) {
          return '1';
        }
        if (question.startsWith('Enter the public domain')) {
          return 'api.dehqonhub.uz';
        }
        return defaultAnswer ?? '';
      },
      write() {},
    };

    const result = await runPrompts(false, null, io);

    assert.equal(result.deployment.primaryApp, null);
  });
});
