<script setup lang="ts">
import { deleteHistory, getHistory } from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { Button } from '@/components/ui/button';
import { useSources } from '@/composables/useSources';
import { comicKey } from '@/utils';
import { handleError } from '@/utils/error';
import { useQuery } from '@tanstack/vue-query';
import dayjs from 'dayjs';
import { Trash2 } from 'lucide-vue-next';
import { computed, onActivated } from 'vue';
import { RouterLink } from 'vue-router';

const { sourceName } = useSources();

const { data, refetch } = useQuery({
  queryKey: [getHistory.name],
  queryFn: () => getHistory(),
});

const items = computed(() => (data.value ?? []).filter((item) => item.visible));

async function onDelete(source: string, comicId: string) {
  try {
    await deleteHistory({ source, comicId });
    refetch();
  } catch (error) {
    handleError(error);
  }
}

onActivated(refetch);
</script>

<template>
  <div class="flex h-full w-full flex-col gap-4 px-6 py-14 lg:px-12 lg:py-16">
    <PageHeader title="历史记录" />

    <RouterLink
      v-for="item in items"
      :key="comicKey(item.source, item.comicId)"
      class="flex cursor-pointer gap-1 rounded border p-4 shadow"
      :to="`/comic/${item.source}/${item.comicId}/${item.chapterId}?page=${item.page}`"
    >
      <div class="min-w-0 flex-1">
        <div class="flex flex-col gap-1 sm:flex-row sm:gap-4">
          <div class="truncate font-semibold">{{ item.comicName }}</div>

          <div class="truncate">[{{ item.chapterName }}] (P{{ item.page }})</div>
        </div>
        <div class="mt-2 flex gap-2 truncate text-sm text-gray-400">
          <span>{{ sourceName(item.source) }}</span>
          <span>上次观看: {{ dayjs(item.updatedAt).format('YYYY/MM/DD HH:mm') }}</span>
        </div>
      </div>

      <Button
        class="-translate-y-1.5 translate-x-2.5"
        variant="ghost"
        size="icon"
        @click.stop.prevent="onDelete(item.source, item.comicId)"
      >
        <Trash2 />
      </Button>
    </RouterLink>
  </div>
</template>
