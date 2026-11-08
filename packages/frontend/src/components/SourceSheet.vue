<script setup lang="ts">
import type { SourceInfo } from '@/api/types';
import { Check, LoaderCircle, X } from 'lucide-vue-next';
import { computed, onUnmounted, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    sources: SourceInfo[];
    currentSource: string;
    loadingSource?: string;
    error?: string;
    dark?: boolean;
  }>(),
  {
    loadingSource: '',
    error: '',
    dark: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'select': [sourceId: string];
}>();

const currentSourceName = computed(
  () => props.sources.find((source) => source.id === props.currentSource)?.name ?? props.currentSource,
);

function close() {
  emit('update:modelValue', false);
}

function select(sourceId: string) {
  if (sourceId === props.currentSource || props.loadingSource) {
    return;
  }
  emit('select', sourceId);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown);
    } else {
      window.removeEventListener('keydown', onKeydown);
    }
  },
);

onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="source-overlay">
      <div v-if="modelValue" class="fixed inset-0 z-40 touch-none bg-black/50" @click="close" />
    </Transition>

    <Transition name="source-panel">
      <div
        v-if="modelValue"
        role="dialog"
        aria-modal="true"
        aria-label="切换漫画源"
        class="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[640px] rounded-t-2xl border-t shadow-2xl"
        :class="dark ? 'border-white/10 bg-[#27292C] text-white' : 'bg-background text-foreground'"
      >
        <div class="mx-auto mt-2 h-1 w-10 rounded-full" :class="dark ? 'bg-white/20' : 'bg-muted-foreground/30'" />

        <div class="flex items-start justify-between gap-4 px-5 pb-2 pt-3">
          <div class="min-w-0">
            <div class="text-base font-semibold">切换来源</div>
            <div class="mt-0.5 truncate text-xs opacity-60">当前：{{ currentSourceName }}</div>
          </div>
          <button
            type="button"
            class="rounded-full p-1.5 transition-colors"
            :class="dark ? 'hover:bg-white/10' : 'hover:bg-muted'"
            aria-label="关闭"
            @click="close"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="max-h-[60dvh] overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div v-if="!sources.length" class="px-3 py-6 text-center text-sm opacity-60">暂无可用来源</div>

          <button
            v-for="source in sources"
            :key="source.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors"
            :class="[
              source.id === currentSource
                ? dark
                  ? 'bg-white/10'
                  : 'bg-muted'
                : dark
                  ? 'hover:bg-white/5'
                  : 'hover:bg-muted/60',
              loadingSource && source.id !== loadingSource ? 'opacity-60' : '',
            ]"
            :disabled="source.id === currentSource || Boolean(loadingSource)"
            @click="select(source.id)"
          >
            <span class="min-w-0 truncate">{{ source.name }}</span>
            <LoaderCircle v-if="loadingSource === source.id" class="h-4 w-4 shrink-0 animate-spin" />
            <Check v-else-if="source.id === currentSource" class="text-primary h-4 w-4 shrink-0" />
          </button>
        </div>

        <div v-if="error" class="px-5 pb-[max(env(safe-area-inset-bottom),1rem)] text-sm text-red-500">
          {{ error }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.source-overlay-enter-active,
.source-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.source-overlay-enter-from,
.source-overlay-leave-to {
  opacity: 0;
}

.source-panel-enter-active,
.source-panel-leave-active {
  transition: transform 0.25s ease;
}

.source-panel-enter-from,
.source-panel-leave-to {
  transform: translateY(100%);
}
</style>
