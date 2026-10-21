export function formatSrtTimestamp (ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;

  const pad = (num, len) => {
    return String(num).padStart(len, '0');
  };

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

export function formatSubtitleText (rawText, eol = '\r\n') {
  let text = rawText;
  let globalItalic = false;
  let globalBold = false;
  let globalUnderline = false;

  const globalTagRegex = /^\{[Yy]:([ibu,]+)\}/i;
  let globalMatch;
  while ((globalMatch = text.match(globalTagRegex)) !== null) {
    const flags = globalMatch[1].toLowerCase();
    if (flags.includes('i')) {
      globalItalic = true;
    }
    if (flags.includes('b')) {
      globalBold = true;
    }
    if (flags.includes('u')) {
      globalUnderline = true;
    }
    text = text.slice(globalMatch[0].length);
  }

  text = text.replace(/\[br\]/gi, '|');

  const subLines = text.split('|');
  const formattedLines = subLines.map((subLine) => {
    let lineText = subLine;
    let lineItalic = globalItalic;
    let lineBold = globalBold;
    let lineUnderline = globalUnderline;

    const lineTagRegex = /\{y:([ibu,]+)\}/gi;
    let match;
    while ((match = lineTagRegex.exec(lineText)) !== null) {
      const flags = match[1].toLowerCase();
      if (flags.includes('i')) {
        lineItalic = true;
      }
      if (flags.includes('b')) {
        lineBold = true;
      }
      if (flags.includes('u')) {
        lineUnderline = true;
      }
    }
    lineText = lineText.replace(lineTagRegex, '');
    lineText = lineText.replace(/\{[cC]:[^}]*\}/g, '');
    lineText = lineText.replace(/\{[fFsSoOpP]:[^}]*\}/g, '');
    lineText = lineText.replace(/\{[^}]*\}/g, '');

    const slashMatch = lineText.match(/^\/(?!\/)\s*(.*)$/);
    if (slashMatch) {
      lineItalic = true;
      lineText = slashMatch[1];
    }

    lineText = lineText.trim();
    if (!lineText) {
      return '';
    }

    if (lineItalic) {
      lineText = `<i>${lineText}</i>`;
    }
    if (lineBold) {
      lineText = `<b>${lineText}</b>`;
    }
    if (lineUnderline) {
      lineText = `<u>${lineText}</u>`;
    }

    return lineText;
  }).filter(Boolean);

  return formattedLines.join(eol);
}

export function isSrtContent (text) {
  return /^\s*\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/m.test(text);
}

export function parseMicroDvd (text, defaultFps = 23.976, eol = '\r\n') {
  const lines = text.split(/\r?\n/);
  let fps = defaultFps;
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (entries.length === 0) {
      const headerMatch = trimmed.match(/^\{[01]\}\{[01]\}([0-9]+(?:\.[0-9]+)?)$/);
      if (headerMatch) {
        const parsedFps = parseFloat(headerMatch[1]);
        if (parsedFps > 0 && !isNaN(parsedFps)) {
          fps = parsedFps;
          continue;
        }
      }
    }

    const match = trimmed.match(/^\{([0-9]+)\}\{([0-9]+)\}(.*)$/);
    if (!match) {
      continue;
    }

    const startFrame = parseInt(match[1], 10);
    const endFrame = parseInt(match[2], 10);
    const rawContent = match[3];

    const formattedContent = formatSubtitleText(rawContent, eol);
    if (!formattedContent) {
      continue;
    }

    const startMs = Math.round((startFrame / fps) * 1000);
    let endMs = Math.round((endFrame / fps) * 1000);
    if (endMs < startMs) {
      endMs = startMs;
    }

    entries.push({
      startMs,
      endMs,
      text: formattedContent
    });
  }

  return entries;
}

export function parseMpl2 (text, eol = '\r\n') {
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^\[([0-9]+)\]\[([0-9]+)\](.*)$/);
    if (!match) {
      continue;
    }

    const startDecisec = parseInt(match[1], 10);
    const endDecisec = parseInt(match[2], 10);
    const rawContent = match[3];

    const formattedContent = formatSubtitleText(rawContent, eol);
    if (!formattedContent) {
      continue;
    }

    const startMs = startDecisec * 100;
    let endMs = endDecisec * 100;
    if (endMs < startMs) {
      endMs = startMs;
    }

    entries.push({
      startMs,
      endMs,
      text: formattedContent
    });
  }

  return entries;
}

export function parseTmplayer (text, eol = '\r\n') {
  const lines = text.split(/\r?\n/);
  const rawEntries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?[:=](.*)$/);
    if (!match) {
      continue;
    }

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const millis = match[4] ? parseInt(match[4].padEnd(3, '0').slice(0, 3), 10) : 0;
    const rawContent = match[5];

    const formattedContent = formatSubtitleText(rawContent, eol);
    if (!formattedContent) {
      continue;
    }

    const startMs = hours * 3600000 + minutes * 60000 + seconds * 1000 + millis;
    rawEntries.push({
      startMs,
      text: formattedContent
    });
  }

  const entries = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const curr = rawEntries[i];
    const next = rawEntries[i + 1];
    let endMs;
    if (next) {
      endMs = Math.min(next.startMs - 100, curr.startMs + 4000);
      if (endMs <= curr.startMs) {
        endMs = curr.startMs + 1000;
      }
    } else {
      endMs = curr.startMs + 3000;
    }
    entries.push({
      startMs: curr.startMs,
      endMs,
      text: curr.text
    });
  }

  return entries;
}

export function convertToSrt (text, options = {}) {
  const { defaultFps = 23.976, eol = '\r\n' } = options;

  if (isSrtContent(text)) {
    return text.replace(/\r?\n/g, eol);
  }

  let entries = parseMicroDvd(text, defaultFps, eol);

  if (entries.length === 0) {
    entries = parseMpl2(text, eol);
  }

  if (entries.length === 0) {
    entries = parseTmplayer(text, eol);
  }

  if (entries.length === 0) {
    return text;
  }

  const srtBlocks = entries.map((entry, idx) => {
    const index = idx + 1;
    const startStr = formatSrtTimestamp(entry.startMs);
    const endStr = formatSrtTimestamp(entry.endMs);
    return `${index}${eol}${startStr} --> ${endStr}${eol}${entry.text}`;
  });

  return `${srtBlocks.join(`${eol}${eol}`)}${eol}`;
}
