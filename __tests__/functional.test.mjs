import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isUtf8 } from 'node:buffer';
import iconvlite from 'iconv-lite';
import jschardet from 'jschardet';
import { repairBrokenLinesWithBielik } from '../lmstudio.js';
import { processFile, deps } from '../app.js';

describe('Functional file conversions on disk', () => {
  let tempDir;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'neconv-func-'));
    mock.restoreAll();
    const silentSpinner = {
      text: '',
      start: () => {
        return silentSpinner;
      },
      succeed: () => {},
      fail: () => {},
      stop: () => {},
      info: () => {}
    };
    mock.method(deps, 'ora', () => {
      return silentSpinner;
    });
    mock.method(deps, 'isServerRunning', async () => {
      return true;
    });
    mock.method(deps, 'startServer', async () => {
      return true;
    });
    mock.method(deps, 'loadBielikModel', async () => {
      return true;
    });
    mock.method(deps, 'repairBrokenLinesWithBielik', async (text) => {
      return text;
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('converts UTF-8 with BOM by stripping BOM and keeping valid UTF-8 on disk', async () => {
    const testFile = path.join(tempDir, 'sub-with-bom.srt');
    const content = '1\r\n00:00:01,000 --> 00:00:02,000\r\nZażółć gęślą jaźń\r\n';
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const fileData = Buffer.concat([bom, Buffer.from(content, 'utf8')]);

    await writeFile(testFile, fileData);

    const initialStat = await stat(testFile);
    assert.equal(initialStat.size, fileData.length);

    const result = await processFile(testFile);
    assert.equal(result, content);

    const onDisk = await readFile(testFile);
    assert.equal(isUtf8(onDisk), true);
    // BOM must not be present
    assert.ok(onDisk[0] !== 0xEF || onDisk[1] !== 0xBB || onDisk[2] !== 0xBF);
    assert.equal(onDisk.toString('utf8'), content);

    // No leftover temporary files
    const dirEntries = await readdir(tempDir);
    assert.deepEqual(dirEntries, ['sub-with-bom.srt']);
  });

  test('converts UTF-16LE with BOM to clean UTF-8 on disk', async () => {
    const testFile = path.join(tempDir, 'sub-utf16le.srt');
    const content = '1\r\n00:00:01,000 --> 00:00:03,000\r\nCześć, to jest próba napisów!\r\n';
    const encoded = iconvlite.encode(content, 'utf16le', { addBOM: true });

    await writeFile(testFile, encoded);

    // Verify initial file has UTF-16LE BOM (0xFF, 0xFE)
    const initialBytes = await readFile(testFile);
    assert.equal(initialBytes[0], 0xFF);
    assert.equal(initialBytes[1], 0xFE);
    assert.equal(isUtf8(initialBytes), false);

    const result = await processFile(testFile);
    assert.equal(result, content);

    const convertedBytes = await readFile(testFile);
    assert.equal(isUtf8(convertedBytes), true);
    assert.ok(convertedBytes[0] !== 0xFF || convertedBytes[1] !== 0xFE);
    assert.equal(convertedBytes.toString('utf8'), content);
  });

  test('converts UTF-16BE with BOM to clean UTF-8 on disk', async () => {
    const testFile = path.join(tempDir, 'sub-utf16be.srt');
    const content = '1\r\n00:00:01,000 --> 00:00:03,000\r\nWielki test UTF-16BE\r\n';
    const encoded = iconvlite.encode(content, 'utf16be', { addBOM: true });

    await writeFile(testFile, encoded);

    const initialBytes = await readFile(testFile);
    assert.equal(initialBytes[0], 0xFE);
    assert.equal(initialBytes[1], 0xFF);

    const result = await processFile(testFile);
    assert.equal(result, content);

    const convertedBytes = await readFile(testFile);
    assert.equal(isUtf8(convertedBytes), true);
    assert.equal(convertedBytes.toString('utf8'), content);
  });

  test('converts CP1250 encoded subtitles with Polish characters to clean UTF-8 on disk', async () => {
    const testFile = path.join(tempDir, 'sub-cp1250.srt');
    const content = '1\r\n00:00:01,000 --> 00:00:02,000\r\nZażółć gęślą jaźń - ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż\r\n';
    const cp1250Bytes = iconvlite.encode(content, 'cp1250');

    await writeFile(testFile, cp1250Bytes);

    const initialBytes = await readFile(testFile);
    assert.equal(isUtf8(initialBytes), false);

    const result = await processFile(testFile);
    assert.equal(result, content);

    const convertedBytes = await readFile(testFile);
    assert.equal(isUtf8(convertedBytes), true);
    assert.equal(convertedBytes.toString('utf8'), content);
  });

  test('converts CP1250 encoded MicroDVD .txt file to .srt on disk, keeping original .txt', async () => {
    const txtFile = path.join(tempDir, 'sub-cp1250.txt');
    const srtFile = path.join(tempDir, 'sub-cp1250.srt');
    const txtContent = '{100}{200}/Zażółć gęślą jaźń|ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż';
    const cp1250Bytes = iconvlite.encode(txtContent, 'cp1250');

    await writeFile(txtFile, cp1250Bytes);

    const result = await processFile(txtFile);
    assert.ok(result);

    const srtBytes = await readFile(srtFile);
    assert.equal(isUtf8(srtBytes), true);
    assert.ok(srtBytes.toString('utf8').includes('<i>Zażółć gęślą jaźń</i>\r\nĄĆĘŁŃÓŚŹŻ ąćęłńóśźż'));

    const txtAfter = await readFile(txtFile);
    assert.deepEqual(txtAfter, cp1250Bytes);
  });

  test('correctly converts sample slice from real fixture Community MicroDVD .txt to .srt', async () => {
    const sourceFixture = path.resolve(
      'test_files',
      'Community.S01E07.Introduction.to.Statistics.1080p.BluRay.DD5.1.x265-POIASD.txt'
    );
    const targetTxtFile = path.join(tempDir, 'community-sample.txt');
    const targetSrtFile = path.join(tempDir, 'community-sample.srt');

    const fullContent = await readFile(sourceFixture, 'utf8');
    const sampleLines = fullContent.split(/\r?\n/).slice(0, 10).join('\r\n');
    await writeFile(targetTxtFile, Buffer.from(sampleLines, 'utf8'));

    const result = await processFile(targetTxtFile);
    assert.ok(result);

    const srtContent = await readFile(targetSrtFile, 'utf8');
    assert.ok(srtContent.startsWith('1\r\n00:00:00,042 --> 00:00:04,171\r\nwww.napiprojekt.pl - nowa jakość napisów.\r\nNapisy zostały specjalnie dopasowane do Twojej wersji filmu.'));
    assert.ok(srtContent.includes('2\r\n00:00:00,792 --> 00:00:04,129\r\nJak wiecie, wszyscy nauczyciele na Greendale\r\nsą zobowiązani przydzielić'));

    const txtContentAfter = await readFile(targetTxtFile, 'utf8');
    assert.equal(txtContentAfter, sampleLines);
  });

  test('converts ISO-8859-2 encoded subtitles to clean UTF-8 on disk', async () => {
    mock.method(jschardet, 'detect', () => {
      return { encoding: 'ISO-8859-2', confidence: 0.95 };
    });

    const testFile = path.join(tempDir, 'sub-iso.srt');
    const content = '1\r\n00:00:01,000 --> 00:00:02,000\r\nŚwiatło w mroku, gęś i jaźń\r\n';
    const isoBytes = iconvlite.encode(content, 'iso-8859-2');

    await writeFile(testFile, isoBytes);

    const result = await processFile(testFile);
    assert.equal(result, content);

    const convertedBytes = await readFile(testFile);
    assert.equal(isUtf8(convertedBytes), true);
    assert.equal(convertedBytes.toString('utf8'), content);
  });

  test('skips rewriting already valid UTF-8 files and leaves file untouched', async () => {
    const testFile = path.join(tempDir, 'already-utf8.srt');
    const content = '1\r\n00:00:01,000 --> 00:00:02,000\r\nCzysty UTF-8 bez BOM\r\n';

    await writeFile(testFile, Buffer.from(content, 'utf8'));
    const beforeStat = await stat(testFile);

    const result = await processFile(testFile);
    assert.equal(result, content);

    const afterStat = await stat(testFile);
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
    assert.equal(afterStat.size, beforeStat.size);
  });

  test('heals broken characters on disk using Bielik model integration', async () => {
    const testFile = path.join(tempDir, 'broken-chars.srt');
    const brokenText = '1\r\n00:00:01,000 --> 00:00:03,000\r\npa\uFFFDskiego\r\n';
    await writeFile(testFile, Buffer.from(brokenText, 'utf8'));

    mock.method(deps, 'repairBrokenLinesWithBielik', (text, url, onProgress) => {
      return repairBrokenLinesWithBielik(text, url, onProgress);
    });

    // Mock LM Studio HTTP API
    mock.method(globalThis, 'fetch', async (url) => {
      if (url.includes('/v1/models')) {
        return {
          ok: true,
          json: async () => {
            return { data: [{ id: 'bielik' }] };
          }
        };
      }
      if (url.includes('/v1/chat/completions')) {
        return {
          ok: true,
          json: async () => {
            return {
              choices: [
                {
                  message: {
                    content: '1. pańskiego'
                  }
                }
              ]
            };
          }
        };
      }
      return { ok: true };
    });

    const result = await processFile(testFile);
    assert.equal(result, '1\r\n00:00:01,000 --> 00:00:03,000\r\npańskiego\r\n');

    const fileContent = await readFile(testFile, 'utf8');
    assert.equal(fileContent, '1\r\n00:00:01,000 --> 00:00:03,000\r\npańskiego\r\n');
    assert.equal(fileContent.includes('\uFFFD'), false);
  });

  test('correctly converts sample slice from real fixture Robin Of Sherwood UTF-16LE with BOM', async () => {
    const sourceFixture = path.resolve('test_files', 'Robin Of Sherwood - 1X06 - The Kings Fool.srt');
    const targetFile = path.join(tempDir, 'test-utf16.srt');

    // Read only a small slice (first 512 bytes) to verify BOM without processing the entire 60KB file
    const fullData = await readFile(sourceFixture);
    const sliceLen = Math.min(512, fullData.length - (fullData.length % 2));
    await writeFile(targetFile, fullData.subarray(0, sliceLen));

    const sourceData = await readFile(targetFile);
    assert.equal(sourceData[0], 0xFF);
    assert.equal(sourceData[1], 0xFE);
    assert.equal(isUtf8(sourceData), false);

    const result = await processFile(targetFile);
    assert.ok(result);

    const convertedData = await readFile(targetFile);
    assert.equal(isUtf8(convertedData), true);
    assert.ok(convertedData[0] !== 0xFF || convertedData[1] !== 0xFE);
  });

  test('correctly converts sample slice from real fixture UTF-8 with BOM', async () => {
    const sourceFixture = path.resolve(
      'test_files',
      'Robin Of Sherwood - 1X01 - Robin Hood And The Sorcerer (Part 1) - Copy.srt'
    );
    const targetFile = path.join(tempDir, 'test-utf8-bom.srt');

    // Read only a small slice (first 512 bytes) to verify BOM stripping on a real fixture
    const fullData = await readFile(sourceFixture);
    await writeFile(targetFile, fullData.subarray(0, Math.min(512, fullData.length)));

    const sourceData = await readFile(targetFile);
    assert.equal(sourceData[0], 0xEF);
    assert.equal(sourceData[1], 0xBB);
    assert.equal(sourceData[2], 0xBF);

    const result = await processFile(targetFile);
    assert.ok(result);

    const convertedData = await readFile(targetFile);
    assert.equal(isUtf8(convertedData), true);
    assert.ok(convertedData[0] !== 0xEF || convertedData[1] !== 0xBB || convertedData[2] !== 0xBF);
  });
});
