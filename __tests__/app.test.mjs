// app.test.js
import { jest } from '@jest/globals';

describe('app.js', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getFiles should return a list of files', async () => {
    // Mock 'glob' module
    await jest.unstable_mockModule('glob', () => {
      return {
        glob: jest.fn().mockImplementation((pattern, options) => {
          return Promise.resolve(['file1.txt', 'file2.srt']);
        })
      };
    });

    // Dynamically import the module under test after mocking
    const { getFiles } = await import('../app.js');
    const files = await getFiles();
    expect(files).toEqual(['file1.txt', 'file2.srt']);
  });

  test('promptUser should return selected files', async () => {
    // Mock 'inquirer' module
    await jest.unstable_mockModule('inquirer', () => {
      return {
        default: {
          prompt: jest.fn().mockResolvedValue({ files: ['file1.txt'] })
        }
      };
    });

    const { promptUser } = await import('../app.js');
    const answers = await promptUser(['file1.txt', 'file2.srt']);
    expect(answers.files).toEqual(['file1.txt']);
  });

  test('processFile should process a file', async () => {
    // Mock 'fs' module
    await jest.unstable_mockModule('fs', () => {
      return {
        readFile: jest.fn((file, callback) => {
          callback(null, Buffer.from('test data', 'utf-8'));
        }),
        writeFile: jest.fn((file, data, callback) => {
          callback(null);
        })
      };
    });

    const { processFile } = await import('../app.js');
    const result = await processFile('file1.txt');
    expect(result).toBe('test data');
  });
});
