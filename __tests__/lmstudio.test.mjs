import { jest } from '@jest/globals';
import {
  isServerRunning,
  isModelLoaded,
  repairBrokenLinesWithBielik
} from '../lmstudio.js';

describe('lmstudio utilities', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('isServerRunning', () => {
    it('should return true if server responds with ok status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true
      });

      const running = await isServerRunning('http://mock:1234');
      expect(running).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://mock:1234/v1/models', expect.any(Object));
    });

    it('should return false if server fetch fails or times out', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const running = await isServerRunning('http://mock:1234');
      expect(running).toBe(false);
    });
  });

  describe('isModelLoaded', () => {
    it('should return true when model matches identifier', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          return {
            data: [{ id: 'bielik-11b-v3.0-instruct' }]
          };
        }
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      expect(loaded).toBe(true);
    });

    it('should return false when model is not loaded or response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      expect(loaded).toBe(false);
    });
  });

  describe('repairBrokenLinesWithBielik', () => {
    it('should return original text immediately if no replacement characters exist', async () => {
      const input = 'Linijka 1 bez uszkodzeń\nLinijka 2 także czysta';
      const output = await repairBrokenLinesWithBielik(input);
      expect(output).toBe(input);
    });

    it('should send batch lines to Bielik and reconstruct the text', async () => {
      const input = '1\n00:00:01,000 --> 00:00:03,000\n\uFFFDo\uFFFDnierze!\n\n2\n00:00:04,000 --> 00:00:06,000\n/Wy\uFFFDazi\uFFFD!/';
      const mockCompletionResponse = {
        choices: [
          {
            message: {
              content: '1. Żołnierze!\n2. /Wyłazić!/'
            }
          }
        ]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          return mockCompletionResponse;
        }
      });

      const progressCallback = jest.fn();
      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234', progressCallback);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);
      expect(output).toBe('1\n00:00:01,000 --> 00:00:03,000\nŻołnierze!\n\n2\n00:00:04,000 --> 00:00:06,000\n/Wyłazić!/');
    });

    it('should preserve CRLF newlines if original text had CRLF', async () => {
      const input = 'Linia 1: \uFFFDle\r\nLinia 2: dobrze';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          return {
            choices: [{ message: { content: '1. Linia 1: źle' } }]
          };
        }
      });

      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234');
      expect(output).toBe('Linia 1: źle\r\nLinia 2: dobrze');
    });

    it('should handle API errors gracefully by keeping original lines', async () => {
      const input = 'Linia 1: \uFFFDle';
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234');
      expect(output).toBe(input);
    });
  });
});
