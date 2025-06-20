import { describe, beforeEach, it, expect } from 'vitest';
import { EnvService } from './env.service.js';

describe('EnvService', () => {
  let service: EnvService;

  beforeEach(() => {
    service = new EnvService();
  });

  describe('.isProd()', () => {
    it('should return true when environment is production', () => {
      // @ts-expect-error Modifying readonly property for testing
      service['environment'] = 'production';
      expect(service.isProd).toBe(true);
    });

    it('should return false when environment is not production', () => {
      // @ts-expect-error Modifying readonly property for testing
      service['environment'] = 'development';
      expect(service.isProd).toBe(false);

      // @ts-expect-error Modifying readonly property for testing
      service['environment'] = 'test';
      expect(service.isProd).toBe(false);
    });
  });

  describe('.getString()', () => {
    it('should return the value of the environment variable', () => {
      process.env.TEST_STRING = 'testValue';
      expect(service.getString('TEST_STRING')).toBe('testValue');
    });

    it('should return null if the environment variable is not set', () => {
      expect(service.getString('NON_EXISTENT_VAR')).toBeNull();
    });

    it('should return default value if provided and variable is not set', () => {
      expect(service.getString('NON_EXISTENT_VAR', 'defaultValue')).toBe(
        'defaultValue',
      );
    });
  });

  describe('.getNumber()', () => {
    it('should return the number value of the environment variable', () => {
      process.env.TEST_NUMBER = '42';
      expect(service.getNumber('TEST_NUMBER')).toBe(42);
    });

    it('should return null if the environment variable is not set', () => {
      expect(service.getNumber('NON_EXISTENT_VAR')).toBeNull();
    });

    it('should return default value if provided and variable is not set', () => {
      expect(service.getNumber('NON_EXISTENT_VAR', 100)).toBe(100);
    });
  });

  describe('.getObject()', () => {
    it('should return the parsed object from the environment variable', () => {
      process.env.TEST_OBJECT = '{"key": "value"}';
      expect(service.getObject('TEST_OBJECT')).toEqual({ key: 'value' });
    });

    it('should return null if the environment variable is not set', () => {
      expect(service.getObject('NON_EXISTENT_VAR')).toBeNull();
    });

    it('should return default value if provided and variable is not set', () => {
      expect(
        service.getObject('NON_EXISTENT_VAR', { default: 'value' }),
      ).toEqual({
        default: 'value',
      });
    });

    it('should throw an error if the environment variable is not a valid JSON string', () => {
      process.env.INVALID_JSON = 'not a json';
      expect(() => service.getObject('INVALID_JSON')).toThrow(SyntaxError);
    });
  });
});
