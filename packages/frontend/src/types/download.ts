import type { Comic } from '@/api/types';

/** 存储在 IndexedDB `comic_records` store 中的漫画记录 */
export interface DownloadComicRecord extends Comic {
  coverBlob?: ArrayBuffer;
  coverType?: string;
  createdAt: number;
  updatedAt: number;
}

/** 供页面直接使用的已下载漫画视图模型 */
export interface DownloadedComic extends Comic {
  coverUrl: string;
  chapterCount: number;
  size: number;
  updatedAt: number;
}

/** 存储在 IndexedDB `chapter_records` store 中的章节记录 */
export interface DownloadChapterRecord {
  source: string;
  comicId: string;
  chapterId: string;
  name: string;
  comicName: string;
  nextId: string;
  prevId: string;
  pageCount: number;
  size: number;
  createdAt: number;
}

/** 存储在 IndexedDB `page_records` store 中的单页图片记录 */
export interface DownloadPageRecord {
  source: string;
  comicId: string;
  chapterId: string;
  page: number;
  type: string;
  data: ArrayBuffer;
}

/** 一次下载任务（一个漫画的一批章节） */
export interface DownloadBatch {
  id: string;
  source: string;
  comicId: string;
  comicName: string;
  total: number;
  completed: number;
  failed: number;
  status: 'running' | 'error';
  currentChapterId?: string;
  currentChapterName?: string;
  currentPage?: number;
  currentPageTotal?: number;
  errorMessage?: string;
}
