<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

defineProps<{
  title: string;
}>();

const router = useRouter();
</script>

<template>
  <header class="bg-background/80 fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-2 px-2 backdrop-blur-sm">
    <Button variant="outline" size="icon" aria-label="返回" @click="router.go(-1)">
      <ChevronLeft />
    </Button>
    <h1 class="truncate text-xl font-semibold">{{ title }}</h1>
  </header>
</template>
