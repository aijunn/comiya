<script setup lang="ts">
import { addToLibrary, checkInLibrary, getChapter, getComic, getComicHistory, removeFromLibrary } from '@/api';
import type { ComicChapterGroup } from '@/api/types';
import SourceSheet from '@/components/SourceSheet.vue';
import { Button } from '@/components/ui/button';
import { useSources } from '@/composables/useSources';
import { useActivated } from '@/hooks/activated';
import { switchComicSource } from '@/services/sourceSwitch';
import { useDownloadStore } from '@/stores/download';
import { comicKey } from '@/utils';
import { getErrorMessage, handleError } from '@/utils/error';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowDown01,
  ArrowDown10,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  CircleArrowDown,
  CircleCheck,
  Download,
  LoaderCircle,
  Star,
} from 'lucide-vue-next';
import { computed, onActivated, onDeactivated, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

const route = useRoute('/comic/[source]/[comicId]/');
const router = useRouter();
const queryClient = useQueryClient();
const downloadStore = useDownloadStore();

const source = computed(() => route.params.source);
const comicId = computed(() => route.params.comicId);
const key = computed(() => comicKey(source.value, comicId.value));

const { sources, sourceName } = useSources();
const sourceSheetShow = ref(false);
const switchingSource = ref('');
const switchError = ref('');

const activated = useActivated();

const { data: comic } = useQuery({
  queryKey: [getComic.name, source, comicId],
  queryFn: () => getComic({ source: source.value, id: comicId.value }),
  refetchOnWindowFocus: false,
  staleTime: 5 * 60 * 1000,
  enabled: () => Boolean(activated.value && comicId.value),
});

const chapterGroups = ref<(ComicChapterGroup & { reverse: boolean })[]>([]);

const { data: checkData, refetch: check } = useQuery({
  queryKey: [checkInLibrary.name, source, comicId],
  queryFn: () => checkInLibrary({ source: source.value, id: comicId.value }),
  enabled: () => Boolean(activated.value && comicId.value),
});
onActivated(check);
onActivated(() => {
  sourceSheetShow.value = false;
  switchError.value = '';
});
onDeactivated(() => {
  sourceSheetShow.value = false;
  switchError.value = '';
});

const inLibrary = computed(() => checkData.value?.inLibrary ?? false);

const { data: historyData, refetch: refetchHistory } = useQuery({
  queryKey: [getComicHistory.name, source, comicId],
  queryFn: () => getComicHistory({ source: source.value, id: comicId.value }),
  enabled: () => Boolean(activated.value && comicId.value),
});
onActivated(refetchHistory);

const history = computed(() => historyData.value?.history);
const currentChapterId = computed(() => history.value?.chapterId ?? '');

const localComic = computed(() => downloadStore.comicById(source.value, comicId.value));
const displayComic = computed(() => comic.value ?? localComic.value);
const comicCover = computed(() => localComic.value?.coverUrl || displayComic.value?.cover || '');

const selecting = ref(false);
const selectedChapterIds = ref<string[]>([]);

const allChapters = computed(() => chapterGroups.value.flatMap((group) => group.chapters));
const selectedCount = computed(() => selectedChapterIds.value.length);

const downloadedChapterIds = computed(
  () => new Set((downloadStore.chaptersByComic[key.value] ?? []).map((chapter) => chapter.chapterId)),
);
const partialChapterIds = computed(() => new Set(downloadStore.partialChaptersByComic[key.value] ?? []));
const selectableChapterIds = computed(() =>
  allChapters.value.filter((chapter) => !downloadedChapterIds.value.has(chapter.id)).map((chapter) => chapter.id),
);
// 后端返回的章节按旧→新排列，详情页默认倒序展示；这里按默认展示顺序（新→旧）计算。
const latestFirstChapterIds = computed(() =>
  chapterGroups.value.flatMap((group) => group.chapters.map((chapter) => chapter.id).reverse()),
);
const selectableCurrentToLatestIds = computed(() => {
  const index = latestFirstChapterIds.value.indexOf(currentChapterId.value);
  if (index === -1) {
    return [];
  }
  return latestFirstChapterIds.value.slice(0, index + 1).filter((id) => !downloadedChapterIds.value.has(id));
});
const allSelected = computed(
  () =>
    selectableChapterIds.value.length > 0 &&
    selectableChapterIds.value.every((id) => selectedChapterIds.value.includes(id)),
);

const runningBatch = computed(() =>
  downloadStore.batches.find(
    (batch) => batch.source === source.value && batch.comicId === comicId.value && batch.status === 'running',
  ),
);
const errorBatch = computed(() =>
  downloadStore.batches.find(
    (batch) => batch.source === source.value && batch.comicId === comicId.value && batch.status === 'error',
  ),
);
const runningPercent = computed(() => {
  const batch = runningBatch.value;
  if (!batch || !batch.total) {
    return 0;
  }
  return Math.round((batch.completed / batch.total) * 100);
});

function isDownloaded(chapterId: string) {
  return downloadedChapterIds.value.has(chapterId);
}

function isPartial(chapterId: string) {
  return partialChapterIds.value.has(chapterId);
}

function isCurrentChapter(chapterId: string) {
  return currentChapterId.value === chapterId;
}

function isSelected(chapterId: string) {
  return selectedChapterIds.value.includes(chapterId);
}

function isDownloading(chapterId: string) {
  return runningBatch.value?.currentChapterId === chapterId;
}

function enterSelectMode() {
  if (!displayComic.value) {
    return;
  }
  selectedChapterIds.value = [];
  selecting.value = true;
}

function cancelSelectMode() {
  selecting.value = false;
  selectedChapterIds.value = [];
}

function toggleChapter(chapterId: string) {
  if (isDownloaded(chapterId)) {
    return;
  }

  if (isSelected(chapterId)) {
    selectedChapterIds.value = selectedChapterIds.value.filter((id) => id !== chapterId);
    return;
  }

  selectedChapterIds.value = [...selectedChapterIds.value, chapterId];
}

function toggleSelectAll() {
  selectedChapterIds.value = allSelected.value ? [] : [...selectableChapterIds.value];
}

function selectCurrentToLatest() {
  selectedChapterIds.value = [...selectableCurrentToLatestIds.value];
}

function confirmDownload() {
  const comic = displayComic.value;
  if (!comic || !selectedCount.value) {
    return;
  }

  const selected = new Set(selectedChapterIds.value);
  const chapters = allChapters.value
    .filter((chapter) => selected.has(chapter.id))
    .map((chapter) => ({ source: comic.source, id: chapter.id, comicId: comic.id, name: chapter.name }));

  selecting.value = false;
  selectedChapterIds.value = [];

  void downloadStore.startDownload(comic, chapters).finally(() => {
    queryClient.invalidateQueries({ queryKey: [getChapter.name, comic.source, comic.id] });
  });
}

onActivated(() => {
  void downloadStore.loadComics();
  void downloadStore.loadChapters(source.value, comicId.value);
});

watch([source, comicId], () => {
  selecting.value = false;
  selectedChapterIds.value = [];
  void downloadStore.loadChapters(source.value, comicId.value);
});

function toRead() {
  const chapterId = history.value
    ? `${history.value.chapterId}?page=${history.value.page}`
    : (displayComic.value?.firstChapterId ?? '');
  if (chapterId) {
    router.push(`/comic/${source.value}/${comicId.value}/${chapterId}`);
  }
}

async function addComic() {
  if (!displayComic.value) {
    return;
  }
  try {
    await addToLibrary({
      source: displayComic.value.source,
      id: displayComic.value.id,
      name: displayComic.value.name,
      cover: displayComic.value.cover,
    });
    await check();
  } catch (error) {
    handleError(error);
  }
}

async function removeComic() {
  if (!displayComic.value) {
    return;
  }
  try {
    await removeFromLibrary({
      source: displayComic.value.source,
      id: displayComic.value.id,
    });
    await check();
  } catch (error) {
    handleError(error);
  }
}

function openSourceSheet() {
  switchError.value = '';
  sourceSheetShow.value = true;
}

async function onSourceSelect(targetSource: string) {
  const comic = displayComic.value;
  if (!comic || switchingSource.value || targetSource === source.value) {
    sourceSheetShow.value = false;
    return;
  }

  switchingSource.value = targetSource;
  switchError.value = '';

  try {
    const result = await switchComicSource({
      comic,
      targetSource,
      history: history.value,
      inLibrary: inLibrary.value,
    });

    sourceSheetShow.value = false;
    queryClient.setQueryData([getComic.name, result.comic.source, result.comic.id], result.comic);
    await router.replace(`/comic/${result.comic.source}/${result.comic.id}`);
  } catch (error) {
    switchError.value = getErrorMessage(error);
  } finally {
    switchingSource.value = '';
  }
}

watch(
  displayComic,
  () => {
    if (!displayComic.value) {
      return;
    }
    chapterGroups.value = displayComic.value.chapterGroups.map((group) => ({
      ...group,
      reverse: true,
    }));
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="!displayComic" class="flex h-full w-full items-center justify-center">
    <LoaderCircle class="animate-spin" />
  </div>

  <div v-else class="flex h-full w-full justify-center px-6 py-14 lg:px-12 lg:py-16">
    <Button class="fixed left-2 top-2" variant="outline" size="icon" @click="router.go(-1)">
      <ChevronLeft />
    </Button>

    <div class="w-full max-w-[1200px]">
      <div class="flex flex-col gap-4 sm:flex-row">
        <img :src="comicCover" class="aspect-[3/4] max-w-[50%] self-start object-contain" />
        <div>
          <div class="flex items-center text-xl font-semibold">
            {{ displayComic.name }}
            <Button class="ml-1" variant="ghost" size="icon" @click="inLibrary ? removeComic() : addComic()">
              <Star v-if="!inLibrary" class="!h-5 !w-5" />
              <Star v-else fill="#facc15" stroke-width="0" class="!h-5 !w-5" />
            </Button>
          </div>
          <div class="mt-2 text-sm">{{ displayComic.pubDate }}</div>
          <div>{{ displayComic.author.join(', ') }}</div>
          <div class="mt-2">{{ displayComic.intro }}</div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Button @click="toRead">
          <template v-if="history"> 继续阅读 [{{ history.chapterName }}] </template>
          <template v-else> 开始阅读 </template>
        </Button>

        <Button variant="outline" @click="openSourceSheet">
          <ArrowLeftRight />
          换源：{{ sourceName(source) }}
        </Button>

        <template v-if="!selecting">
          <Button
            variant="outline"
            :disabled="Boolean(runningBatch) || allChapters.length === 0"
            @click="enterSelectMode"
          >
            <Download />
            下载
          </Button>
        </template>
        <template v-else>
          <Button :disabled="selectedCount === 0" @click="confirmDownload">
            确认 ({{ selectedCount }}/{{ allChapters.length }})
          </Button>
          <Button variant="outline" :disabled="selectableChapterIds.length === 0" @click="toggleSelectAll">
            {{ allSelected ? '取消全选' : '全选' }}
          </Button>
          <Button
            variant="outline"
            :disabled="selectableCurrentToLatestIds.length === 0"
            title="从当前阅读章节选中到最新章节"
            @click="selectCurrentToLatest"
          >
            选到最新
          </Button>
          <Button variant="outline" @click="cancelSelectMode">取消</Button>
        </template>
      </div>

      <div v-if="runningBatch" class="mt-3 w-full max-w-[420px]">
        <div class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div class="bg-primary h-full transition-all" :style="{ width: `${runningPercent}%` }" />
        </div>
        <div class="text-muted-foreground mt-1 text-xs">
          正在下载 {{ runningBatch.completed }}/{{ runningBatch.total }} 章
          <template v-if="runningBatch.currentChapterName"> · {{ runningBatch.currentChapterName }}</template>
          <template v-if="runningBatch.currentPageTotal">
            ({{ runningBatch.currentPage }}/{{ runningBatch.currentPageTotal }} 页)
          </template>
        </div>
      </div>

      <div v-else-if="errorBatch" class="mt-3 flex items-center gap-2 text-xs text-red-500">
        <span>{{ errorBatch.errorMessage || '下载失败' }}</span>
        <Button size="xs" variant="ghost" @click="downloadStore.dismissBatch(errorBatch.id)">关闭</Button>
      </div>

      <div class="mt-4 pb-4">
        <div v-for="group in chapterGroups" :key="group.name" class="mt-4">
          <div class="flex items-center justify-between py-1 font-semibold">
            {{ group.name }}
            <Button size="sm" variant="ghost" @click="group.reverse = !group.reverse">
              <ArrowDown10 v-if="group.reverse" :size="40" />
              <ArrowDown01 v-else />
            </Button>
          </div>
          <div class="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-6 md:gap-2 lg:grid-cols-7 xl:grid-cols-8">
            <template
              v-for="chapter in group.reverse ? [...group.chapters].reverse() : group.chapters"
              :key="chapter.id"
            >
              <button
                v-if="selecting"
                type="button"
                role="checkbox"
                :aria-checked="isDownloaded(chapter.id) || isSelected(chapter.id)"
                :disabled="isDownloaded(chapter.id)"
                class="flex w-full min-w-0 items-center gap-1 rounded-sm border px-2 py-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                :class="{
                  'border-primary': isSelected(chapter.id),
                  'bg-primary/10 font-medium': isCurrentChapter(chapter.id),
                }"
                @click="toggleChapter(chapter.id)"
              >
                <span
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border"
                  :class="
                    isDownloaded(chapter.id) || isSelected(chapter.id)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  "
                >
                  <Check v-if="isDownloaded(chapter.id) || isSelected(chapter.id)" class="h-3 w-3" />
                </span>
                <span class="min-w-0 flex-1 truncate">{{ chapter.name }}</span>
                <CircleArrowDown
                  v-if="isPartial(chapter.id) && !isDownloaded(chapter.id)"
                  class="h-4 w-4 shrink-0 text-blue-500"
                  aria-label="继续下载"
                />
                <CircleCheck v-if="isDownloaded(chapter.id)" class="h-4 w-4 shrink-0" />
              </button>

              <RouterLink
                v-else
                class="flex w-full min-w-0 items-center gap-1 rounded-sm border px-2 py-1"
                :class="{ 'border-primary/40 bg-primary/10 font-medium': isCurrentChapter(chapter.id) }"
                :to="`/comic/${source}/${comicId}/${chapter.id}`"
              >
                <span class="min-w-0 flex-1 truncate">{{ chapter.name }}</span>
                <LoaderCircle v-if="isDownloading(chapter.id)" class="h-4 w-4 shrink-0 animate-spin" />
                <CircleCheck v-else-if="isDownloaded(chapter.id)" class="h-4 w-4 shrink-0 text-green-600" />
                <CircleArrowDown
                  v-else-if="isPartial(chapter.id)"
                  class="h-4 w-4 shrink-0 text-blue-500"
                  aria-label="继续下载"
                />
              </RouterLink>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>

  <SourceSheet
    v-model="sourceSheetShow"
    :sources="sources"
    :current-source="source"
    :loading-source="switchingSource"
    :error="switchError"
    @select="onSourceSelect"
  />
</template>
