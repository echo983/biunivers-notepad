export function parseMarkdown(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const content = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        content.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "code-block",
        language: fence[1].trim(),
        text: content.join("\n"),
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      const content = [quote[1]];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].match(/^\s*>\s?(.*)$/);
        if (!next) break;
        content.push(next[1]);
        index += 1;
      }
      blocks.push({ type: "quote", text: content.join("\n") });
      continue;
    }

    const list = line.match(/^\s*(?:(\d+)\.|([-+*]))\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[1]);
      const items = [list[3]];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].match(
          ordered
            ? /^\s*\d+\.\s+(.+)$/
            : /^\s*[-+*]\s+(.+)$/,
        );
        if (!next) break;
        items.push(next[1]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function safeHref(value) {
  const href = value.trim();
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^(?:[./]|#)/.test(href)) return href;
  return null;
}

export function renderMarkdown(container, source) {
  const fragment = document.createDocumentFragment();
  for (const block of parseMarkdown(source)) {
    let element;
    if (block.type === "heading") {
      element = document.createElement(`h${block.level}`);
      appendInline(element, block.text);
    } else if (block.type === "code-block") {
      element = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      if (block.language) code.dataset.language = block.language;
      element.append(code);
    } else if (block.type === "rule") {
      element = document.createElement("hr");
    } else if (block.type === "quote") {
      element = document.createElement("blockquote");
      appendInline(element, block.text);
    } else if (block.type === "list") {
      element = document.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) {
        const listItem = document.createElement("li");
        appendInline(listItem, item);
        element.append(listItem);
      }
    } else {
      element = document.createElement("p");
      appendInline(element, block.text);
    }
    fragment.append(element);
  }
  container.replaceChildren(fragment);
}

function startsBlock(line) {
  return (
    /^\s*```/.test(line) ||
    /^(?:#{1,6})\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*(?:\d+\.|[-+*])\s+/.test(line) ||
    /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)
  );
}

function appendInline(parent, text) {
  const pattern =
    /(`[^`\n]+`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else if (match[2] !== undefined) {
      const href = safeHref(match[3]);
      if (href) {
        const link = document.createElement("a");
        link.textContent = match[2];
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        parent.append(link);
      } else {
        parent.append(document.createTextNode(match[2]));
      }
    } else {
      const strong = match[4] ?? match[5];
      const emphasis = match[6] ?? match[7];
      const element = document.createElement(strong ? "strong" : "em");
      element.textContent = strong ?? emphasis;
      parent.append(element);
    }
    offset = match.index + token.length;
  }
  if (offset < text.length) {
    parent.append(document.createTextNode(text.slice(offset)));
  }
}
