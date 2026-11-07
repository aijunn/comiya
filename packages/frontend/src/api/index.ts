import { get, post } from './fetch';
import type {
  AddToLibraryReq,
  CheckInLibraryReq,
  CheckInLibraryResp,
  CheckPasswordReq,
  CheckPasswordResp,
  DeleteHistoryReq,
  GetChapterReq,
  GetChapterResp,
  GetComicHistoryReq,
  GetComicHistoryResp,
  GetComicReq,
  GetComicResp,
  GetHistoryResp,
  GetLibraryResp,
  GetSourcesResp,
  RemoveFromLibraryReq,
  SearchComicReq,
  SearchComicResp,
  UpsertHistoryReq,
} from './types';
import { Endpoints } from './types';

export function searchComic(params: SearchComicReq): Promise<SearchComicResp> {
  return get(Endpoints.SearchComic, params);
}

export function getComic(params: GetComicReq): Promise<GetComicResp> {
  return get(Endpoints.GetComic, params);
}

export function getChapter(params: GetChapterReq): Promise<GetChapterResp> {
  return get(Endpoints.GetChapter, params);
}

export function getSources(): Promise<GetSourcesResp> {
  return get(Endpoints.GetSources);
}

export function proxyImage(source: string, url: string) {
  return `${Endpoints.ProxyImage}?source=${encodeURIComponent(source)}&url=${encodeURIComponent(url)}`;
}

export function checkPassword(data: CheckPasswordReq): Promise<CheckPasswordResp> {
  return post(Endpoints.CheckPassword, data);
}

export function getHistory(): Promise<GetHistoryResp> {
  return get(Endpoints.GetHistory);
}

export function upsertHistory(data: UpsertHistoryReq): Promise<void> {
  return post(Endpoints.UpsertHistory, data);
}

export function deleteHistory(data: DeleteHistoryReq): Promise<void> {
  return post(Endpoints.DeleteHistory, data);
}

export function getLibrary(): Promise<GetLibraryResp> {
  return get(Endpoints.GetLibrary);
}

export function addToLibrary(data: AddToLibraryReq): Promise<void> {
  return post(Endpoints.AddToLibrary, data);
}

export function removeFromLibrary(data: RemoveFromLibraryReq): Promise<void> {
  return post(Endpoints.RemoveFromLibrary, data);
}

export function checkInLibrary(params: CheckInLibraryReq): Promise<CheckInLibraryResp> {
  return get(Endpoints.CheckInLibrary, params);
}

export function getComicHistory(params: GetComicHistoryReq): Promise<GetComicHistoryResp> {
  return get(Endpoints.GetComicHistory, params);
}
