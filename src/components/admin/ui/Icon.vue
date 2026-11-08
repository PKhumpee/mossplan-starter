<script setup lang="ts">
// Inline Tabler Icons (MIT), stroke style. One name map, no icon font (DESIGN §8).
import type { IconName } from './icons';
import { ICON_PATHS } from './icons';

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>
