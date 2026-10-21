import {
  extractBrokenWords,
  preserveCase,
  applyWordReplacements
} from '../lmstudio.js';

describe('lmstudio utilities', () => {
  describe('extractBrokenWords', () => {
    it('should extract unique words containing \\uFFFD', () => {
      const text = 'Loxley, roku pa\uFFFDskiego 1180\n\uFFFDo\uFFFDnierze! \uFFFDo\uFFFDnierze...';
      const words = extractBrokenWords(text);

      expect(words).toEqual(['pa\uFFFDskiego', '\uFFFDo\uFFFDnierze']);
    });

    it('should return an empty array if no broken words exist', () => {
      const text = 'Loxley, roku pańskiego 1180. Żołnierze!';
      const words = extractBrokenWords(text);

      expect(words).toEqual([]);
    });
  });

  describe('preserveCase', () => {
    it('should preserve all-uppercase casing', () => {
      expect(preserveCase('ONIERZE', 'żołnierze')).toBe('ŻOŁNIERZE');
    });

    it('should preserve capitalized first letter', () => {
      expect(preserveCase('Wyazi', 'wyłazić')).toBe('Wyłazić');
    });

    it('should preserve lowercase casing', () => {
      expect(preserveCase('chopca', 'chłopca')).toBe('chłopca');
    });

    it('should handle falsy values gracefully', () => {
      expect(preserveCase(null, 'test')).toBe('test');
      expect(preserveCase('test', null)).toBeNull();
    });
  });

  describe('applyWordReplacements', () => {
    it('should replace all instances of broken words', () => {
      const text = '/Wy\uFFFDazi\uFFFD!/ \uFFFDo\uFFFDnierze! \uFFFDo\uFFFDnierze...';
      const replacements = new Map([
        ['Wy\uFFFDazi\uFFFD', 'Wyłazić'],
        ['\uFFFDo\uFFFDnierze', 'Żołnierze']
      ]);

      const result = applyWordReplacements(text, replacements);

      expect(result).toBe('/Wyłazić!/ Żołnierze! Żołnierze...');
    });
  });
});
