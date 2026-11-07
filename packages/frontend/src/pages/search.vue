<script setup lang="ts">
import { searchComic } from '@/api';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/vue-query';
import { useDebounce } from '@vueuse/core';
import { Download, History, LibraryBig, LoaderCircle } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

const keyword = ref('');
const debounced = useDebounce(keyword, 500);

const { data, isFetching } = useQuery({
  queryKey: [searchComic.name, debounced],
  queryFn: () => searchComic({ keyword: debounced.value }),
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
      <div class="relative w-full">
        <Input v-model="keyword" class="pr-9 text-base" autofocus />
        <LoaderCircle v-if="isFetching" class="absolute right-2 top-2 animate-spin" :size="20" />
      </div>
    </div>

    <div class="mt-12 grid max-w-[1200px] grid-cols-2 gap-8 sm:grid-cols-4 md:grid-cols-5">
      <RouterLink v-for="comic in comics" :key="comic.id" class="w-full cursor-pointer" :to="`/comic/${comic.id}`">
        <img class="aspect-[3/4] w-full rounded-sm shadow-lg" :src="comic.cover" />
        <div class="mt-2 truncate">{{ comic.name }}</div>
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
