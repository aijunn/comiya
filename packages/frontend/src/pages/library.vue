<script setup lang="ts">
import { getLibrary } from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { useSources } from '@/composables/useSources';
import { comicKey } from '@/utils';
import { useQuery } from '@tanstack/vue-query';
import { computed, onActivated } from 'vue';
import { RouterLink } from 'vue-router';

const { sourceName } = useSources();

const { data, refetch } = useQuery({
  queryKey: [getLibrary.name],
  queryFn: () => getLibrary(),
});

const comics = computed(() => data.value || []);

onActivated(refetch);
</script>

<template>
  <div class="flex h-full w-full flex-col gap-4 px-6 py-14 lg:px-12 lg:py-16">
    <PageHeader title="书架" />

    <div class="grid grid-cols-3 gap-4 sm:grid-cols-4 sm:gap-6 md:grid-cols-5 md:gap-8 lg:grid-cols-6">
      <RouterLink
        v-for="comic in comics"
        :key="comicKey(comic.source, comic.id)"
        class="w-full"
        :to="`/comic/${comic.source}/${comic.id}`"
      >
        <img class="aspect-[3/4] w-full rounded-sm shadow-lg" :src="comic.cover" />
        <div class="mt-2 truncate">{{ comic.name }}</div>
        <div class="text-muted-foreground truncate text-xs">{{ sourceName(comic.source) }}</div>
      </RouterLink>
    </div>
  </div>
</template>
