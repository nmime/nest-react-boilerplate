// @requirements REQ-FRONTEND-SHELL-004
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import ProblemsPage from './problems.astro';

describe('landing /problems route', () => {
  it('renders the actual Astro page as an accessible problem-type document', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ProblemsPage, {
      request: new Request('https://landing.example.test/problems'),
      partial: false,
    });
    const document = new JSDOM(html).window.document;

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('API problem types');
    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('API problem types');
    expect(document.querySelector('#about-blank h2')?.textContent).toContain('about:blank');
    expect(document.querySelectorAll('section[id]').length).toBeGreaterThan(1);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('RFC 9457');
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain('width=device-width');
  });
});
