const ApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const EndpointPrefix = `${ApiBaseUrl}/api`;

export const Endpoints = {
  SearchComic: `${EndpointPrefix}/search_comic`,
  GetComic: `${EndpointPrefix}/get_comic`,
  GetChapter: `${EndpointPrefix}/get_chapter`,
  GetSources: `${EndpointPrefix}/get_sources`,
  ProxyImage: `${EndpointPrefix}/proxy_image`,
  CheckPassword: `${EndpointPrefix}/check_password`,
  GetHistory: `${EndpointPrefix}/get_history`,
  UpsertHistory: `${EndpointPrefix}/upsert_history`,
  DeleteHistory: `${EndpointPrefix}/delete_history`,
  GetLibrary: `${EndpointPrefix}/get_library`,
  AddToLibrary: `${EndpointPrefix}/add_to_library`,
  RemoveFromLibrary: `${EndpointPrefix}/remove_from_library`,
  CheckInLibrary: `${EndpointPrefix}/check_in_library`,
  GetComicHistory: `${EndpointPrefix}/get_comic_history`,
} as const;

export interface SourceInfo {
  id: string;
  name: string;
}

export interface ComicBrief {
  source: string;
  id: string;
  name: string;
  cover: string;
  author: string[];
  intro: string;
  pubDate: string;
}

export interface Comic extends ComicBrief {
  chapterGroups: ComicChapterGroup[];
  firstChapterId: string;
}

export interface ComicChapterBrief {
  source: string;
  id: string;
  comicId: string;
  name: string;
}

export interface ComicChapter extends ComicChapterBrief {
  comicName: string;
  nextId: string;
  prevId: string;
  images: string[];
}

export interface ComicChapterGroup {
  name: string;
  chapters: ComicChapterBrief[];
}

export type GetSourcesResp = SourceInfo[];

export type SearchComicReq = {
  keyword: string;
  source?: string;
};

export type SearchComicResp = ComicBrief[];

export type GetComicReq = {
  source: string;
  id: string;
};

export type GetComicResp = Comic;

export type GetChapterReq = {
  source: string;
  comicId: string;
  chapterId: string;
};

export type GetChapterResp = ComicChapter;

export type CheckPasswordReq = {
  password: string;
};

export type CheckPasswordResp = {
  valid: boolean;
};

export type HistoryItem = {
  source: string;
  comicId: string;
  chapterId: string;
  comicName: string;
  chapterName: string;
  page: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GetHistoryResp = HistoryItem[];

export type UpsertHistoryReq = {
  source: string;
  comicId: string;
  chapterId: string;
  comicName: string;
  chapterName: string;
  page: number;
  visible: boolean;
};

export type DeleteHistoryReq = {
  source: string;
  comicId: string;
};

export type AddToLibraryReq = {
  source: string;
  id: string;
  name: string;
  cover: string;
};

export type RemoveFromLibraryReq = {
  source: string;
  id: string;
};

export type LibComic = {
  source: string;
  id: string;
  name: string;
  cover: string;
  createdAt: string;
  updatedAt: string;
};

export type GetLibraryResp = LibComic[];

export type CheckInLibraryReq = {
  source: string;
  id: string;
};

export type CheckInLibraryResp = {
  inLibrary: boolean;
};

export type GetComicHistoryReq = {
  source: string;
  id: string;
};

export type GetComicHistoryResp = {
  history?: HistoryItem;
};
