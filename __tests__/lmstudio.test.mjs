import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isServerRunning,
  startServer,
  stopServer,
  isModelLoaded,
  loadBielikModel,
  unloadModel,
  unloadBielikModel,
  repairBrokenLinesWithBielik,
  deps
} from '../lmstudio.js';

describe('lmstudio utilities', () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  beforeEach(() => {
    mock.restoreAll();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    mock.restoreAll();
  });

  describe('isServerRunning', () => {
    test('returns true when server responds with ok status', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return { ok: true };
      });

      const running = await isServerRunning('http://mock:1234');
      assert.equal(running, true);
    });

    test('returns false when server responds with non-ok status', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return { ok: false };
      });

      const running = await isServerRunning('http://mock:1234');
      assert.equal(running, false);
    });

    test('returns false when server fetch rejects', async () => {
      mock.method(globalThis, 'fetch', async () => {
        throw new Error('Connection refused');
      });

      const running = await isServerRunning('http://mock:1234');
      assert.equal(running, false);
    });

    test('uses default LM_STUDIO_URL if baseUrl is omitted', async () => {
      let calledUrl = '';
      mock.method(globalThis, 'fetch', async (url) => {
        calledUrl = url;
        return { ok: true };
      });

      const running = await isServerRunning();
      assert.equal(running, true);
      assert.equal(calledUrl, 'http://127.0.0.1:1234/v1/models');
    });

    test('aborts and returns false when server fetch times out', async () => {
      mock.method(globalThis, 'fetch', async (_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      // Advance timers or simulate signal abort directly
      mock.timers.enable();
      const promise = isServerRunning('http://mock:1234');
      mock.timers.tick(2001);
      const running = await promise;
      mock.timers.reset();
      assert.equal(running, false);
    });
  });

  describe('deps.delay', () => {
    test('resolves after specified milliseconds', async () => {
      const start = Date.now();
      await deps.delay(10);
      assert.ok(Date.now() - start >= 5);
    });
  });

  describe('startServer', () => {
    test('starts server and succeeds when server becomes ready on first poll', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });
      mock.method(globalThis, 'fetch', async () => {
        return { ok: true };
      });

      const result = await startServer();
      assert.equal(result, true);
      assert.equal(execMock.mock.callCount(), 1);
      assert.equal(execMock.mock.calls[0].arguments[0], 'lms server start');
    });

    test('retries polling when server is not ready initially, then succeeds', async () => {
      mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });
      mock.method(deps, 'delay', async () => {
        return Promise.resolve();
      });

      let pollCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        pollCount += 1;
        if (pollCount < 3) {
          throw new Error('Not ready yet');
        }
        return { ok: true };
      });

      const result = await startServer();
      assert.equal(result, true);
      assert.equal(pollCount, 3);
    });

    test('throws an error if server does not become ready within 15 attempts', async () => {
      mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });
      mock.method(deps, 'delay', async () => {
        return Promise.resolve();
      });
      mock.method(globalThis, 'fetch', async () => {
        return { ok: false };
      });

      await assert.rejects(
        async () => {
          return startServer();
        },
        {
          name: 'Error',
          message: 'LM Studio server failed to start within timeout.'
        }
      );
    });
  });

  describe('stopServer', () => {
    test('calls deps.exec with lms server stop', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });

      await stopServer();
      assert.equal(execMock.mock.callCount(), 1);
      assert.equal(execMock.mock.calls[0].arguments[0], 'lms server stop');
    });
  });

  describe('isModelLoaded', () => {
    test('returns true when model matches exact identifier', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return {
              data: [{ id: 'bielik' }]
            };
          }
        };
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      assert.equal(loaded, true);
    });

    test('returns false when model only contains partial identifier but not exact match', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return {
              data: [{ id: 'bielik-11b-v3.0-instruct' }]
            };
          }
        };
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      assert.equal(loaded, false);
    });

    test('returns false when model list does not match identifier', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return {
              data: [{ id: 'llama-3' }]
            };
          }
        };
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      assert.equal(loaded, false);
    });

    test('returns false when fetch response is not ok', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return { ok: false };
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      assert.equal(loaded, false);
    });

    test('returns false when fetch rejects', async () => {
      mock.method(globalThis, 'fetch', async () => {
        throw new Error('Network error');
      });

      const loaded = await isModelLoaded('bielik', 'http://mock:1234');
      assert.equal(loaded, false);
    });

    test('uses default parameters when omitted', async () => {
      let requestedUrl = '';
      mock.method(globalThis, 'fetch', async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => {
            return {
              data: [{ id: 'bielik' }]
            };
          }
        };
      });

      const loaded = await isModelLoaded();
      assert.equal(loaded, true);
      assert.equal(requestedUrl, 'http://127.0.0.1:1234/v1/models');
    });
  });

  describe('loadBielikModel', () => {
    test('returns true immediately without executing command if model is already loaded', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return {
              data: [{ id: 'bielik' }]
            };
          }
        };
      });

      const result = await loadBielikModel();
      assert.equal(result, true);
      assert.equal(execMock.mock.callCount(), 0);
    });

    test('calls deps.exec when model is only on disk and not loaded as identifier', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return {
              data: [{ id: 'bielik-11b-v3.0-instruct' }]
            };
          }
        };
      });

      const result = await loadBielikModel();
      assert.equal(result, true);
      assert.equal(execMock.mock.callCount(), 1);
      assert.equal(
        execMock.mock.calls[0].arguments[0],
        'lms load bielik-11b-v3.0-instruct -y --identifier bielik'
      );
    });

    test('calls deps.exec when model is not currently loaded', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return { data: [] };
          }
        };
      });

      const result = await loadBielikModel('bielik-custom', 'my-bielik');
      assert.equal(result, true);
      assert.equal(execMock.mock.callCount(), 1);
      assert.equal(
        execMock.mock.calls[0].arguments[0],
        'lms load bielik-custom -y --identifier my-bielik'
      );
    });
  });

  describe('unloadModel', () => {
    test('calls deps.exec with lms unload <identifier>', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });

      const result = await unloadModel('custom-model');
      assert.equal(result, true);
      assert.equal(execMock.mock.callCount(), 1);
      assert.equal(execMock.mock.calls[0].arguments[0], 'lms unload custom-model');
    });

    test('uses default identifier bielik when omitted', async () => {
      const execMock = mock.method(deps, 'exec', async () => {
        return { stdout: '', stderr: '' };
      });

      const result = await unloadModel();
      assert.equal(result, true);
      assert.equal(execMock.mock.callCount(), 1);
      assert.equal(execMock.mock.calls[0].arguments[0], 'lms unload bielik');
    });

    test('unloadBielikModel is an alias for unloadModel', async () => {
      assert.equal(unloadBielikModel, unloadModel);
    });
  });

  describe('repairBrokenLinesWithBielik', () => {
    test('returns original text immediately if no replacement characters exist', async () => {
      const input = 'Linijka 1 bez uszkodzen\nLinijka 2 takze czysta';
      const output = await repairBrokenLinesWithBielik(input);
      assert.equal(output, input);
    });

    test('sends batch lines to Bielik and reconstructs the text', async () => {
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

      const fetchMock = mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return mockCompletionResponse;
          }
        };
      });

      let progressDone = 0;
      let progressTotal = 0;
      const progressCallback = (done, total) => {
        progressDone = done;
        progressTotal = total;
      };

      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234', progressCallback);

      assert.equal(fetchMock.mock.callCount(), 1);
      assert.equal(progressDone, 2);
      assert.equal(progressTotal, 2);
      assert.equal(output, '1\n00:00:01,000 --> 00:00:03,000\nŻołnierze!\n\n2\n00:00:04,000 --> 00:00:06,000\n/Wyłazić!/');
    });

    test('preserves CRLF newlines if original text had CRLF', async () => {
      const input = 'Linia 1: \uFFFDle\r\nLinia 2: dobrze';
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: true,
          json: async () => {
            return {
              choices: [{ message: { content: '1. Linia 1: źle' } }]
            };
          }
        };
      });

      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234');
      assert.equal(output, 'Linia 1: źle\r\nLinia 2: dobrze');
    });

    test('handles API non-ok status gracefully by keeping original lines', async () => {
      const input = 'Linia 1: \uFFFDle';
      mock.method(console, 'error', () => {});
      mock.method(globalThis, 'fetch', async () => {
        return {
          ok: false,
          statusText: 'Internal Server Error'
        };
      });

      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234');
      assert.equal(output, input);
    });

    test('handles network errors gracefully by keeping original lines', async () => {
      const input = 'Linia 1: \uFFFDle';
      mock.method(console, 'error', () => {});
      mock.method(globalThis, 'fetch', async () => {
        throw new Error('Network timeout');
      });

      const output = await repairBrokenLinesWithBielik(input, 'http://mock:1234');
      assert.equal(output, input);
    });
  });
});
