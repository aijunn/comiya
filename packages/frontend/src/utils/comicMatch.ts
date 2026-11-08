/** 标题归一化：忽略大小写、空白、标点和符号，便于比较不同源的标题。 */
export function normalizeComicName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

function normalizeChapterNumber(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : value;
}

/** 从章节名里提取话数，例如「第12话」和「Vol.1 第12话」都得到 "12"。 */
export function chapterNumber(name: string): string | undefined {
  const explicit = name.match(/(?:第|#)?\s*(\d+(?:\.\d+)?)\s*(?:话|回|章|集|篇)/);
  if (explicit) {
    return normalizeChapterNumber(explicit[1]);
  }

  const fallback = name.match(/(\d+(?:\.\d+)?)/);
  return fallback ? normalizeChapterNumber(fallback[1]) : undefined;
}

export function isSameComicName(left: string, right: string): boolean {
  const normalizedLeft = normalizeComicName(left);
  const normalizedRight = normalizeComicName(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

/** 跨源匹配章节：先比归一化名称，再退化为话数比较。 */
export function isSameChapterName(left: string, right: string): boolean {
  const normalizedLeft = normalizeComicName(left);
  const normalizedRight = normalizeComicName(right);
  if (normalizedLeft && normalizedRight && normalizedLeft === normalizedRight) {
    return true;
  }

  const leftNumber = chapterNumber(left);
  const rightNumber = chapterNumber(right);
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber);
}
