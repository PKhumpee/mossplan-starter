<script setup lang="ts">
import Icon from './Icon.vue';
import type { IconName } from './icons';

withDefaults(defineProps<{ message: string; icon?: IconName }>(), { icon: 'inbox' });
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-4 py-12 text-center text-muted">
    <Icon :name="icon" :size="40" />
    <p>{{ message }}</p>
    <div><slot name="action" /></div>
  </div>
</template>
