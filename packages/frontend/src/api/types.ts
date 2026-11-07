const ApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const EndpointPrefix = `${ApiBaseUrl}/api`;

export const Endpoints = {
  SearchComic: `${EndpointPrefix}/search_comic`,
  GetComic: `${EndpointPrefix}/get_comic`,
  GetChapter: `${EndpointPrefix}/get_chapter`,
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

export interface ComicBrief {
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

export type SearchComicReq = {
  keyword: string;
};

export type SearchComicResp = ComicBrief[];

export type GetComicReq = {
  id: string;
};

export type GetComicResp = Comic;

export type GetChapterReq = {
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
  comicId: string;
  chapterId: string;
  comicName: string;
  chapterName: string;
  page: number;
  visible: boolean;
};

export type DeleteHistoryReq = {
  comicId: string;
};

export type AddToLibraryReq = {
  id: string;
  name: string;
  cover: string;
};

export type RemoveFromLibraryReq = {
  id: string;
};

export type LibComic = {
  id: string;
  name: string;
  cover: string;
  createdAt: string;
  updatedAt: string;
};

export type GetLibraryResp = LibComic[];

export type CheckInLibraryReq = {
  id: string;
};

export type CheckInLibraryResp = {
  inLibrary: boolean;
};

export type GetComicHistoryReq = {
  id: string;
};

export type GetComicHistoryResp = {
  history?: HistoryItem;
};
