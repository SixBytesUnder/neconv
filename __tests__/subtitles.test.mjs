import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSrtTimestamp,
  formatSubtitleText,
  isSrtContent,
  parseMicroDvd,
  parseMpl2,
  parseTmplayer,
  convertToSrt
} from '../subtitles.js';

describe('subtitles module', () => {
  describe('formatSrtTimestamp', () => {
    test('formats 0 milliseconds', () => {
      assert.equal(formatSrtTimestamp(0), '00:00:00,000');
    });

    test('formats milliseconds with padding', () => {
      assert.equal(formatSrtTimestamp(42), '00:00:00,042');
      assert.equal(formatSrtTimestamp(1000), '00:00:01,000');
    });

    test('formats minutes, seconds and hours', () => {
      assert.equal(formatSrtTimestamp(65432), '00:01:05,432');
      assert.equal(formatSrtTimestamp(3661005), '01:01:01,005');
    });

    test('handles negative values safely by clamping to zero', () => {
      assert.equal(formatSrtTimestamp(-100), '00:00:00,000');
    });
  });

  describe('formatSubtitleText', () => {
    test('formats single plain line', () => {
      assert.equal(formatSubtitleText('Zwykły tekst'), 'Zwykły tekst');
    });

    test('splits lines by pipe into CRLF newlines', () => {
      assert.equal(formatSubtitleText('Linia 1|Linia 2'), 'Linia 1\r\nLinia 2');
    });

    test('converts leading slash on a line to italics', () => {
      const result = formatSubtitleText('/- Dzwonić do "mama".|- Co!?');
      assert.equal(result, '<i>- Dzwonić do "mama".</i>\r\n- Co!?');
    });

    test('converts leading slash on both lines to italics', () => {
      const result = formatSubtitleText('/Jak tam w szkole?|/Jesteś popularny?');
      assert.equal(result, '<i>Jak tam w szkole?</i>\r\n<i>Jesteś popularny?</i>');
    });

    test('does not convert text with embedded slashes into italics', () => {
      const result = formatSubtitleText('- \\\\ NewAge SubTeam //-');
      assert.equal(result, '- \\\\ NewAge SubTeam //-');
    });

    test('applies global bold {Y:b} to all lines', () => {
      const result = formatSubtitleText('{Y:b}Tytuł|Podtytuł');
      assert.equal(result, '<b>Tytuł</b>\r\n<b>Podtytuł</b>');
    });

    test('applies global italic {Y:i} to all lines', () => {
      const result = formatSubtitleText('{Y:i}Gdziekolwiek się maskują');
      assert.equal(result, '<i>Gdziekolwiek się maskują</i>');
    });

    test('applies global underline {Y:u} to all lines', () => {
      const result = formatSubtitleText('{Y:u}Podkreślenie');
      assert.equal(result, '<u>Podkreślenie</u>');
    });

    test('strips color tags {c:$...}', () => {
      const result = formatSubtitleText('{c:$0099fa9}Tłumaczenie: Drzazga|{c:$0099fa9}Korekta: Czekoladowy Blok');
      assert.equal(result, 'Tłumaczenie: Drzazga\r\nKorekta: Czekoladowy Blok');
    });

    test('combines global bold and strips color tags', () => {
      const result = formatSubtitleText('{Y:b}{c:$0099fa9}- NewAge -|{c:$0099fa9}- Nast -');
      assert.equal(result, '<b>- NewAge -</b>\r\n<b>- Nast -</b>');
    });

    test('applies line-level italic tag {y:i}', () => {
      const result = formatSubtitleText('Normalny tekst|{y:i}Pochylony tekst');
      assert.equal(result, 'Normalny tekst\r\n<i>Pochylony tekst</i>');
    });

    test('replaces [br] tag with newline', () => {
      const result = formatSubtitleText('Część 1[br]Część 2');
      assert.equal(result, 'Część 1\r\nCzęść 2');
    });
  });

  describe('isSrtContent', () => {
    test('returns true for valid SRT formatted text', () => {
      const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nNapisy\r\n';
      assert.equal(isSrtContent(srt), true);
    });

    test('returns false for MicroDVD formatted text', () => {
      const txt = '{100}{200}Napisy w MicroDVD';
      assert.equal(isSrtContent(txt), false);
    });

    test('returns false for plain text', () => {
      assert.equal(isSrtContent('Tylko zwykły tekst'), false);
    });
  });

  describe('parseMicroDvd', () => {
    test('parses basic MicroDVD lines with default 23.976 fps', () => {
      const input = '{1}{100}Linia pierwsza|Linia druga\n{19}{99}Druga linia';
      const entries = parseMicroDvd(input);

      assert.equal(entries.length, 2);
      assert.equal(entries[0].startMs, 42);
      assert.equal(entries[0].endMs, 4171);
      assert.equal(entries[0].text, 'Linia pierwsza\r\nLinia druga');

      assert.equal(entries[1].startMs, 792);
      assert.equal(entries[1].endMs, 4129);
      assert.equal(entries[1].text, 'Druga linia');
    });

    test('detects framerate from header line {1}{1}25.0', () => {
      const input = '{1}{1}25.000\n{25}{50}Test 25 FPS';
      const entries = parseMicroDvd(input);

      assert.equal(entries.length, 1);
      assert.equal(entries[0].startMs, 1000);
      assert.equal(entries[0].endMs, 2000);
      assert.equal(entries[0].text, 'Test 25 FPS');
    });

    test('ensures endMs is not less than startMs', () => {
      const input = '{500}{400}Błędne klatki';
      const entries = parseMicroDvd(input, 25);

      assert.equal(entries.length, 1);
      assert.equal(entries[0].startMs, 20000);
      assert.equal(entries[0].endMs, 20000);
    });
  });

  describe('parseMpl2', () => {
    test('parses MPL2 decisecond timestamps', () => {
      const input = '[100][270]Pierwsza linia\n[280][350]Druga linia';
      const entries = parseMpl2(input);

      assert.equal(entries.length, 2);
      assert.equal(entries[0].startMs, 10000);
      assert.equal(entries[0].endMs, 27000);
      assert.equal(entries[0].text, 'Pierwsza linia');
      assert.equal(entries[1].startMs, 28000);
      assert.equal(entries[1].endMs, 35000);
      assert.equal(entries[1].text, 'Druga linia');
    });
  });

  describe('parseTmplayer', () => {
    test('parses TMPlayer timestamp lines and derives duration', () => {
      const input = '00:01:20:Pierwszy tekst\n00:01:25:Drugi tekst';
      const entries = parseTmplayer(input);

      assert.equal(entries.length, 2);
      assert.equal(entries[0].startMs, 80000);
      assert.equal(entries[0].endMs, 84000);
      assert.equal(entries[0].text, 'Pierwszy tekst');

      assert.equal(entries[1].startMs, 85000);
      assert.equal(entries[1].endMs, 88000);
      assert.equal(entries[1].text, 'Drugi tekst');
    });
  });

  describe('convertToSrt', () => {
    test('converts MicroDVD content to full SRT output', () => {
      const input = '{1}{100}Napisy|Drugi wiersz\n{200}{300}/Pochylony';
      const srt = convertToSrt(input, { defaultFps: 23.976 });

      const expected = [
        '1',
        '00:00:00,042 --> 00:00:04,171',
        'Napisy\r\nDrugi wiersz',
        '',
        '2',
        '00:00:08,342 --> 00:00:12,513',
        '<i>Pochylony</i>',
        ''
      ].join('\r\n');

      assert.equal(srt, expected);
    });

    test('preserves already-SRT content with normalized newlines', () => {
      const input = '1\n00:00:01,000 --> 00:00:02,000\nCześć\n';
      const srt = convertToSrt(input);
      assert.equal(srt, '1\r\n00:00:01,000 --> 00:00:02,000\r\nCześć\r\n');
    });

    test('returns original text if no subtitle patterns are recognized', () => {
      const input = 'To nie jest żaden format napisów.';
      const result = convertToSrt(input);
      assert.equal(result, input);
    });
  });
});
