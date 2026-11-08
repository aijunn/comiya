import { getChapter, proxyImage } from '@/api';
import type { Comic, ComicChapter, ComicChapterBrief } from '@/api/types';
import type { DownloadChapterRecord, DownloadComicRecord, DownloadPageRecord } from '@/types/download';
import { comicKey } from '@/utils';
import { isSameChapterName, isSameComicName } from '@/utils/comicMatch';

const DB_NAME = 'comiya-downloads';
const DB_VERSION = 2;

const COMIC_STORE = 'comic_records';
const CHAPTER_STORE = 'chapter_records';
const PAGE_STORE = 'page_records';

// Stores used before multi-source support. Their rows are migrated to
// `comic_records` / `chapter_records` / `page_records` on the v1 -> v2 upgrade.
const LEGACY_COMIC_STORE = 'comics';
const LEGACY_CHAPTER_STORE = 'chapters';
const LEGACY_PAGE_STORE = 'pages';
const LEGACY_SOURCE_ID = 'manhuagui';

const PAGE_CONCURRENCY = 4;

let databasePromise: Promise<IDBDatabase> | null = null;

function createStores(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(COMIC_STORE)) {
    database.createObjectStore(COMIC_STORE, { keyPath: ['source', 'id'] });
  }

  if (!database.objectStoreNames.contains(CHAPTER_STORE)) {
    const store = database.createObjectStore(CHAPTER_STORE, { keyPath: ['source', 'comicId', 'chapterId'] });
    store.createIndex('byComic', ['source', 'comicId']);
  }

  if (!database.objectStoreNames.contains(PAGE_STORE)) {
    const store = database.createObjectStore(PAGE_STORE, {
      keyPath: ['source', 'comicId', 'chapterId', 'page'],
    });
    store.createIndex('byComic', ['source', 'comicId']);
    store.createIndex('byChapter', ['source', 'comicId', 'chapterId']);
  }
}

/**
 * Copy v1 records into the new source-scoped stores. Cursors keep memory usage
 * bounded even when the user has downloaded a lot of pages; the versionchange
 * transaction aborts atomically if anything fails.
 */
function migrateLegacyStores(database: IDBDatabase, transaction: IDBTransaction) {
  const pairs: [string, string][] = [
    [LEGACY_COMIC_STORE, COMIC_STORE],
    [LEGACY_CHAPTER_STORE, CHAPTER_STORE],
    [LEGACY_PAGE_STORE, PAGE_STORE],
  ].filter(([legacyStore]) => database.objectStoreNames.contains(legacyStore)) as [string, string][];

  if (!pairs.length) {
    return;
  }

  let pending = pairs.length;

  const finish = () => {
    pending -= 1;
    if (pending > 0) {
      return;
    }

    for (const [legacyStore] of pairs) {
      database.deleteObjectStore(legacyStore);
    }
  };

  for (const [legacyStore, targetStore] of pairs) {
    const cursorRequest = transaction.objectStore(legacyStore).openCursor();
    const target = transaction.objectStore(targetStore);

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        finish();
        return;
      }

      target.put({ ...(cursor.value as Record<string, unknown>), source: LEGACY_SOURCE_ID });
      cursor.continue();
    };
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = request.result;
        const transaction = request.transaction;
        if (!transaction) {
          return;
        }

        createStores(database);

        if (event.oldVersion > 0 && event.oldVersion < 2) {
          migrateLegacyStores(database, transaction);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };

      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error('无法打开本地存储'));
      };
    });
  }

  return databasePromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地存储操作失败'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('本地存储操作失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('本地存储操作已取消'));
  });
}

function deleteByIndex(index: IDBIndex, range: IDBKeyRange): void {
  const request = index.openKeyCursor(range);

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      return;
    }
    index.objectStore.delete(cursor.primaryKey);
    cursor.continue();
  };
}

const coverUrlCache = new Map<string, string>();
const chapterUrlCache = new Map<string, string[]>();

function chapterKey(source: string, comicId: string, chapterId: string) {
  return `${comicKey(source, comicId)}::${chapterId}`;
}

export function getComicCoverUrl(record: DownloadComicRecord): string {
  if (!record.coverBlob) {
    return record.cover;
  }

  const key = comicKey(record.source, record.id);
  const cached = coverUrlCache.get(key);
  if (cached) {
    return cached;
  }

  const url = URL.createObjectURL(new Blob([record.coverBlob], { type: record.coverType || 'image/jpeg' }));
  coverUrlCache.set(key, url);
  return url;
}

export function releaseComicObjectUrls(source: string, comicId: string): void {
  const key = comicKey(source, comicId);
  const coverUrl = coverUrlCache.get(key);
  if (coverUrl) {
    URL.revokeObjectURL(coverUrl);
    coverUrlCache.delete(key);
  }

  const prefix = `${key}::`;
  for (const [cachedKey, urls] of chapterUrlCache) {
    if (!cachedKey.startsWith(prefix)) {
      continue;
    }
    urls.forEach((url) => URL.revokeObjectURL(url));
    chapterUrlCache.delete(cachedKey);
  }
}

export function releaseChapterObjectUrls(source: string, comicId: string, chapterId: string): void {
  const key = chapterKey(source, comicId, chapterId);
  const urls = chapterUrlCache.get(key);
  if (!urls) {
    return;
  }
  urls.forEach((url) => URL.revokeObjectURL(url));
  chapterUrlCache.delete(key);
}

export async function listComicRecords(): Promise<DownloadComicRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(COMIC_STORE, 'readonly');
  const records: DownloadComicRecord[] = await requestToPromise(transaction.objectStore(COMIC_STORE).getAll());
  return records;
}

export async function getComicRecord(source: string, comicId: string): Promise<DownloadComicRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(COMIC_STORE, 'readonly');
  const record: DownloadComicRecord | undefined = await requestToPromise(
    transaction.objectStore(COMIC_STORE).get([source, comicId]),
  );
  return record;
}

export async function listChapterRecords(source: string, comicId: string): Promise<DownloadChapterRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(CHAPTER_STORE, 'readonly');
  const index = transaction.objectStore(CHAPTER_STORE).index('byComic');
  const records: DownloadChapterRecord[] = await requestToPromise(index.getAll(IDBKeyRange.only([source, comicId])));
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getChapterRecord(
  source: string,
  comicId: string,
  chapterId: string,
): Promise<DownloadChapterRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(CHAPTER_STORE, 'readonly');
  const record: DownloadChapterRecord | undefined = await requestToPromise(
    transaction.objectStore(CHAPTER_STORE).get([source, comicId, chapterId]),
  );
  return record;
}

async function getPageRecords(source: string, comicId: string, chapterId: string): Promise<DownloadPageRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PAGE_STORE, 'readonly');
  const index = transaction.objectStore(PAGE_STORE).index('byChapter');
  const records: DownloadPageRecord[] = await requestToPromise(
    index.getAll(IDBKeyRange.only([source, comicId, chapterId])),
  );
  return records.sort((a, b) => a.page - b.page);
}

async function getChapterPageKeys(source: string, comicId: string, chapterId: string): Promise<Set<number>> {
  const database = await openDatabase();
  const transaction = database.transaction(PAGE_STORE, 'readonly');
  const index = transaction.objectStore(PAGE_STORE).index('byChapter');
  const pages = new Set<number>();

  await new Promise<void>((resolve, reject) => {
    const request = index.openKeyCursor(IDBKeyRange.only([source, comicId, chapterId]));
    request.onerror = () => reject(request.error ?? new Error('读取下载进度失败'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const [, , , page] = cursor.primaryKey as [string, string, string, number];
      pages.add(page);
      cursor.continue();
    };
  });

  return pages;
}

async function getChapterPageSummary(source: string, comicId: string, chapterId: string): Promise<Map<number, number>> {
  const database = await openDatabase();
  const transaction = database.transaction(PAGE_STORE, 'readonly');
  const index = transaction.objectStore(PAGE_STORE).index('byChapter');
  const sizes = new Map<number, number>();

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only([source, comicId, chapterId]));
    request.onerror = () => reject(request.error ?? new Error('读取页面数据失败'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const page = cursor.value as DownloadPageRecord;
      sizes.set(page.page, page.data.byteLength);
      cursor.continue();
    };
  });

  return sizes;
}

async function putPageRecord(record: DownloadPageRecord): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PAGE_STORE, 'readwrite');
  transaction.objectStore(PAGE_STORE).put(record);
  await transactionToPromise(transaction);
}

export async function countChapterPages(source: string, comicId: string, chapterId: string): Promise<number> {
  const database = await openDatabase();
  const transaction = database.transaction(PAGE_STORE, 'readonly');
  const index = transaction.objectStore(PAGE_STORE).index('byChapter');
  return requestToPromise(index.count(IDBKeyRange.only([source, comicId, chapterId])));
}

export async function listChapterPageCounts(source: string, comicId: string): Promise<Record<string, number>> {
  const database = await openDatabase();
  const transaction = database.transaction(PAGE_STORE, 'readonly');
  const index = transaction.objectStore(PAGE_STORE).index('byComic');
  const counts: Record<string, number> = {};

  await new Promise<void>((resolve, reject) => {
    const request = index.openKeyCursor(IDBKeyRange.only([source, comicId]));
    request.onerror = () => reject(request.error ?? new Error('读取下载进度失败'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const [, , chapterId] = cursor.primaryKey as [string, string, string, number];
      counts[chapterId] = (counts[chapterId] ?? 0) + 1;
      cursor.continue();
    };
  });

  return counts;
}

interface FetchedImage {
  data: ArrayBuffer;
  type: string;
}

async function fetchImage(url: string): Promise<FetchedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片下载失败 (${response.status})`);
  }

  return {
    data: await response.arrayBuffer(),
    type: response.headers.get('content-type') ?? 'image/jpeg',
  };
}

async function fetchCover(source: string, url: string): Promise<FetchedImage | null> {
  try {
    return await fetchImage(proxyImage(source, url));
  } catch {
    return null;
  }
}

/**
 * 转成纯对象再写入 IndexedDB，避免把 Vue 的响应式代理（无法被结构化克隆）存进去。
 */
function snapshotComic(comic: Comic): Comic {
  return {
    source: comic.source,
    id: comic.id,
    name: comic.name,
    cover: comic.cover,
    author: [...comic.author],
    intro: comic.intro,
    pubDate: comic.pubDate,
    firstChapterId: comic.firstChapterId,
    chapterGroups: comic.chapterGroups.map((group) => ({
      name: group.name,
      chapters: group.chapters.map((chapter) => ({
        source: chapter.source,
        id: chapter.id,
        comicId: chapter.comicId,
        name: chapter.name,
      })),
    })),
  };
}

/**
 * 下载单个章节：页面逐页写入 IndexedDB，失败或中断后再次调用会跳过已下载页面，
 * 从第一个缺失页继续下载。全部页面就绪后才写入章节记录，因此未完成的章节不会被当成已下载。
 */
export async function downloadChapter(
  comic: Comic,
  chapter: ComicChapterBrief,
  onPageProgress?: (done: number, total: number) => void,
): Promise<DownloadChapterRecord> {
  const chapterData = await getChapter({
    source: comic.source,
    comicId: comic.id,
    chapterId: chapter.id,
  });
  const total = chapterData.images.length;

  if (total === 0) {
    throw new Error('该章节没有可下载的图片');
  }

  const existingPages = await getChapterPageKeys(comic.source, comic.id, chapter.id);
  let done = 0;
  for (let page = 0; page < total; page += 1) {
    if (existingPages.has(page)) {
      done += 1;
    }
  }
  onPageProgress?.(done, total);

  const missingPages: number[] = [];
  for (let page = 0; page < total; page += 1) {
    if (!existingPages.has(page)) {
      missingPages.push(page);
    }
  }

  let comicRecordPromise: Promise<void> | undefined;

  function ensureComicRecord() {
    if (!comicRecordPromise) {
      comicRecordPromise = (async () => {
        const database = await openDatabase();
        const transaction = database.transaction(COMIC_STORE, 'readwrite');
        const store = transaction.objectStore(COMIC_STORE);
        const request = store.get([comic.source, comic.id]);
        const now = Date.now();

        request.onsuccess = () => {
          if (!request.result) {
            store.put({
              ...snapshotComic(comic),
              createdAt: now,
              updatedAt: now,
            });
          }
        };

        await transactionToPromise(transaction);
      })();
    }

    return comicRecordPromise;
  }

  if (missingPages.length > 0) {
    const urls = chapterData.images.map((image) => proxyImage(comic.source, image));
    let next = 0;

    async function worker() {
      while (next < missingPages.length) {
        const page = missingPages[next];
        next += 1;

        const image = await fetchImage(urls[page]);
        await putPageRecord({
          source: comic.source,
          comicId: comic.id,
          chapterId: chapter.id,
          page,
          type: image.type,
          data: image.data,
        });
        await ensureComicRecord();

        done += 1;
        onPageProgress?.(done, total);
      }
    }

    const results = await Promise.allSettled(
      Array.from({ length: Math.min(PAGE_CONCURRENCY, missingPages.length) }, () => worker()),
    );
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (rejected) {
      throw rejected.reason;
    }
  }

  const pageSizes = await getChapterPageSummary(comic.source, comic.id, chapter.id);
  for (let page = 0; page < total; page += 1) {
    if (!pageSizes.has(page)) {
      throw new Error('页面下载不完整，请重试');
    }
  }

  const size = [...pageSizes.entries()].reduce((sum, [page, byteLength]) => (page < total ? sum + byteLength : sum), 0);

  const comicSnapshot = snapshotComic(comic);
  const now = Date.now();
  const existingComic = await getComicRecord(comic.source, comic.id);
  let comicRecord: DownloadComicRecord;

  if (existingComic) {
    comicRecord = { ...existingComic, ...comicSnapshot, updatedAt: now };
    if (!comicRecord.coverBlob) {
      const cover = await fetchCover(comic.source, comicSnapshot.cover);
      if (cover) {
        comicRecord.coverBlob = cover.data;
        comicRecord.coverType = cover.type;
      }
    }
  } else {
    const cover = await fetchCover(comic.source, comicSnapshot.cover);
    comicRecord = {
      ...comicSnapshot,
      coverBlob: cover?.data,
      coverType: cover?.type,
      createdAt: now,
      updatedAt: now,
    };
  }

  const chapterRecord: DownloadChapterRecord = {
    source: comic.source,
    comicId: comic.id,
    chapterId: chapter.id,
    name: chapterData.name || chapter.name,
    comicName: chapterData.comicName,
    nextId: chapterData.nextId,
    prevId: chapterData.prevId,
    pageCount: total,
    size,
    createdAt: now,
  };

  const database = await openDatabase();
  const transaction = database.transaction([COMIC_STORE, CHAPTER_STORE, PAGE_STORE], 'readwrite');
  const comicStore = transaction.objectStore(COMIC_STORE);
  const chapterStore = transaction.objectStore(CHAPTER_STORE);
  const pageStore = transaction.objectStore(PAGE_STORE);

  for (const page of pageSizes.keys()) {
    if (page >= total) {
      pageStore.delete([comic.source, comic.id, chapter.id, page]);
    }
  }

  comicStore.put(comicRecord);
  chapterStore.put(chapterRecord);

  await transactionToPromise(transaction);

  return chapterRecord;
}

/** 读取本地已下载章节；未下载或数据不完整时返回 null */
export async function readDownloadedChapter(
  source: string,
  comicId: string,
  chapterId: string,
): Promise<ComicChapter | null> {
  const record = await getChapterRecord(source, comicId, chapterId);
  if (!record) {
    return null;
  }

  const key = chapterKey(source, comicId, chapterId);
  let urls = chapterUrlCache.get(key);

  if (!urls) {
    const pages = await getPageRecords(source, comicId, chapterId);
    if (pages.length < record.pageCount) {
      return null;
    }

    urls = pages
      .slice(0, record.pageCount)
      .map((page) => URL.createObjectURL(new Blob([page.data], { type: page.type })));
    chapterUrlCache.set(key, urls);
  }

  return {
    source: record.source,
    id: record.chapterId,
    comicId: record.comicId,
    name: record.name,
    comicName: record.comicName,
    nextId: record.nextId,
    prevId: record.prevId,
    images: urls,
  };
}

/**
 * 在其他来源的已下载记录里查找同一本漫画的同一章节。
 * 图片字节与来源无关，因此换源后仍然可以复用本地缓存。
 */
export async function findEquivalentDownloadedChapter(
  comicName: string,
  chapterName: string,
): Promise<ComicChapter | null> {
  const comics = await listComicRecords();
  const candidates = comics.filter((record) => isSameComicName(record.name, comicName));

  for (const comic of candidates) {
    const chapters = await listChapterRecords(comic.source, comic.id);
    const match = chapters.find((chapter) => isSameChapterName(chapter.name, chapterName));
    if (!match) {
      continue;
    }

    const local = await readDownloadedChapter(comic.source, comic.id, match.chapterId);
    if (local) {
      return local;
    }
  }

  return null;
}

/**
 * 阅读器使用的章节数据：优先当前源的本地下载；当前源未下载时先取远端元数据，
 * 再尝试复用其他源中同漫画、同章节的本地图片缓存。
 * 返回的 images 已经是可直接用于 <img> 的地址（代理地址或 object URL）。
 */
export async function getChapterForReader(source: string, comicId: string, chapterId: string): Promise<ComicChapter> {
  try {
    const local = await readDownloadedChapter(source, comicId, chapterId);
    if (local) {
      return local;
    }
  } catch (error) {
    console.error('[download] 读取本地章节失败', error);
  }

  const remote = await getChapter({ source, comicId, chapterId });

  try {
    const cached = await findEquivalentDownloadedChapter(remote.comicName, remote.name);
    if (cached) {
      return { ...remote, images: cached.images };
    }
  } catch (error) {
    console.error('[download] 读取跨源本地章节失败', error);
  }

  return { ...remote, images: remote.images.map((image) => proxyImage(source, image)) };
}

export async function deleteComicRecord(source: string, comicId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([COMIC_STORE, CHAPTER_STORE, PAGE_STORE], 'readwrite');

  deleteByIndex(transaction.objectStore(PAGE_STORE).index('byComic'), IDBKeyRange.only([source, comicId]));
  deleteByIndex(transaction.objectStore(CHAPTER_STORE).index('byComic'), IDBKeyRange.only([source, comicId]));
  transaction.objectStore(COMIC_STORE).delete([source, comicId]);

  await transactionToPromise(transaction);
  releaseComicObjectUrls(source, comicId);
}

export async function deleteChapterRecord(source: string, comicId: string, chapterId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([CHAPTER_STORE, PAGE_STORE], 'readwrite');

  deleteByIndex(transaction.objectStore(PAGE_STORE).index('byChapter'), IDBKeyRange.only([source, comicId, chapterId]));
  transaction.objectStore(CHAPTER_STORE).delete([source, comicId, chapterId]);

  await transactionToPromise(transaction);
  releaseChapterObjectUrls(source, comicId, chapterId);
}

/** 申请持久化存储，尽量避免浏览器在空间紧张时清理下载数据 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) {
      return false;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
