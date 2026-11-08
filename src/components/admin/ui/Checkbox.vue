<script setup lang="ts">
defineProps<{ label: string; disabled?: boolean; hint?: string }>();
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <label class="inline-flex cursor-pointer items-start gap-2">
    <input
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      class="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
    />
    <span>
      {{ label }}
      <span v-if="hint" class="block text-sm text-muted">{{ hint }}</span>
    </span>
  </label>
</template>
