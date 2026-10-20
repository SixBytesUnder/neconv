import { jest } from '@jest/globals';
import path from 'path';

// Set the environment to test
process.env.NODE_ENV = 'test';

const mockOra = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  info: jest.fn().mockReturnThis(),
  text: ''
};

jest.unstable_mockModule('ora', () => {
  return {
    default: jest.fn(() => {
      return mockOra;
    })
  };
});

jest.unstable_mockModule('jschardet', () => {
  return {
    default: {
      detect: jest.fn(() => {
        return { encoding: 'CP1250', confidence: 1 };
      })
    }
  };
});

jest.unstable_mockModule('glob', () => {
  return {
    glob: jest.fn()
  };
});

jest.unstable_mockModule('inquirer', () => {
  return {
    default: {
      prompt: jest.fn()
    }
  };
});

jest.unstable_mockModule('fs/promises', () => {
  return {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn()
  };
});

// Mock console
global.console = {
  ...global.console,
  log: jest.fn(),
  error: jest.fn()
};

const { getFiles, promptUser, detectSourceEncoding, processFile, run } = await import('../app.js');
const { glob } = await import('glob');
const jschardet = (await import('jschardet')).default;
const inquirer = (await import('inquirer')).default;
const { readFile, writeFile, rename, unlink } = await import('fs/promises');
const ora = (await import('ora')).default;

describe('neconv application', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getFiles', () => {
    it('should call glob to find .txt and .srt files', async () => {
      const mockFiles = ['sub1.srt', 'notes.txt'];
      glob.mockResolvedValue(mockFiles);

      const files = await getFiles();

      expect(glob).toHaveBeenCalledWith('*.{txt,srt}', { nocase: true, nodir: true });
      expect(files).toEqual(mockFiles);
    });

    it('should handle glob errors', async () => {
      const error = new Error('glob error');
      glob.mockRejectedValue(error);

      await expect(getFiles()).rejects.toThrow('glob error');
    });
  });

  describe('promptUser', () => {
    it('should use inquirer to prompt the user', async () => {
      const inputFiles = ['sub1.srt', 'notes.txt'];
      const userSelection = { files: ['sub1.srt'] };
      inquirer.prompt.mockResolvedValue(userSelection);

      const answers = await promptUser(inputFiles);

      expect(inquirer.prompt).toHaveBeenCalledWith({
        type: 'checkbox',
        name: 'files',
        message: 'Select files to convert',
        pageSize: 30,
        choices: inputFiles
      });
      expect(answers).toEqual(userSelection);
    });
  });

  describe('detectSourceEncoding', () => {
    it('should return UTF-8 for valid UTF-8 buffers', () => {
      const utf8Buffer = Buffer.from('Zażółć gęślą jaźń', 'utf8');
      expect(detectSourceEncoding(utf8Buffer)).toBe('UTF-8');
    });

    it('should return detected encoding when supported and high confidence', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      jschardet.detect.mockReturnValueOnce({ encoding: 'ISO-8859-2', confidence: 0.95 });

      expect(detectSourceEncoding(cp1250Buffer)).toBe('ISO-8859-2');
    });

    it('should fallback to CP1250 when confidence is below threshold', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      jschardet.detect.mockReturnValueOnce({ encoding: 'iso8859-3', confidence: 0.1 });

      expect(detectSourceEncoding(cp1250Buffer)).toBe('CP1250');
    });

    it('should fallback to CP1250 when detected encoding is not in supported list', () => {
      const cp1250Buffer = Buffer.from([0xB9, 0xE6]);
      jschardet.detect.mockReturnValueOnce({ encoding: 'KOI8-R', confidence: 0.99 });

      expect(detectSourceEncoding(cp1250Buffer)).toBe('CP1250');
    });
  });

  describe('processFile', () => {
    const file = 'test.srt';

    it('should process and atomically convert a CP1250 file', async () => {
      const originalContent = Buffer.from([0xB9, 0xE6]); // CP1250 bytes

      readFile.mockResolvedValue(originalContent);
      writeFile.mockResolvedValue();
      rename.mockResolvedValue();

      const result = await processFile(file);

      expect(readFile).toHaveBeenCalledWith(file);
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(rename).toHaveBeenCalledTimes(1);
      expect(ora).toHaveBeenCalledWith({
        text: `${path.basename(file)} - processing...`,
        spinner: 'dots2'
      });
      expect(mockOra.start).toHaveBeenCalledTimes(1);
      expect(mockOra.succeed).toHaveBeenCalledWith(`${path.basename(file)} - DONE`);
      expect(mockOra.fail).not.toHaveBeenCalled();
      expect(mockOra.stop).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should skip writing if file is already UTF-8', async () => {
      const utf8Content = Buffer.from('already utf8', 'utf8');

      readFile.mockResolvedValue(utf8Content);

      const result = await processFile(file);

      expect(readFile).toHaveBeenCalledWith(file);
      expect(writeFile).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
      expect(mockOra.info).toHaveBeenCalledWith(`${path.basename(file)} - already UTF-8 (skipped)`);
      expect(result).toBe('already utf8');
    });

    it('should handle readFile errors and return null without throwing', async () => {
      const readError = new Error('Cannot read file');
      readFile.mockRejectedValue(readError);

      const result = await processFile(file);

      expect(result).toBeNull();
      expect(writeFile).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
      expect(mockOra.fail).toHaveBeenCalledWith(`${path.basename(file)} - failed`);
      expect(mockOra.stop).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(`Error processing ${path.basename(file)}:`, readError);
    });

    it('should handle writeFile errors, clean up temp file, and return null without throwing', async () => {
      const originalContent = Buffer.from([0xB9, 0xE6]);
      const writeError = new Error('Cannot write file');

      readFile.mockResolvedValue(originalContent);
      writeFile.mockRejectedValue(writeError);
      unlink.mockResolvedValue();

      const result = await processFile(file);

      expect(result).toBeNull();
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(unlink).toHaveBeenCalledTimes(1);
      expect(rename).not.toHaveBeenCalled();
      expect(mockOra.fail).toHaveBeenCalledWith(`${path.basename(file)} - failed`);
      expect(mockOra.succeed).not.toHaveBeenCalled();
      expect(mockOra.stop).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(`Error processing ${path.basename(file)}:`, writeError);
    });
  });

  describe('run', () => {
    it('should orchestrate the file conversion process and continue even if one file fails', async () => {
      const mockFiles = ['file1.txt', 'file2.srt'];
      const userSelection = { files: ['file1.txt', 'file2.srt'] };

      glob.mockResolvedValue(mockFiles);
      inquirer.prompt.mockResolvedValue(userSelection);

      // file1 fails, file2 succeeds (CP1250)
      readFile
        .mockRejectedValueOnce(new Error('Cannot read file1'))
        .mockResolvedValueOnce(Buffer.from([0xB9, 0xE6]));
      writeFile.mockResolvedValue();
      rename.mockResolvedValue();

      await run();

      expect(glob).toHaveBeenCalledTimes(1);
      expect(inquirer.prompt).toHaveBeenCalledWith({
        type: 'checkbox',
        name: 'files',
        message: 'Select files to convert',
        pageSize: 30,
        choices: mockFiles
      });
      expect(readFile).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(rename).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('should gracefully handle ExitPromptError when prompt is cancelled', async () => {
      glob.mockResolvedValue(['file1.txt']);
      const cancelError = new Error('Cancelled');
      cancelError.name = 'ExitPromptError';
      inquirer.prompt.mockRejectedValue(cancelError);

      await run();

      expect(console.log).toHaveBeenCalledWith('Operation cancelled.');
      expect(readFile).not.toHaveBeenCalled();
    });

    it('should not process files if none are selected', async () => {
      glob.mockResolvedValue(['file1.txt']);
      inquirer.prompt.mockResolvedValue({ files: [] });

      await run();

      expect(console.log).toHaveBeenCalledWith('No files selected.');
      expect(readFile).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should log a message if no files are found', async () => {
      glob.mockResolvedValue([]);

      await run();

      expect(console.log).toHaveBeenCalledWith('No .txt or .srt files found in the current directory.');
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });
  });
});
