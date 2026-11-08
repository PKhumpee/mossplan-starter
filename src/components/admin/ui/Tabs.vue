<script setup lang="ts">
import { useId } from 'vue';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

const props = defineProps<{ tabs: TabItem[]; label: string }>();
const model = defineModel<string>({ required: true });
const id = useId();

function onKeydown(event: KeyboardEvent): void {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const count = props.tabs.length;
  const index = props.tabs.findIndex((t) => t.value === model.value);
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % count;
  if (event.key === 'ArrowLeft') next = (index - 1 + count) % count;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = count - 1;
  const target = props.tabs[next];
  if (!target) return;
  model.value = target.value;
  document.getElementById(`${id}-${target.value}`)?.focus();
}
</script>

<template>
  <div
    role="tablist"
    :aria-label="label"
    class="flex gap-1 border-b border-border"
    @keydown="onKeydown"
  >
    <button
      v-for="t in tabs"
      :id="`${id}-${t.value}`"
      :key="t.value"
      type="button"
      role="tab"
      :aria-selected="model === t.value"
      :tabindex="model === t.value ? 0 : -1"
      class="-mb-px border-b-2 px-3 py-2"
      :class="
        model === t.value
          ? 'border-brand font-medium text-brand'
          : 'border-transparent text-muted hover:text-fg'
      "
      @click="model = t.value"
    >
      {{ t.label }}<span v-if="t.count !== undefined" class="ml-1 text-sm">({{ t.count }})</span>
    </button>
  </div>
</template>
