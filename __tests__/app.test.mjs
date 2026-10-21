import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import jschardet from 'jschardet';
import iconvlite from 'iconv-lite';
import {
  getFiles,
  promptUser,
  detectSourceEncoding,
  processFile,
  run,
  deps
} from '../app.js';

describe('neconv application', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  let mockSpinner;

  beforeEach(() => {
    mock.restoreAll();
    mockSpinner = {
      text: '',
      start: () => {
        return mockSpinner;
      },
      succeed: mock.fn(),
      fail: mock.fn(),
      stop: mock.fn(),
      info: mock.fn()
    };
    mock.method(deps, 'ora', () => {
      return mockSpinner;
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mock.restoreAll();
    process.exitCode = undefined;
  });

  describe('getFiles', () => {
    test('calls glob to find .txt and .srt files', async () => {
      const mockFiles = ['sub1.srt', 'notes.txt'];
      const globMock = mock.method(deps, 'glob', async () => {
        return mockFiles;
      });

      const files = await getFiles();

      assert.equal(globMock.mock.callCount(), 1);
      assert.deepEqual(globMock.mock.calls[0].arguments, [
        '*.{txt,srt}',
        { nocase: true, nodir: true }
      ]);
      assert.deepEqual(files, mockFiles);
    });

    test('propagates glob errors', async () => {
      mock.method(deps, 'glob', async () => {
        throw new Error('glob error');
      });

      await assert.rejects(
        async () => {
          return getFiles();
        },
        {
          name: 'Error',
          message: 'glob error'
        }
      );
    });
  });

  describe('promptUser', () => {
    test('prompts the user with checkbox choices using inquirer', async () => {
      const inputFiles = ['sub1.srt', 'notes.txt'];
      const userSelection = { files: ['sub1.srt'] };
      const promptMock = mock.method(deps.inquirer, 'prompt', async () => {
        return userSelection;
      });

      const answers = await promptUser(inputFiles);

      assert.equal(promptMock.mock.callCount(), 1);
      assert.deepEqual(promptMock.mock.calls[0].arguments[0], {
        type: 'checkbox',
        name: 'files',
        message: 'Select files to convert',
        pageSize: 30,
        choices: inputFiles
      });
      assert.deepEqual(answers, userSelection);
    });
  });

  describe('detectSourceEncoding', () => {
    test('detects UTF-16LE from BOM', () => {
      const buffer = Buffer.from([0xFF, 0xFE, 0x31, 0x00]);
      assert.equal(detectSourceEncoding(buffer), 'UTF-16LE');
    });

    test('detects UTF-16BE from BOM', () => {
      const buffer = Buffer.from([0xFE, 0xFF, 0x00, 0x31]);
      assert.equal(detectSourceEncoding(buffer), 'UTF-16BE');
    });

    test('detects UTF-8 from BOM', () => {
      const buffer = Buffer.from([0xEF, 0xBB, 0xBF, 0x31]);
      assert.equal(detectSourceEncoding(buffer), 'UTF-8');
    });

    test('returns UTF-8 for valid UTF-8 buffers without BOM', () => {
      const utf8Buffer = Buffer.from('Zażółć gęślą jaźń', 'utf8');
      assert.equal(detectSourceEncoding(utf8Buffer), 'UTF-8');
    });

    test('returns detected encoding when supported and high confidence', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      mock.method(jschardet, 'detect', () => {
        return { encoding: 'ISO-8859-2', confidence: 0.95 };
      });

      assert.equal(detectSourceEncoding(cp1250Buffer), 'ISO-8859-2');
    });

    test('falls back to CP1250 when confidence is below threshold', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      mock.method(jschardet, 'detect', () => {
        return { encoding: 'ISO-8859-2', confidence: 0.75 };
      });

      assert.equal(detectSourceEncoding(cp1250Buffer), 'CP1250');
    });

    test('falls back to CP1250 when detected encoding is not supported', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      mock.method(jschardet, 'detect', () => {
        return { encoding: 'KOI8-R', confidence: 0.99 };
      });

      assert.equal(detectSourceEncoding(cp1250Buffer), 'CP1250');
    });

    test('falls back to CP1250 when detected encoding does not exist in iconv-lite', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      mock.method(jschardet, 'detect', () => {
        return { encoding: 'UTF-16LE', confidence: 0.95 };
      });
      mock.method(iconvlite, 'encodingExists', () => {
        return false;
      });

      assert.equal(detectSourceEncoding(cp1250Buffer), 'CP1250');
    });

    test('falls back to CP1250 when jschardet returns null or empty', () => {
      const nonUtf8Buffer = Buffer.from([0xB9, 0xE6]);
      mock.method(jschardet, 'detect', () => {
        return null;
      });

      assert.equal(detectSourceEncoding(nonUtf8Buffer), 'CP1250');
    });
  });

  describe('processFile', () => {
    const file = 'test.srt';

    test('processes and converts a CP1250 file to UTF-8', async () => {
      const originalContent = iconvlite.encode('Zażółć', 'cp1250');
      mock.method(deps, 'readFile', async () => {
        return originalContent;
      });
      const writeMock = mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      const renameMock = mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const result = await processFile(file);

      assert.equal(writeMock.mock.callCount(), 1);
      assert.equal(writeMock.mock.calls[0].arguments[1], 'Zażółć');
      assert.equal(renameMock.mock.callCount(), 1);
      assert.equal(mockSpinner.succeed.mock.callCount(), 1);
      assert.equal(mockSpinner.succeed.mock.calls[0].arguments[0], `${path.basename(file)} - DONE`);
      assert.equal(mockSpinner.stop.mock.callCount(), 1);
      assert.equal(result, 'Zażółć');
    });

    test('processes and strips BOM from a UTF-8 with BOM file', async () => {
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const content = Buffer.from('Napisy', 'utf8');
      const utf8WithBom = Buffer.concat([bom, content]);

      mock.method(deps, 'readFile', async () => {
        return utf8WithBom;
      });
      const writeMock = mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      const renameMock = mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const result = await processFile(file);

      assert.equal(writeMock.mock.callCount(), 1);
      assert.equal(writeMock.mock.calls[0].arguments[1], 'Napisy');
      assert.equal(renameMock.mock.callCount(), 1);
      assert.equal(mockSpinner.succeed.mock.callCount(), 1);
      assert.equal(result, 'Napisy');
    });

    test('processes and converts a UTF-16LE file with BOM to UTF-8', async () => {
      const utf16leContent = Buffer.from([0xFF, 0xFE, 0x31, 0x00, 0x0D, 0x00, 0x0A, 0x00]);
      mock.method(deps, 'readFile', async () => {
        return utf16leContent;
      });
      const writeMock = mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      const renameMock = mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const result = await processFile(file);

      assert.equal(writeMock.mock.callCount(), 1);
      assert.equal(writeMock.mock.calls[0].arguments[1], '1\r\n');
      assert.equal(renameMock.mock.callCount(), 1);
      assert.equal(mockSpinner.succeed.mock.callCount(), 1);
      assert.equal(result, '1\r\n');
    });

    test('skips writing if file is already valid UTF-8 without BOM and without broken chars', async () => {
      const utf8Content = Buffer.from('Czysty tekst UTF-8', 'utf8');
      mock.method(deps, 'readFile', async () => {
        return utf8Content;
      });
      const writeMock = mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      const renameMock = mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const result = await processFile(file);

      assert.equal(writeMock.mock.callCount(), 0);
      assert.equal(renameMock.mock.callCount(), 0);
      assert.equal(mockSpinner.info.mock.callCount(), 1);
      assert.equal(
        mockSpinner.info.mock.calls[0].arguments[0],
        `${path.basename(file)} - already UTF-8 (skipped)`
      );
      assert.equal(result, 'Czysty tekst UTF-8');
    });

    test('repairs broken characters using lmContext when lmContext is provided', async () => {
      const brokenContent = Buffer.from('pa\uFFFDskiego');
      mock.method(deps, 'readFile', async () => {
        return brokenContent;
      });
      mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const ensureReadyMock = mock.fn(async () => {
        return Promise.resolve();
      });
      const repairMock = mock.method(deps, 'repairBrokenLinesWithBielik', async () => {
        return 'pańskiego';
      });

      const lmContext = { ensureReady: ensureReadyMock };
      const result = await processFile(file, lmContext);

      assert.equal(ensureReadyMock.mock.callCount(), 1);
      assert.equal(repairMock.mock.callCount(), 1);
      assert.equal(result, 'pańskiego');
    });

    test('repairs broken characters and starts LM Studio when lmContext is not provided and server is stopped', async () => {
      const brokenContent = Buffer.from('pa\uFFFDskiego');
      mock.method(deps, 'readFile', async () => {
        return brokenContent;
      });
      mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const isRunningMock = mock.method(deps, 'isServerRunning', async () => {
        return false;
      });
      const startServerMock = mock.method(deps, 'startServer', async () => {
        return true;
      });
      const loadModelMock = mock.method(deps, 'loadBielikModel', async () => {
        return true;
      });
      const repairMock = mock.method(
        deps,
        'repairBrokenLinesWithBielik',
        async (_text, _url, onProgress) => {
          if (onProgress) {
            onProgress(1, 1);
          }
          return 'pańskiego';
        }
      );

      const result = await processFile(file);

      assert.equal(isRunningMock.mock.callCount(), 1);
      assert.equal(startServerMock.mock.callCount(), 1);
      assert.equal(loadModelMock.mock.callCount(), 1);
      assert.equal(repairMock.mock.callCount(), 1);
      assert.equal(result, 'pańskiego');
    });

    test('repairs broken characters without restarting server when server is already running', async () => {
      const brokenContent = Buffer.from('pa\uFFFDskiego');
      mock.method(deps, 'readFile', async () => {
        return brokenContent;
      });
      mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const isRunningMock = mock.method(deps, 'isServerRunning', async () => {
        return true;
      });
      const startServerMock = mock.method(deps, 'startServer', async () => {
        return true;
      });
      const loadModelMock = mock.method(deps, 'loadBielikModel', async () => {
        return true;
      });
      mock.method(deps, 'repairBrokenLinesWithBielik', async () => {
        return 'pańskiego';
      });

      const result = await processFile(file);

      assert.equal(isRunningMock.mock.callCount(), 1);
      assert.equal(startServerMock.mock.callCount(), 0);
      assert.equal(loadModelMock.mock.callCount(), 1);
      assert.equal(result, 'pańskiego');
    });

    test('handles readFile errors and returns null without throwing', async () => {
      const readError = new Error('Cannot read file');
      mock.method(deps, 'readFile', async () => {
        throw readError;
      });
      mock.method(console, 'error', () => {});

      const result = await processFile(file);

      assert.equal(result, null);
      assert.equal(mockSpinner.fail.mock.callCount(), 1);
      assert.equal(mockSpinner.fail.mock.calls[0].arguments[0], `${path.basename(file)} - failed`);
    });

    test('handles writeFile errors, cleans up temp file, and returns null', async () => {
      mock.method(deps, 'readFile', async () => {
        return Buffer.from([0xB9, 0xE6]);
      });
      mock.method(deps, 'writeFile', async () => {
        throw new Error('Disk full');
      });
      const unlinkMock = mock.method(deps, 'unlink', async () => {
        return Promise.resolve();
      });
      mock.method(console, 'error', () => {});

      const result = await processFile(file);

      assert.equal(result, null);
      assert.equal(unlinkMock.mock.callCount(), 1);
      assert.equal(mockSpinner.fail.mock.callCount(), 1);
    });

    test('handles writeFile errors gracefully even when unlink fails', async () => {
      mock.method(deps, 'readFile', async () => {
        return Buffer.from([0xB9, 0xE6]);
      });
      mock.method(deps, 'writeFile', async () => {
        throw new Error('Disk full');
      });
      mock.method(deps, 'unlink', async () => {
        throw new Error('Unlink failed');
      });
      mock.method(console, 'error', () => {});

      const result = await processFile(file);

      assert.equal(result, null);
      assert.equal(mockSpinner.fail.mock.callCount(), 1);
    });
  });

  describe('run', () => {
    test('logs message when no files are found', async () => {
      mock.method(deps, 'glob', async () => {
        return [];
      });
      let loggedMessage = '';
      mock.method(console, 'log', (msg) => {
        loggedMessage = msg;
      });

      await run();

      assert.equal(loggedMessage, 'No .txt or .srt files found in the current directory.');
    });

    test('gracefully handles ExitPromptError when prompt is cancelled', async () => {
      mock.method(deps, 'glob', async () => {
        return ['sub1.srt'];
      });
      const cancelError = new Error('Cancelled');
      cancelError.name = 'ExitPromptError';
      mock.method(deps.inquirer, 'prompt', async () => {
        throw cancelError;
      });
      let loggedMessage = '';
      mock.method(console, 'log', (msg) => {
        loggedMessage = msg;
      });

      await run();

      assert.equal(loggedMessage, 'Operation cancelled.');
    });

    test('rethrows unexpected prompt errors', async () => {
      mock.method(deps, 'glob', async () => {
        return ['sub1.srt'];
      });
      const unexpectedError = new Error('Inquirer crashed');
      mock.method(deps.inquirer, 'prompt', async () => {
        throw unexpectedError;
      });

      await assert.rejects(
        async () => {
          return run();
        },
        {
          name: 'Error',
          message: 'Inquirer crashed'
        }
      );
    });

    test('logs message when user selects no files', async () => {
      mock.method(deps, 'glob', async () => {
        return ['sub1.srt'];
      });
      mock.method(deps.inquirer, 'prompt', async () => {
        return { files: [] };
      });
      let loggedMessage = '';
      mock.method(console, 'log', (msg) => {
        loggedMessage = msg;
      });

      await run();

      assert.equal(loggedMessage, 'No files selected.');
    });

    test('processes selected files and sets exitCode to 1 if any file fails', async () => {
      mock.method(deps, 'glob', async () => {
        return ['file1.srt', 'file2.srt'];
      });
      mock.method(deps.inquirer, 'prompt', async () => {
        return { files: ['file1.srt', 'file2.srt'] };
      });

      let call = 0;
      mock.method(deps, 'readFile', async () => {
        call += 1;
        if (call === 1) {
          throw new Error('Read error');
        }
        return Buffer.from('already utf8', 'utf8');
      });
      mock.method(console, 'error', () => {});

      await run();

      assert.equal(process.exitCode, 1);
    });

    test('manages LM Studio lifecycle and shuts down server after broken lines repair', async () => {
      mock.method(deps, 'glob', async () => {
        return ['broken.srt'];
      });
      mock.method(deps.inquirer, 'prompt', async () => {
        return { files: ['broken.srt'] };
      });
      mock.method(deps, 'readFile', async () => {
        return Buffer.from('pa\uFFFDskiego');
      });
      mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      const isRunningMock = mock.method(deps, 'isServerRunning', async () => {
        return false;
      });
      const startServerMock = mock.method(deps, 'startServer', async () => {
        return true;
      });
      const loadModelMock = mock.method(deps, 'loadBielikModel', async () => {
        return true;
      });
      mock.method(deps, 'repairBrokenLinesWithBielik', async () => {
        return 'pańskiego';
      });
      const stopServerMock = mock.method(deps, 'stopServer', async () => {
        return true;
      });

      await run();

      assert.equal(isRunningMock.mock.callCount(), 1);
      assert.equal(startServerMock.mock.callCount(), 1);
      assert.equal(loadModelMock.mock.callCount(), 1);
      assert.equal(stopServerMock.mock.callCount(), 1);
      assert.equal(mockSpinner.succeed.mock.callCount(), 2);
    });

    test('handles LM Studio shutdown failure in finally block gracefully', async () => {
      mock.method(deps, 'glob', async () => {
        return ['broken.srt'];
      });
      mock.method(deps.inquirer, 'prompt', async () => {
        return { files: ['broken.srt'] };
      });
      mock.method(deps, 'readFile', async () => {
        return Buffer.from('pa\uFFFDskiego');
      });
      mock.method(deps, 'writeFile', async () => {
        return Promise.resolve();
      });
      mock.method(deps, 'rename', async () => {
        return Promise.resolve();
      });

      mock.method(deps, 'isServerRunning', async () => {
        return true;
      });
      mock.method(deps, 'loadBielikModel', async () => {
        return true;
      });
      mock.method(deps, 'repairBrokenLinesWithBielik', async () => {
        return 'pańskiego';
      });
      mock.method(deps, 'stopServer', async () => {
        throw new Error('Process kill failed');
      });

      await run();

      assert.equal(mockSpinner.fail.mock.callCount(), 1);
      assert.ok(
        mockSpinner.fail.mock.calls[0].arguments[0].includes('Failed to stop LM Studio server')
      );
    });
  });
});
