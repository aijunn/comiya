<script setup lang="ts">
import { searchComic } from '@/api';
import { Input } from '@/components/ui/input';
import { useSources } from '@/composables/useSources';
import { LocalStorageKey } from '@/types/const';
import { useQuery } from '@tanstack/vue-query';
import { useDebounce, useLocalStorage } from '@vueuse/core';
import { Download, History, LibraryBig, LoaderCircle } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

const keyword = ref('');
const debounced = useDebounce(keyword, 500);
const selectedSource = useLocalStorage(LocalStorageKey.SearchSource, '');

const { sources, sourceName } = useSources();
const showSourceFilter = computed(() => sources.value.length > 1);

watch(sources, (list) => {
  if (selectedSource.value && !list.some((source) => source.id === selectedSource.value)) {
    selectedSource.value = '';
  }
});

const { data, isFetching } = useQuery({
  queryKey: [searchComic.name, debounced, selectedSource],
  queryFn: () => searchComic({ keyword: debounced.value, source: selectedSource.value || undefined }),
  placeholderData: (prev) => prev,
  refetchOnWindowFocus: false,
  enabled: () => Boolean(debounced.value.trim()),
});

const comics = computed(() => data.value || []);
</script>

<template>
  <div class="relative flex h-full w-full flex-col items-center px-12 py-16">
    <div class="transition-all duration-300" :class="[comics.length ? 'h-0' : 'h-1/4']" />
    <div class="flex w-4/5 max-w-[600px] flex-col items-center gap-8">
      <div class="text-5xl font-semibold">Comiya</div>
      <div class="flex w-full items-center gap-2">
        <div class="relative flex-1">
          <Input v-model="keyword" class="pr-9 text-base" autofocus />
          <LoaderCircle v-if="isFetching" class="absolute right-2 top-2 animate-spin" :size="20" />
        </div>
        <select
          v-if="showSourceFilter"
          v-model="selectedSource"
          class="bg-background h-9 shrink-0 rounded-md border px-2 text-sm"
          aria-label="漫画源"
        >
          <option value="">全部来源</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
        </select>
      </div>
    </div>

    <div class="mt-12 grid max-w-[1200px] grid-cols-2 gap-8 sm:grid-cols-4 md:grid-cols-5">
      <RouterLink
        v-for="comic in comics"
        :key="`${comic.source}:${comic.id}`"
        class="w-full cursor-pointer"
        :to="`/comic/${comic.source}/${comic.id}`"
      >
        <img class="aspect-[3/4] w-full rounded-sm shadow-lg" :src="comic.cover" />
        <div class="mt-2 truncate">{{ comic.name }}</div>
        <div v-if="showSourceFilter" class="text-muted-foreground truncate text-xs">
          {{ sourceName(comic.source) }}
        </div>
      </RouterLink>
    </div>

    <div class="absolute right-6 top-6 flex gap-2">
      <RouterLink class="p-2" to="/library">
        <LibraryBig />
      </RouterLink>

      <RouterLink class="p-2" to="/history">
        <History />
      </RouterLink>

      <RouterLink class="p-2" to="/downloads" aria-label="下载管理">
        <Download />
      </RouterLink>
    </div>
  </div>
</template>
