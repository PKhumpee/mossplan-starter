<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 5 });
</script>

<template>
  <div aria-hidden="true" class="space-y-2">
    <div v-for="n in rows" :key="n" class="h-11 animate-pulse rounded-md bg-surface" />
  </div>
</template>
