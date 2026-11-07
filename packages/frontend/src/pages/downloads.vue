<script setup lang="ts">
import { getChapter } from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { Button } from '@/components/ui/button';
import { useSources } from '@/composables/useSources';
import { useDownloadStore } from '@/stores/download';
import { comicKey, formatBytes } from '@/utils';
import { useQueryClient } from '@tanstack/vue-query';
import { Download, LoaderCircle, Trash2 } from 'lucide-vue-next';
import { computed, onActivated } from 'vue';
import { RouterLink } from 'vue-router';

const queryClient = useQueryClient();
const downloadStore = useDownloadStore();
const { sourceName } = useSources();

const comics = computed(() => downloadStore.comics);
const runningBatches = computed(() => downloadStore.runningBatches);
const errorBatches = computed(() => downloadStore.errorBatches);
const totalChapters = computed(() => comics.value.reduce((sum, comic) => sum + comic.chapterCount, 0));
const totalSize = computed(() => comics.value.reduce((sum, comic) => sum + comic.size, 0));

onActivated(() => {
  void downloadStore.loadAll();
});

function batchPercent(completed: number, total: number) {
  return total ? Math.round((completed / total) * 100) : 0;
}

function partialCount(source: string, comicId: string) {
  return downloadStore.partialChaptersByComic[comicKey(source, comicId)]?.length ?? 0;
}

async function removeComic(source: string, comicId: string, name: string) {
  if (downloadStore.hasRunningBatch(source, comicId)) {
    return;
  }
  if (!window.confirm(`确定删除《${name}》的全部下载吗？`)) {
    return;
  }

  await downloadStore.removeComic(source, comicId);
  queryClient.removeQueries({ queryKey: [getChapter.name, source, comicId] });
}
</script>

<template>
  <div class="flex h-full w-full flex-col gap-4 px-6 py-14 lg:px-12 lg:py-16">
    <PageHeader title="下载管理" />

    <div v-if="runningBatches.length" class="flex flex-col gap-2">
      <div class="flex items-center gap-2 text-sm font-semibold">
        <LoaderCircle class="h-4 w-4 animate-spin" />
        正在下载
      </div>

      <div v-for="batch in runningBatches" :key="batch.id" class="rounded border p-3">
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="truncate">{{ batch.comicName }}</span>
          <span class="text-muted-foreground shrink-0">{{ batch.completed }}/{{ batch.total }} 章</span>
        </div>
        <div class="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="bg-primary h-full transition-all"
            :style="{ width: `${batchPercent(batch.completed, batch.total)}%` }"
          />
        </div>
        <div class="text-muted-foreground mt-1 truncate text-xs">
          <template v-if="batch.currentChapterName">{{ batch.currentChapterName }}</template>
          <template v-if="batch.currentPageTotal"> ({{ batch.currentPage }}/{{ batch.currentPageTotal }} 页)</template>
        </div>
      </div>
    </div>

    <div v-if="errorBatches.length" class="flex flex-col gap-2">
      <div
        v-for="batch in errorBatches"
        :key="batch.id"
        class="flex items-start justify-between gap-2 rounded border border-red-200 p-3 text-sm text-red-500"
      >
        <span class="min-w-0 flex-1">{{ batch.comicName }}：{{ batch.errorMessage || '下载失败' }}</span>
        <Button size="xs" variant="ghost" @click="downloadStore.dismissBatch(batch.id)">关闭</Button>
      </div>
    </div>

    <div v-if="!comics.length" class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
      <Download class="h-10 w-10" />
      <div>暂无下载</div>
    </div>

    <div v-else class="grid grid-cols-3 gap-4 sm:grid-cols-4 sm:gap-6 md:grid-cols-5 md:gap-8 lg:grid-cols-6">
      <div v-for="comic in comics" :key="comicKey(comic.source, comic.id)" class="group relative">
        <RouterLink class="block w-full" :to="`/comic/${comic.source}/${comic.id}`">
          <img
            v-if="comic.coverUrl"
            class="aspect-[3/4] w-full rounded-sm object-cover shadow-lg"
            :src="comic.coverUrl"
            :alt="comic.name"
          />
          <div v-else class="bg-muted flex aspect-[3/4] w-full items-center justify-center rounded-sm">
            <Download class="text-muted-foreground h-6 w-6" />
          </div>
          <div class="mt-2 truncate">{{ comic.name }}</div>
          <div class="text-muted-foreground truncate text-xs">{{ sourceName(comic.source) }}</div>
          <div v-if="comic.chapterCount" class="text-muted-foreground truncate text-xs">
            {{ comic.chapterCount }} 章 · {{ formatBytes(comic.size) }}
          </div>
          <div v-if="partialCount(comic.source, comic.id)" class="truncate text-xs text-amber-600">
            {{ partialCount(comic.source, comic.id) }} 章待继续
          </div>
        </RouterLink>

        <Button
          class="absolute right-1 top-1 h-7 w-7 opacity-80 hover:opacity-100"
          variant="secondary"
          size="icon"
          :disabled="downloadStore.hasRunningBatch(comic.source, comic.id)"
          aria-label="删除下载"
          @click.stop.prevent="removeComic(comic.source, comic.id, comic.name)"
        >
          <Trash2 />
        </Button>
      </div>
    </div>

    <div v-if="comics.length" class="text-muted-foreground mt-auto text-xs">
      共 {{ comics.length }} 部 · {{ totalChapters }} 章 · {{ formatBytes(totalSize) }}
    </div>
  </div>
</template>
