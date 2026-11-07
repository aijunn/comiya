import { getSources } from '@/api';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

export function useSources() {
  const { data } = useQuery({
    queryKey: [getSources.name],
    queryFn: () => getSources(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const sources = computed(() => data.value ?? []);

  const sourceName = (id: string) => sources.value.find((source) => source.id === id)?.name ?? id;

  return { sources, sourceName };
}
