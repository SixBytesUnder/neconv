import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const LM_STUDIO_URL = 'http://127.0.0.1:1234';
const DEFAULT_MODEL_KEY = 'bielik-11b-v3.0-instruct';
const DEFAULT_IDENTIFIER = 'bielik';
const LINE_BATCH_SIZE = 15;

export async function isServerRunning (baseUrl = LM_STUDIO_URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2000);

  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function startServer () {
  await execAsync('lms server start');

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

export async function repairBrokenLinesWithBielik (text, baseUrl = LM_STUDIO_URL, onProgress = null) {
  const lines = text.split(/\r?\n/);
  const brokenLineIndices = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('\uFFFD')) {
      brokenLineIndices.push(i);
    }
  }

  if (brokenLineIndices.length === 0) {
    return text;
  }

  const repairedLines = [...lines];

  for (let i = 0; i < brokenLineIndices.length; i += LINE_BATCH_SIZE) {
    const batchIndices = brokenLineIndices.slice(i, i + LINE_BATCH_SIZE);
    const batchLines = batchIndices.map((idx) => {
      return lines[idx];
    });

    if (onProgress) {
      onProgress(i + batchLines.length, brokenLineIndices.length);
    }

    const formattedInput = batchLines.map((l, idx) => {
      return `${idx + 1}. ${l}`;
    }).join('\n');

    const prompt = `Jesteś ekspertem języka polskiego i edytorem napisów filmowych.
W poniższych linijkach napisów polskie znaki diakrytyczne (ą, ć, ę, ł, ń, ó, ś, ź, ż) zostały uszkodzone i zastąpione znakiem \uFFFD.
Napraw uszkodzone polskie litery w każdej linijce na podstawie kontekstu zdania.

ZASADY:
1. Zwróć DOKŁADNIE ${batchLines.length} ponumerowanych linijek (od 1 do ${batchLines.length}).
2. Zachowaj oryginalną interpunkcję, ukośniki /, myślniki -, wielkość liter i formatowanie.
3. Nie zmieniaj ani nie parafrazuj słów - jedynie uzupełnij brakujące polskie litery.

Linijki do naprawy:
${formattedInput}

Poprawione linijki:`;

    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_IDENTIFIER,
          messages: [
            {
              role: 'system',
              content: 'Zwracasz wyłącznie ponumerowaną listę poprawionych linijek (1. ... do N. ...). Zero komentarzy, zero dodatkowego tekstu.'
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

      const lineRegex = /^\s*(\d+)[.)]\s*(.*)$/gm;
      let match;
      while ((match = lineRegex.exec(raw)) !== null) {
        const itemNum = parseInt(match[1], 10) - 1;
        const fixedLine = match[2].trim();
        if (itemNum >= 0 && itemNum < batchIndices.length && fixedLine) {
          const fileLineIndex = batchIndices[itemNum];
          repairedLines[fileLineIndex] = fixedLine;
        }
      }
    } catch (err) {
      console.error('Bielik batch line processing warning:', err.message);
    }
  }

  const isCrlf = text.includes('\r\n');
  return repairedLines.join(isCrlf ? '\r\n' : '\n');
}
