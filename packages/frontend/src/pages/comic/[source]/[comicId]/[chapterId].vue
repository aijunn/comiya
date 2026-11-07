<script setup lang="ts">
import { getChapter, upsertHistory } from '@/api';
import ChapterGestureMask from '@/components/ChapterGestureMask.vue';
import LazyImage from '@/components/LazyImage.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { useActivated } from '@/hooks/activated';
import { usePreviousRoute } from '@/hooks/previous-route';
import { getChapterForReader } from '@/services/download';
import { LocalStorageKey, ReadDirection } from '@/types/const';
import { resetThemeColor, setThemeColor } from '@/utils/theme-color';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { onKeyStroke, useDebounceFn, useEventListener, useLocalStorage, useMediaQuery } from '@vueuse/core';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  BookOpenText,
  ChevronLeft,
  LoaderCircle,
  Pointer,
  Settings,
  SquareArrowDown,
  SquareArrowLeft,
  SquareArrowRight,
} from 'lucide-vue-next';
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

const isPWA = useMediaQuery('(display-mode: fullscreen), (display-mode: standalone)');

onActivated(() => {
  setThemeColor('#000');
});

onDeactivated(() => {
  resetThemeColor();
});

const activated = useActivated();

const route = useRoute('/comic/[source]/[comicId]/[chapterId]');
const router = useRouter();

const { previousRoute } = usePreviousRoute();
const fromComic = computed(() => previousRoute.value?.name === '/comic/[source]/[comicId]/');

const source = computed(() => route.params.source);
const comicId = computed(() => route.params.comicId);
const chapterId = computed(() => route.params.chapterId);

const { data, isFetching } = useQuery({
  queryKey: [getChapter.name, source, comicId, chapterId],
  queryFn: () => getChapterForReader(source.value, comicId.value, chapterId.value),
  staleTime: Infinity,
  gcTime: Infinity,
});

const images = computed(() => {
  const rawImages = (data.value?.images || []).map((image, index) => ({
    image,
    index,
  }));
  if (readDirection.value === ReadDirection.RightToLeft) {
    return rawImages.reverse();
  } else {
    return rawImages;
  }
});
const hasNext = computed(() => Boolean(data.value?.nextId && data.value.nextId !== '0'));
const hasPrev = computed(() => Boolean(data.value?.prevId && data.value.prevId !== '0'));

const activeIndex = ref([0]);
const tempIndex = ref([0]);

watch([source, comicId, chapterId, route], () => {
  activeIndex.value = [0];
  tempIndex.value = [0];
  scrollToPage(0);
});

watch(data, async () => {
  if (!data.value) {
    return;
  }

  const page = Number(route.query.page);

  await nextTick();

  if (page > 0) {
    scrollToPage(page - 1);
  } else if (readDirection.value === ReadDirection.RightToLeft) {
    scrollToPage(0);
  }
});

const listRef = useTemplateRef('list-container');

const pageNavShow = ref(false);

function onSlideChange() {
  pageNavShow.value = true;
}

function onSlideEnd(index: number[]) {
  scrollToPage(index[0]);
  pageNavShow.value = false;
}

const controlMaskShow = ref(false);
onActivated(() => {
  controlMaskShow.value = false;
});

const readDirection = useLocalStorage(LocalStorageKey.ReadDirection, ReadDirection.TopToBottom);
const gestureTipShowed = useLocalStorage(LocalStorageKey.GestureTipShowed, false);
const gestureReverse = useLocalStorage(LocalStorageKey.GestureReverse, false);
const showGestureTip = ref(!gestureTipShowed.value);
gestureTipShowed.value = true;

const directionOptions = [
  { title: '普通模式', value: ReadDirection.LeftToRight, icon: SquareArrowRight },
  { title: '日漫模式', value: ReadDirection.RightToLeft, icon: SquareArrowLeft },
  { title: '滚动模式', value: ReadDirection.TopToBottom, icon: SquareArrowDown },
];

async function onDirectionChange(direction: ReadDirection) {
  readDirection.value = direction;
  const oldIndex = activeIndex.value[0];
  await nextTick();
  scrollToPage(oldIndex);
}

const showNextTip = ref(false);
const resetNextTip = useDebounceFn(() => {
  showNextTip.value = false;
}, 2000);
const showPrevTip = ref(false);
const resetPrevTip = useDebounceFn(() => {
  showPrevTip.value = false;
}, 2000);

function scrollToPage(index: number) {
  const isHorizontal = readDirection.value !== ReadDirection.TopToBottom;
  const field = isHorizontal ? 'left' : 'top';
  const size = isHorizontal ? window.innerWidth : window.innerHeight;
  const realIndex = readDirection.value === ReadDirection.RightToLeft ? images.value.length - 1 - index : index;
  listRef.value?.scrollTo({
    [field]: size * Math.min(images.value.length - 1, Math.max(0, realIndex)),
    behavior: 'instant',
  });
}

function toNextPage() {
  const currentPage = activeIndex.value[0];
  if (currentPage === images.value.length - 1) {
    if (!showNextTip.value) {
      showNextTip.value = true;
      resetNextTip();
    } else if (hasNext.value) {
      toNextChapter();
      showNextTip.value = false;
    }
  } else {
    scrollToPage(activeIndex.value[0] + 1);
  }
}

function toPrevPage() {
  const currentPage = activeIndex.value[0];
  if (currentPage === 0) {
    if (!showPrevTip.value) {
      showPrevTip.value = true;
      resetPrevTip();
    } else if (hasPrev.value) {
      toPreviousChapter();
      showPrevTip.value = false;
    }
  } else {
    scrollToPage(activeIndex.value[0] - 1);
  }
}

function toPreviousChapter() {
  if (hasPrev.value && data.value) {
    router.replace(`/comic/${source.value}/${comicId.value}/${data.value.prevId}`);
  }
}

function toNextChapter() {
  if (hasNext.value && data.value) {
    router.replace(`/comic/${source.value}/${comicId.value}/${data.value.nextId}`);
  }
}

onKeyStroke(['ArrowDown', 'ArrowRight'], (e) => {
  e.preventDefault();
  toNextPage();
});

onKeyStroke(['ArrowUp', 'ArrowLeft'], (e) => {
  e.preventDefault();
  toPrevPage();
});

// pre cache next chapter
const queryClient = useQueryClient();
const toEndDistance = computed(() => {
  if (!data.value || isFetching.value || !hasNext.value) {
    return Infinity;
  }
  return Math.abs(activeIndex.value[0] - (images.value.length - 1));
});
watch(toEndDistance, () => {
  if (toEndDistance.value < 5 && data.value) {
    const nextChapterId = data.value.nextId;
    queryClient.prefetchQuery({
      queryKey: [getChapter.name, source.value, comicId.value, nextChapterId],
      queryFn: async () => {
        const nextChapter = await getChapterForReader(source.value, comicId.value, nextChapterId);

        nextChapter.images.slice(0, 5).forEach((image) => {
          if (!image.startsWith('blob:')) {
            fetch(image, { priority: 'low' });
          }
        });

        return nextChapter;
      },
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }
});

// update watch history
const historyDirty = ref(false);
const checkTimer = ref(0);
watch([source, comicId, chapterId, activeIndex], () => {
  if (isFetching.value || !data.value) {
    return;
  }
  historyDirty.value = true;
});
function update() {
  if (historyDirty.value && data.value && comicId.value && chapterId.value && activated.value) {
    upsertHistory({
      source: source.value,
      comicId: comicId.value,
      chapterId: chapterId.value,
      page: activeIndex.value[0] + 1,
      comicName: data.value.comicName,
      chapterName: data.value.name,
      visible: true,
    }).finally(() => {
      historyDirty.value = false;
    });
  }
}
onMounted(() => {
  checkTimer.value = setInterval(update, 3000);
});
onUnmounted(() => {
  update();
  clearInterval(checkTimer.value);
});
useEventListener(window, 'beforeunload', update);
</script>

<template>
  <div v-if="!data || !activated" class="flex h-full w-full items-center justify-center bg-black text-white">
    <LoaderCircle class="animate-spin" />
  </div>

  <div
    v-else
    ref="list-container"
    class="scrollbar-hidden relative h-full w-full snap-both snap-mandatory overflow-auto bg-black outline-none"
  >
    <div
      class="flex bg-black"
      :class="{
        'gap-y-[env(safe-area-inset-bottom)]': isPWA,
        'flex-col': readDirection === ReadDirection.TopToBottom,
      }"
    >
      <LazyImage
        v-for="item in images"
        :key="item.image"
        class="w-dvw flex-none snap-start bg-black object-contain"
        :class="[isPWA ? 'h-[calc(100dvh_-_env(safe-area-inset-bottom))]' : 'h-dvh']"
        styles="content-visibility:auto"
        :src="item.image"
        :index="item.index"
        :active-index="activeIndex[0]"
        @activated="
          activeIndex = [item.index];
          tempIndex = [item.index];
        "
      />
    </div>

    <Transition name="mask">
      <div v-if="controlMaskShow" class="fixed left-0 right-0 top-0 z-10 flex h-12 items-center bg-black text-white">
        <div class="p-2" @click="router.back()">
          <ChevronLeft :size="28" />
        </div>
        <div class="min-w-0 flex-1 truncate">{{ data.comicName }} - {{ data.name }}</div>
      </div>
    </Transition>

    <Transition name="mask">
      <div
        v-if="controlMaskShow"
        class="fixed inset-0 overscroll-contain bg-black bg-opacity-40"
        @click="
          controlMaskShow = false;
          pageNavShow = false;
        "
      />
    </Transition>

    <Transition name="panel">
      <div
        v-if="controlMaskShow"
        class="pointer-events-none fixed bottom-0 left-0 right-0 z-10 flex justify-center p-4 text-white"
        :class="{ 'pb-[max(env(safe-area-inset-bottom),1rem)]': isPWA }"
      >
        <div class="pointer-events-auto relative w-full max-w-[800px] rounded-lg">
          <Collapsible as-child>
            <div class="w-full rounded-lg bg-[#27292C] bg-opacity-70 shadow-lg backdrop-blur-lg">
              <div class="flex w-full items-center">
                <div
                  class="p-4"
                  :class="[hasPrev ? 'cursor-pointer' : 'cursor-not-allowed opacity-40']"
                  @click="toPreviousChapter"
                >
                  <ArrowLeftToLine :size="28" />
                </div>

                <Slider
                  v-model="tempIndex"
                  :min="0"
                  :max="images.length - 1"
                  @value-commit="onSlideEnd"
                  @update:model-value="onSlideChange"
                />

                <div
                  class="p-4"
                  :class="[hasNext ? 'cursor-pointer' : 'cursor-not-allowed opacity-40']"
                  @click="toNextChapter"
                >
                  <ArrowRightToLine :size="28" />
                </div>
              </div>

              <div class="flex w-full items-center justify-between px-12 pb-2 text-sm">
                <CollapsibleTrigger as-child>
                  <div class="operation-btn">
                    <Settings />
                  </div>
                </CollapsibleTrigger>
                <div
                  class="operation-btn"
                  :class="{ '-scale-x-[1]': gestureReverse }"
                  @click="
                    controlMaskShow = false;
                    showGestureTip = true;
                    gestureReverse = !gestureReverse;
                  "
                >
                  <Pointer />
                </div>
                <div
                  class="operation-btn"
                  @click="
                    controlMaskShow = false;
                    if (fromComic) {
                      router.back();
                    } else {
                      router.replace(`/comic/${source}/${comicId}`);
                    }
                  "
                >
                  <BookOpenText />
                </div>
              </div>

              <CollapsibleContent>
                <div class="full flex gap-4 px-4 pb-4 pt-2">
                  <div
                    v-for="option in directionOptions"
                    :key="option.value"
                    class="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded border-[1.5px] border-white p-2 opacity-40"
                    :class="{ '!opacity-100': readDirection === option.value }"
                    @click="onDirectionChange(option.value)"
                  >
                    <component :is="option.icon" />
                    {{ option.title }}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
          <div class="rainbow-mask pointer-events-none absolute inset-0 rounded-lg border border-transparent" />
        </div>

        <div
          v-if="pageNavShow"
          class="absolute -top-4 left-1/2 min-w-20 -translate-x-1/2 rounded bg-[#27292C] bg-opacity-70 px-1 text-center text-white shadow-lg backdrop-blur-md"
        >
          <span class="text-blue-400">{{ tempIndex[0] + 1 }}</span>
          /
          <span>{{ images.length }}</span>
        </div>
      </div>
    </Transition>

    <ChapterGestureMask
      v-if="!controlMaskShow"
      :show-tip="showGestureTip"
      :reverse="gestureReverse"
      @next-page="toNextPage"
      @prev-page="toPrevPage"
      @open-menu="controlMaskShow = true"
      @click="
        gestureTipShowed = true;
        showGestureTip = false;
      "
    />

    <div
      v-if="showPrevTip || showNextTip"
      class="fixed left-1/2 top-1/2 z-20 -translate-x-1/2 rounded bg-black bg-opacity-30 px-2 py-1 text-white backdrop-blur-sm"
      :class="[isPWA ? '-translate-y-[calc(50%_+_env(safe-area-inset-bottom))]' : '-translate-y-1/2']"
    >
      {{
        showPrevTip
          ? hasPrev
            ? '👆 再次点击前往上一章'
            : '😭 没有上一章了'
          : hasNext
            ? '👇 再次点击前往下一章'
            : '😭 没有下一章了'
      }}
    </div>
  </div>
</template>

<style scoped>
.operation-btn {
  @apply flex cursor-pointer flex-col items-center gap-1 px-4 py-2;
}

.rainbow-mask {
  mask:
    linear-gradient(#000 0 0) padding-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab) border-box;
  background-size: 400% 400%;
  animation: gradient 10s ease infinite;
}

@keyframes gradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.mask-enter-active,
.mask-leave-active {
  transition: all 0.3s ease;
}

.mask-enter-from,
.mask-leave-to {
  opacity: 0;
}

.panel-enter-active,
.panel-leave-active {
  transition: all 0.3s ease;
}

.panel-enter-from,
.panel-leave-to {
  transform: translateY(100%);
}
</style>
