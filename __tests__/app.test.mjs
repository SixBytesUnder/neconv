import { jest } from '@jest/globals';
import path from 'path';

// Set the environment to test
process.env.NODE_ENV = 'test';

const mockOra = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
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
    writeFile: jest.fn()
  };
});

// Mock console
global.console = {
  ...global.console,
  log: jest.fn(),
  error: jest.fn()
};

const { getFiles, promptUser, processFile, run } = await import('../app.js');
const { glob } = await import('glob');
const inquirer = (await import('inquirer')).default;
const { readFile, writeFile } = await import('fs/promises');
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

      expect(glob).toHaveBeenCalledWith('*.{txt,srt}', { nocase: true });
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

  describe('processFile', () => {
    const file = 'test.srt';

    it('should process a file successfully', async () => {
      const originalContent = Buffer.from([0xB9, 0xE6]); // CP1250 bytes

      readFile.mockResolvedValue(originalContent);
      writeFile.mockResolvedValue();

      const result = await processFile(file);

      expect(readFile).toHaveBeenCalledWith(file);
      expect(writeFile).toHaveBeenCalledTimes(1);
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

    it('should handle readFile errors and return null without throwing', async () => {
      const readError = new Error('Cannot read file');
      readFile.mockRejectedValue(readError);

      const result = await processFile(file);

      expect(result).toBeNull();
      expect(writeFile).not.toHaveBeenCalled();
      expect(mockOra.fail).toHaveBeenCalledWith(`${path.basename(file)} - failed`);
      expect(mockOra.stop).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(`Error processing ${path.basename(file)}:`, readError);
    });

    it('should handle writeFile errors and return null without throwing', async () => {
      const originalContent = Buffer.from('some text');
      const writeError = new Error('Cannot write file');

      readFile.mockResolvedValue(originalContent);
      writeFile.mockRejectedValue(writeError);

      const result = await processFile(file);

      expect(result).toBeNull();
      expect(writeFile).toHaveBeenCalledTimes(1);
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

      // file1 fails, file2 succeeds
      readFile
        .mockRejectedValueOnce(new Error('Cannot read file1'))
        .mockResolvedValueOnce(Buffer.from('some text in file2'));
      writeFile.mockResolvedValue();

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
    });

    it('should not process files if none are selected', async () => {
      glob.mockResolvedValue(['file1.txt']);
      inquirer.prompt.mockResolvedValue({ files: [] });

      await run();

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
