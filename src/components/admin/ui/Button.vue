<script setup lang="ts">
import { computed } from 'vue';
import Spinner from './Spinner.vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  { variant: 'secondary', size: 'md', loading: false, disabled: false, type: 'button' },
);

const classes = computed(() => [
  'relative inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors',
  'disabled:cursor-not-allowed disabled:opacity-60',
  props.size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4',
  {
    primary: 'bg-brand text-brand-contrast hover:opacity-90',
    secondary: 'border border-border bg-bg text-fg hover:bg-surface',
    ghost: 'text-fg hover:bg-surface',
    danger: 'bg-danger text-brand-contrast hover:opacity-90',
  }[props.variant],
]);
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
  >
    <!-- The label keeps its space while loading so the button does not change width. -->
    <span :class="{ invisible: loading }" class="inline-flex items-center gap-2"><slot /></span>
    <span v-if="loading" class="absolute inset-0 flex items-center justify-center">
      <Spinner />
    </span>
  </button>
</template>
