import { describe, it, expect } from 'vitest';
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
          body: { en: 'Hello {name}' },
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

  describe('renderButtons', () => {
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
