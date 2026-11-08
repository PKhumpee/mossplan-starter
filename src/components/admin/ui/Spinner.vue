<script setup lang="ts">
import { computed } from 'vue';

// Callers pass either a pixel number or a named size; SVG width/height need a length.
const NAMED = { sm: 16, md: 24, lg: 32 } as const;
type NamedSize = keyof typeof NAMED;

const props = withDefaults(defineProps<{ size?: number | NamedSize; label?: string }>(), {
  size: 16,
  label: 'กำลังโหลด',
});
const px = computed(() =>
  typeof props.size === 'number' ? props.size : (NAMED[props.size] ?? 16),
);
</script>

<template>
  <span role="status" class="inline-flex items-center">
    <svg
      class="motion-safe-spin animate-spin"
      :width="px"
      :height="px"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
