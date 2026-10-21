import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const LM_STUDIO_URL = 'http://127.0.0.1:1234';
const DEFAULT_MODEL_KEY = 'bielik-11b-v3.0-instruct';
const DEFAULT_IDENTIFIER = 'bielik';
const BATCH_SIZE = 25;

export async function isServerRunning (baseUrl = LM_STUDIO_URL) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 2000);

    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startServer () {
  await execAsync('lms server start');

  // Wait for server to become responsive
  for (let i = 0; i < 15; i += 1) {
    if (await isServerRunning()) {
      return true;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error('LM Studio server failed to start within timeout.');
}

export async function stopServer () {
  await execAsync('lms server stop');
}

export async function isModelLoaded (identifier = DEFAULT_IDENTIFIER, baseUrl = LM_STUDIO_URL) {
  try {
    const res = await fetch(`${baseUrl}/v1/models`);
    if (!res.ok) {
      return false;
    }
    const json = await res.json();
    return json.data && json.data.some((m) => {
      return m.id === identifier || m.id.includes(identifier);
    });
  } catch {
    return false;
  }
}

export async function loadBielikModel (modelKey = DEFAULT_MODEL_KEY, identifier = DEFAULT_IDENTIFIER) {
  if (await isModelLoaded(identifier)) {
    return true;
  }
  await execAsync(`lms load ${modelKey} -y --identifier ${identifier}`);
  return true;
}

export function extractBrokenWords (text) {
  const wordRegex = /[a-zA-Z\u00C0-\u024F\uFFFD]*\uFFFD[a-zA-Z\u00C0-\u024F\uFFFD]*/g;
  const matches = text.match(wordRegex) || [];
  return [...new Set(matches)];
}

export function preserveCase (original, replacement) {
  if (!original || !replacement) {
    return replacement;
  }
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.toLowerCase();
}

export async function fixBrokenWordsWithBielik (words, baseUrl = LM_STUDIO_URL, onProgress = null) {
  if (!words || words.length === 0) {
    return new Map();
  }

  const replacements = new Map();

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);

    if (onProgress) {
      onProgress(i + batch.length, words.length);
    }

    const prompt = `Napraw uszkodzone słowa w języku polskim.
W każdym słowie znak  oznacza dokładnie jedną brakującą polską literę: ą, ć, ę, ł, ń, ó, ś, ź, ż (lub wielką: Ą, Ć, Ę, Ł, Ń, Ó, Ś, Ź, Ż).
Pozostałe litery w słowie muszą pozostać bez zmian! Zachowaj wielkość liter.

Przykłady:
"Wyazi" -> "Wyłazić"
"onierze" -> "żołnierze"
"paskiego" -> "pańskiego"
"zosta" -> "zostań"
"Chod" -> "Chodź"

Słowa do naprawy:
${JSON.stringify(batch, null, 2)}

Zwróć WYŁĄCZNIE poprawny obiekt JSON, w którym kluczem jest uszkodzone słowo, a wartością poprawne polskie słowo:
{
  "uszkodzone": "poprawne"
}`;

    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_IDENTIFIER,
          messages: [
            {
              role: 'system',
              content: 'Zwracasz wyłącznie poprawny obiekt JSON {"uszkodzone": "poprawne"}. Zero markdown, zero tekstu dodatkowego.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) {
        throw new Error(`LM Studio API error: ${res.statusText}`);
      }

      const data = await res.json();
      const raw = data.choices[0].message.content.trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const mapping = JSON.parse(cleaned);

      for (const [broken, fixed] of Object.entries(mapping)) {
        if (typeof fixed === 'string' && fixed.trim()) {
          replacements.set(broken, preserveCase(broken, fixed.trim()));
        }
      }
    } catch (err) {
      console.error('Bielik batch processing warning:', err.message);
    }
  }

  return replacements;
}

export function applyWordReplacements (text, replacements) {
  let updated = text;
  for (const [broken, fixed] of replacements.entries()) {
    updated = updated.replaceAll(broken, fixed);
  }
  return updated;
}
