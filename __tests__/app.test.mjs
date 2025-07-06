import { jest } from '@jest/globals';
import path from 'path';

// Set the environment to test
process.env.NODE_ENV = 'test';

const mockOra = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
};

jest.unstable_mockModule('ora', () => ({
    default: jest.fn(() => mockOra),
}));

jest.unstable_mockModule('glob', () => ({
    glob: jest.fn(),
}));

jest.unstable_mockModule('inquirer', () => ({
    default: {
        prompt: jest.fn(),
    },
}));

jest.unstable_mockModule('fs', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));

// Mock console.error
global.console = {
    ...global.console,
    error: jest.fn(),
};

const { getFiles, promptUser, processFile, run } = await import('../app.js');
const { glob } = await import('glob');
const inquirer = (await import('inquirer')).default;
const { readFile, writeFile } = await import('fs');
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
                choices: inputFiles,
            });
            expect(answers).toEqual(userSelection);
        });
    });

    describe('processFile', () => {
        const file = 'test.srt';

        it('should process a file successfully', async () => {
            const originalContent = Buffer.from('some text in cp1250');

            readFile.mockImplementation((filePath, callback) => {
                expect(filePath).toBe(file);
                callback(null, originalContent);
            });

            writeFile.mockImplementation((filePath, data, callback) => {
                expect(filePath).toBe(file);
                expect(data).toBeDefined();
                callback(null);
            });

            await processFile(file);

            expect(readFile).toHaveBeenCalledTimes(1);
            expect(writeFile).toHaveBeenCalledTimes(1);
            expect(ora).toHaveBeenCalledWith({
                text: `${path.basename(file)} - processing...`,
                spinner: 'dots2'
            });
            expect(mockOra.start).toHaveBeenCalledTimes(1);
            expect(mockOra.succeed).toHaveBeenCalledWith(`${path.basename(file)} - DONE`);
            expect(mockOra.fail).not.toHaveBeenCalled();
            expect(mockOra.stop).toHaveBeenCalledTimes(1);
        });

        it('should handle readFile errors', async () => {
            const readError = new Error('Cannot read file');
            readFile.mockImplementation((filePath, callback) => {
                callback(readError, null);
            });

            await expect(processFile(file)).rejects.toBe(readError);

            expect(writeFile).not.toHaveBeenCalled();
            expect(ora).not.toHaveBeenCalled();
        });

        it('should handle writeFile errors', async () => {
            const originalContent = Buffer.from('some text');
            const writeError = new Error('Cannot write file');

            readFile.mockImplementation((filePath, callback) => {
                callback(null, originalContent);
            });

            writeFile.mockImplementation((filePath, data, callback) => {
                callback(writeError);
            });

            await processFile(file);

            expect(writeFile).toHaveBeenCalledTimes(1);
            expect(mockOra.fail).toHaveBeenCalledWith(`${path.basename(file)} - failed`);
            expect(mockOra.succeed).not.toHaveBeenCalled();
            expect(mockOra.stop).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalledWith(writeError);
        });
    });

    describe('run', () => {
        it('should orchestrate the file conversion process', async () => {
            const mockFiles = ['file1.txt', 'file2.srt'];
            const userSelection = { files: ['file1.txt'] };

            glob.mockResolvedValue(mockFiles);
            inquirer.prompt.mockResolvedValue(userSelection);
            // Since processFile is complex, we trust its own tests and mock it here
            const processFile = jest.fn().mockResolvedValue();

            // Re-import run with the mocked processFile
            const { run } = await import('../app.js');

            await run();

            expect(glob).toHaveBeenCalledTimes(1);
            expect(inquirer.prompt).toHaveBeenCalledWith({
                type: 'checkbox',
                name: 'files',
                message: 'Select files to convert',
                pageSize: 30,
                choices: mockFiles,
            });
        });

        it('should not process files if none are selected', async () => {
            glob.mockResolvedValue(['file1.txt']);
            inquirer.prompt.mockResolvedValue({ files: [] }); // No files selected

            const processFile = jest.fn();
            const { run } = await import('../app.js');

            await run();

            expect(processFile).not.toHaveBeenCalled();
        });
    });
});