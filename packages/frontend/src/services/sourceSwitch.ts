import {
  addToLibrary,
  checkInLibrary,
  deleteHistory,
  getComic,
  removeFromLibrary,
  searchComic,
  upsertHistory,
} from '@/api';
import type { Comic, ComicBrief, ComicChapter, ComicChapterBrief, HistoryItem } from '@/api/types';
import { getChapterForReader } from '@/services/download';
import { chapterNumber, normalizeComicName } from '@/utils/comicMatch';

export { chapterNumber, normalizeComicName } from '@/utils/comicMatch';

export interface ComicIdentity {
  name: string;
  author?: string[];
}

export interface SwitchComicOptions {
  comic: Comic;
  targetSource: string;
  history?: HistoryItem;
  inLibrary: boolean;
}

export interface SwitchComicResult {
  comic: Comic;
  history?: {
    chapterId: string;
    page: number;
  };
}

export interface SwitchReaderOptions {
  source: string;
  comicId: string;
  chapterId: string;
  chapterName: string;
  comicName: string;
  page: number;
  totalPages: number;
  targetSource: string;
}

export interface SwitchReaderResult {
  comic: Comic;
  chapter: ComicChapterBrief;
  chapterData: ComicChapter;
  page: number;
}

export function flattenChapters(comic: Comic): ComicChapterBrief[] {
  return comic.chapterGroups.flatMap((group) => group.chapters);
}

function findChapterIndex(comic: Comic, chapterId: string): number {
  return flattenChapters(comic).findIndex((chapter) => chapter.id === chapterId);
}

/**
 * 在目标漫画中查找对应章节：
 * 1. 归一化章节名完全一致；
 * 2. 话数一致；
 * 3. 回退到当前源中的章节序号。
 */
export function findChapterInComic(comic: Comic, chapterName: string, index?: number): ComicChapterBrief | undefined {
  const chapters = flattenChapters(comic);
  if (!chapters.length) {
    return undefined;
  }

  const normalized = normalizeComicName(chapterName);
  if (normalized) {
    const exact = chapters.find((chapter) => normalizeComicName(chapter.name) === normalized);
    if (exact) {
      return exact;
    }
  }

  const number = chapterNumber(chapterName);
  if (number) {
    const byNumber = chapters.find((chapter) => chapterNumber(chapter.name) === number);
    if (byNumber) {
      return byNumber;
    }
  }

  if (index !== undefined && index >= 0 && index < chapters.length) {
    return chapters[index];
  }

  return undefined;
}

/**
 * 从搜索结果中选择最可能的同一本漫画。只有标题存在包含关系时才接受，
 * 作者重合会提高优先级，避免把同名但无关的作品切过去。
 */
export function pickBestComicCandidate(comic: ComicIdentity, candidates: ComicBrief[]): ComicBrief | undefined {
  const title = normalizeComicName(comic.name);
  if (!title) {
    return undefined;
  }

  const authors = new Set((comic.author ?? []).map(normalizeComicName).filter(Boolean));
  let best: { candidate: ComicBrief; score: number } | undefined;

  for (const candidate of candidates) {
    const candidateTitle = normalizeComicName(candidate.name);
    if (!candidateTitle) {
      continue;
    }

    let score = 0;

    if (candidateTitle === title) {
      score = 100;
    } else if (candidateTitle.includes(title) || title.includes(candidateTitle)) {
      score = 60;
    } else {
      continue;
    }

    const authorMatches = candidate.author.filter((author) => authors.has(normalizeComicName(author))).length;
    score += authorMatches * 15;

    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  return best?.candidate;
}

function comicSearchKeywords(comicName: string): string[] {
  return Array.from(new Set([comicName.trim(), normalizeComicName(comicName)].filter(Boolean)));
}

export async function findComicInSource(comic: ComicIdentity, targetSource: string): Promise<Comic> {
  let foundCandidates = false;

  for (const keyword of comicSearchKeywords(comic.name)) {
    const candidates = await searchComic({ keyword, source: targetSource });
    if (!candidates.length) {
      continue;
    }

    foundCandidates = true;
    const best = pickBestComicCandidate(comic, candidates);
    if (best) {
      return getComic({ source: targetSource, id: best.id });
    }
  }

  if (foundCandidates) {
    throw new Error(`目标源中没有找到匹配的《${comic.name}》`);
  }
  throw new Error(`目标源中没有找到《${comic.name}》`);
}

async function isComicInLibrary(source: string, comicId: string): Promise<boolean> {
  try {
    return (await checkInLibrary({ source, id: comicId })).inLibrary;
  } catch (error) {
    console.error('[sourceSwitch] 查询书架失败', error);
    return false;
  }
}

async function moveLibraryEntry(oldComic: { source: string; id: string }, targetComic: Comic): Promise<void> {
  await addToLibrary({
    source: targetComic.source,
    id: targetComic.id,
    name: targetComic.name,
    cover: targetComic.cover,
  });

  try {
    await removeFromLibrary({ source: oldComic.source, id: oldComic.id });
  } catch (error) {
    console.error('[sourceSwitch] 移除旧书架记录失败', error);
  }
}

async function migrateHistory(
  oldComic: { source: string; id: string },
  targetComic: Comic,
  targetChapter: ComicChapterBrief,
  page: number,
): Promise<void> {
  try {
    await upsertHistory({
      source: targetComic.source,
      comicId: targetComic.id,
      chapterId: targetChapter.id,
      page,
      comicName: targetComic.name,
      chapterName: targetChapter.name,
      visible: true,
    });
    await deleteHistory({ source: oldComic.source, comicId: oldComic.id });
  } catch (error) {
    console.error('[sourceSwitch] 迁移阅读历史失败', error);
  }
}

/**
 * 详情页换源：找到目标源的漫画，迁移书架和阅读历史，返回目标漫画。
 */
export async function switchComicSource(options: SwitchComicOptions): Promise<SwitchComicResult> {
  const targetComic = await findComicInSource(options.comic, options.targetSource);
  const inLibrary = options.inLibrary || (await isComicInLibrary(options.comic.source, options.comic.id));

  if (inLibrary) {
    await moveLibraryEntry(options.comic, targetComic);
  }

  let targetHistory: SwitchComicResult['history'];

  if (options.history) {
    const chapters = flattenChapters(options.comic);
    const currentIndex = chapters.findIndex((chapter) => chapter.id === options.history?.chapterId);
    const currentChapter = chapters[currentIndex];

    if (currentChapter) {
      const targetChapter = findChapterInComic(
        targetComic,
        currentChapter.name,
        currentIndex >= 0 ? currentIndex : undefined,
      );

      if (targetChapter) {
        targetHistory = {
          chapterId: targetChapter.id,
          page: options.history.page,
        };
        await migrateHistory(options.comic, targetComic, targetChapter, options.history.page);
      }
    }
  }

  return { comic: targetComic, history: targetHistory };
}

/**
 * 阅读器换源：找到目标源的同一漫画和同一章节，并按当前阅读百分比换算页码。
 */
export async function switchReaderSource(options: SwitchReaderOptions): Promise<SwitchReaderResult> {
  let currentComic: Comic | undefined;
  try {
    currentComic = await getComic({ source: options.source, id: options.comicId });
  } catch (error) {
    console.error('[sourceSwitch] 读取当前漫画信息失败', error);
  }

  const targetComic = await findComicInSource(
    { name: options.comicName, author: currentComic?.author },
    options.targetSource,
  );

  const currentIndex = currentComic ? findChapterIndex(currentComic, options.chapterId) : -1;
  const targetChapter = findChapterInComic(
    targetComic,
    options.chapterName,
    currentIndex >= 0 ? currentIndex : undefined,
  );

  if (!targetChapter) {
    throw new Error(`目标源中没有找到对应章节「${options.chapterName}」`);
  }

  const targetChapterData = await getChapterForReader(targetComic.source, targetComic.id, targetChapter.id);

  const targetPageCount = targetChapterData.images.length;
  const targetPage =
    targetPageCount > 0 && options.totalPages > 0
      ? Math.max(1, Math.min(targetPageCount, Math.round((options.page / options.totalPages) * targetPageCount)))
      : 1;

  if (await isComicInLibrary(options.source, options.comicId)) {
    await moveLibraryEntry({ source: options.source, id: options.comicId }, targetComic);
  }

  await migrateHistory({ source: options.source, id: options.comicId }, targetComic, targetChapter, targetPage);

  return {
    comic: targetComic,
    chapter: targetChapter,
    chapterData: targetChapterData,
    page: targetPage,
  };
}
