<script setup lang="ts">
// The single toast container (state lives in src/admin-client/toast.ts). AdminLayout mounts it once.
import { dismissToast, toasts } from '../../../admin-client/toast';
import Icon from './Icon.vue';

const TONE = { success: 'text-success', error: 'text-danger', info: 'text-brand' } as const;
const ICON = { success: 'check', error: 'alert', info: 'info' } as const;
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:right-4 md:items-end"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      :role="t.kind === 'error' ? 'alert' : 'status'"
      class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-bg px-4 py-3 shadow-lg"
    >
      <span :class="TONE[t.kind]"><Icon :name="ICON[t.kind]" /></span>
      <p class="flex-1">{{ t.message }}</p>
      <button
        type="button"
        class="inline-flex size-6 items-center justify-center rounded hover:bg-surface"
        aria-label="ปิดการแจ้งเตือน"
        @click="dismissToast(t.id)"
      >
        <Icon name="x" :size="16" />
      </button>
    </div>
  </div>
</template>
