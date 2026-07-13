import { describe, it, expect, vi } from 'vitest';
import { DefaultMessageStrategy } from './default-message.strategy';
import { NotificationTemplateEngine } from '@app/backend-postgres-main-notification';

describe(DefaultMessageStrategy.name, () => {
  describe('getMessage', () => {
    it('should return undefined when template is missing', () => {
      const mockEntity = { template: undefined };
      const strategy = new DefaultMessageStrategy(mockEntity as any);
      const result = strategy.getMessage('en');
      expect(result).toBeUndefined();
    });

    it('should return undefined when bot content resolves to empty', () => {
      const mockEntity = {
        template: {
          botChannel: undefined,
          body: undefined,
        },
      };
      const strategy = new DefaultMessageStrategy(mockEntity as any);
      const result = strategy.getMessage('en');
      expect(result).toBeUndefined();
    });

    it('should return message with rendered body text', () => {
      const mockEntity = {
        template: {
          botChannel: undefined,
          body: { en: 'Hello {{name}}' },
          templateEngine: NotificationTemplateEngine.StringFormat,
        },
        data: { name: 'World' },
      };
      const strategy = new DefaultMessageStrategy(mockEntity as any);
      const result = strategy.getMessage('en');
      expect(result).toBeDefined();
      expect(result?.text).toBe('Hello World');
    });

    it('should return undefined when body text renders to empty', () => {
      const mockEntity = {
        template: {
          botChannel: undefined,
          body: { en: '' },
          templateEngine: NotificationTemplateEngine.StringFormat,
        },
      };
      const strategy = new DefaultMessageStrategy(mockEntity as any);
      const result = strategy.getMessage('en');
      expect(result).toBeUndefined();
    });
  });

  describe('prepareData', () => {
    it('should resolve language keys from nested objects', () => {
      const strategy = new DefaultMessageStrategy({ template: {} } as any);
      const data = { greeting: { en: 'Hello', ru: 'Privet' } };
      const result = strategy['prepareData'](data as any, 'en');
      expect(result.greeting).toBe('Hello');
    });

    it('should fall back to default language', () => {
      const strategy = new DefaultMessageStrategy({ template: {} } as any);
      const data = { greeting: { en: 'Hello', default: 'Hi' } };
      const result = strategy['prepareData'](data as any, 'fr');
      expect(result.greeting).toBe('Hello');
    });

    it('should pass through non-language objects', () => {
      const strategy = new DefaultMessageStrategy({ template: {} } as any);
      const data = { count: 42, name: 'test' };
      const result = strategy['prepareData'](data as any, 'en');
      expect(result.count).toBe(42);
      expect(result.name).toBe('test');
    });
  });

  describe('format', () => {
    it('should render string-format templates', () => {
      const strategy = new DefaultMessageStrategy({ template: {} } as any);
      const result = strategy['format']('Hello {{name}}', { name: 'World' }, NotificationTemplateEngine.StringFormat);
      expect(result).toBe('Hello World');
    });

    it('should render Eta templates', () => {
      const strategy = new DefaultMessageStrategy({ template: {} } as any);
      const result = strategy['format']('Hello <%= name %>', { name: 'World' }, NotificationTemplateEngine.Eta);
      expect(result).toBe('Hello World');
    });

    it('should return undefined for template engine errors', () => {
      const strategy = new DefaultMessageStrategy({ template: {} } as any);
      const result = strategy['format']('{{ invalid', {}, NotificationTemplateEngine.StringFormat);
      expect(result).toBeUndefined();
    });
  });

  describe('renderButtons', () => {
    it('should render button text with template data', () => {
      const mockEntity = {
        template: {
          botChannel: undefined,
          body: { en: 'Hello' },
          buttons: { en: [[{ text: 'Click {{action}}', callback: 'cb' }]] },
          templateEngine: NotificationTemplateEngine.StringFormat,
        },
        data: { action: 'Me' },
      };
      const strategy = new DefaultMessageStrategy(mockEntity as any);
      const result = strategy.getMessage('en');
      expect(result?.buttons).toEqual([[{ text: 'Click Me', callback: 'cb' }]]);
    });

    it('should return undefined when no buttons defined', () => {
      const mockEntity = {
        template: {
          botChannel: undefined,
          body: { en: 'Hello' },
          templateEngine: NotificationTemplateEngine.StringFormat,
        },
      };
      const strategy = new DefaultMessageStrategy(mockEntity as any);
      const result = strategy.getMessage('en');
      expect(result?.buttons).toBeUndefined();
    });
  });
});
