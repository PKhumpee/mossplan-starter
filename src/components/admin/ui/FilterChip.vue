<script setup lang="ts">
import Icon from './Icon.vue';

defineProps<{ label: string }>();
defineEmits<{ remove: [] }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-1 pl-3 text-sm"
  >
    {{ label }}
    <button
      type="button"
      class="inline-flex size-6 items-center justify-center rounded-full hover:bg-border"
      :aria-label="`เอาตัวกรองออก: ${label}`"
      @click="$emit('remove')"
    >
      <Icon name="x" :size="14" />
    </button>
  </span>
</template>
