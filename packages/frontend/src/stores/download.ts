import { defineStore } from 'pinia';
import { reactive } from 'vue';
import type { Comic, ComicChapterBrief } from '@/api/types';
import {
  countChapterPages,
  deleteComicRecord,
  downloadChapter,
  getComicCoverUrl,
  getComicRecord,
  listChapterPageCounts,
  listChapterRecords,
  listComicRecords,
  requestPersistentStorage,
} from '@/services/download';
import {
  type DownloadBatch,
  type DownloadChapterRecord,
  type DownloadComicRecord,
  type DownloadedComic,
} from '@/types/download';
import { handleError } from '@/utils/error';

const MAX_CHAPTER_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDownloadedComic(record: DownloadComicRecord, chapters: DownloadChapterRecord[]): DownloadedComic {
  return {
    id: record.id,
    name: record.name,
    cover: record.cover,
    author: record.author,
    intro: record.intro,
    pubDate: record.pubDate,
    firstChapterId: record.firstChapterId,
    chapterGroups: record.chapterGroups,
    coverUrl: getComicCoverUrl(record),
    chapterCount: chapters.length,
    size: chapters.reduce((sum, chapter) => sum + chapter.size, 0),
    updatedAt: record.updatedAt,
  };
}

function toPartialChapterIds(chapters: DownloadChapterRecord[], pageCounts: Record<string, number>): string[] {
  const downloaded = new Set(chapters.map((chapter) => chapter.chapterId));
  return Object.entries(pageCounts)
    .filter(([chapterId, count]) => count > 0 && !downloaded.has(chapterId))
    .map(([chapterId]) => chapterId);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '下载失败';
}

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

export const useDownloadStore = defineStore('download', {
  state: () => ({
    comics: [] as DownloadedComic[],
    chaptersByComic: {} as Record<string, DownloadChapterRecord[]>,
    partialChaptersByComic: {} as Record<string, string[]>,
    loadedComics: false,
    loadedChapters: {} as Record<string, boolean>,
    batches: [] as DownloadBatch[],
  }),

  getters: {
    runningBatches: (state) => state.batches.filter((batch) => batch.status === 'running'),
    errorBatches: (state) => state.batches.filter((batch) => batch.status === 'error'),
    comicById: (state) => (comicId: string) => state.comics.find((comic) => comic.id === comicId),
    isChapterDownloaded: (state) => (comicId: string, chapterId: string) =>
      (state.chaptersByComic[comicId] ?? []).some((chapter) => chapter.chapterId === chapterId),
    hasRunningBatch: (state) => (comicId: string) =>
      state.batches.some((batch) => batch.comicId === comicId && batch.status === 'running'),
  },

  actions: {
    async loadComics() {
      try {
        const records = await listComicRecords();
        this.comics = records.map((record) => toDownloadedComic(record, this.chaptersByComic[record.id] ?? []));
        this.loadedComics = true;
      } catch (error) {
        handleError(error);
      }
    },

    async loadChapters(comicId: string) {
      try {
        const [chapters, pageCounts] = await Promise.all([listChapterRecords(comicId), listChapterPageCounts(comicId)]);
        this.chaptersByComic[comicId] = chapters;
        this.partialChaptersByComic[comicId] = toPartialChapterIds(chapters, pageCounts);
        this.loadedChapters[comicId] = true;

        const index = this.comics.findIndex((comic) => comic.id === comicId);
        if (index === -1) {
          return;
        }

        const record = await getComicRecord(comicId);
        if (record) {
          this.comics[index] = toDownloadedComic(record, chapters);
        }
      } catch (error) {
        handleError(error);
      }
    },

    async loadAll() {
      try {
        const records = await listComicRecords();
        const entries = await Promise.all(
          records.map(async (record) => ({
            record,
            chapters: await listChapterRecords(record.id),
            pageCounts: await listChapterPageCounts(record.id),
          })),
        );

        this.comics = entries.map(({ record, chapters }) => toDownloadedComic(record, chapters));
        this.chaptersByComic = Object.fromEntries(entries.map(({ record, chapters }) => [record.id, chapters]));
        this.partialChaptersByComic = Object.fromEntries(
          entries.map(({ record, chapters, pageCounts }) => [record.id, toPartialChapterIds(chapters, pageCounts)]),
        );
        this.loadedChapters = Object.fromEntries(entries.map(({ record }) => [record.id, true]));
        this.loadedComics = true;
      } catch (error) {
        handleError(error);
      }
    },

    async refreshComic(comicId: string) {
      try {
        const record = await getComicRecord(comicId);
        if (!record) {
          return;
        }

        const view = toDownloadedComic(record, this.chaptersByComic[comicId] ?? []);
        const index = this.comics.findIndex((comic) => comic.id === comicId);
        if (index === -1) {
          this.comics.push(view);
        } else {
          this.comics[index] = view;
        }
      } catch (error) {
        handleError(error);
      }
    },

    async startDownload(comic: Comic, chapters: ComicChapterBrief[]) {
      if (!chapters.length || this.hasRunningBatch(comic.id)) {
        return;
      }

      this.batches = this.batches.filter((batch) => !(batch.comicId === comic.id && batch.status === 'error'));

      const batch = reactive<DownloadBatch>({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        comicId: comic.id,
        comicName: comic.name,
        total: chapters.length,
        completed: 0,
        failed: 0,
        status: 'running',
      });
      this.batches.push(batch);

      void requestPersistentStorage();

      try {
        for (const chapter of chapters) {
          if (this.isChapterDownloaded(comic.id, chapter.id)) {
            batch.completed += 1;
            continue;
          }

          batch.currentChapterId = chapter.id;
          batch.currentChapterName = chapter.name;
          batch.currentPage = 0;
          batch.currentPageTotal = 0;

          try {
            let record: DownloadChapterRecord | undefined;
            let lastError: unknown;

            for (let attempt = 1; attempt <= MAX_CHAPTER_ATTEMPTS; attempt += 1) {
              try {
                record = await downloadChapter(comic, chapter, (done, total) => {
                  batch.currentPage = done;
                  batch.currentPageTotal = total;
                });
                break;
              } catch (error) {
                lastError = error;

                if (isQuotaExceededError(error)) {
                  throw error;
                }

                if (attempt < MAX_CHAPTER_ATTEMPTS) {
                  await sleep(attempt * 500);
                }
              }
            }

            if (!record) {
              throw lastError ?? new Error('下载失败');
            }

            this.chaptersByComic[comic.id] = [
              ...(this.chaptersByComic[comic.id] ?? []).filter((item) => item.chapterId !== record.chapterId),
              record,
            ];
            this.loadedChapters[comic.id] = true;
            this.partialChaptersByComic[comic.id] = (this.partialChaptersByComic[comic.id] ?? []).filter(
              (chapterId) => chapterId !== chapter.id,
            );
            await this.refreshComic(comic.id);
            batch.completed += 1;
          } catch (error) {
            batch.failed += 1;
            batch.errorMessage = toErrorMessage(error);

            if (isQuotaExceededError(error)) {
              batch.errorMessage = '存储空间不足，已停止下载';
              throw error;
            }

            try {
              const pageCount = await countChapterPages(comic.id, chapter.id);
              if (pageCount > 0) {
                const partial = new Set(this.partialChaptersByComic[comic.id] ?? []);
                partial.add(chapter.id);
                this.partialChaptersByComic[comic.id] = [...partial];
              }
            } catch (partialError) {
              handleError(partialError);
            }
          }

          batch.currentChapterId = undefined;
          batch.currentChapterName = undefined;
          batch.currentPage = undefined;
          batch.currentPageTotal = undefined;
        }

        if (batch.failed === 0) {
          this.batches = this.batches.filter((item) => item.id !== batch.id);
        } else {
          batch.status = 'error';
        }
      } catch (error) {
        if (!batch.errorMessage) {
          batch.errorMessage = toErrorMessage(error);
        }
        batch.failed = Math.max(batch.failed, 1);
        batch.status = 'error';
      } finally {
        batch.currentChapterId = undefined;
        batch.currentChapterName = undefined;
        batch.currentPage = undefined;
        batch.currentPageTotal = undefined;
      }
    },

    async removeComic(comicId: string) {
      if (this.hasRunningBatch(comicId)) {
        return;
      }

      try {
        await deleteComicRecord(comicId);
        this.comics = this.comics.filter((comic) => comic.id !== comicId);
        delete this.chaptersByComic[comicId];
        delete this.partialChaptersByComic[comicId];
        delete this.loadedChapters[comicId];
        this.batches = this.batches.filter((batch) => batch.comicId !== comicId);
      } catch (error) {
        handleError(error);
      }
    },

    dismissBatch(batchId: string) {
      this.batches = this.batches.filter((batch) => batch.id !== batchId);
    },
  },
});
