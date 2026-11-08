<script setup lang="ts">
// Off-canvas navigation below 1024px: focus-trapped, Esc closes (DESIGN §7.1).
import { ref, useId } from 'vue';
import { useFocusTrap } from '../../../../admin-client/focus-trap';
import Icon from '../Icon.vue';
import type { NavItem, NavKey } from './nav';

defineProps<{ items: NavItem[]; active?: NavKey }>();

const open = ref(false);
const panel = ref<HTMLElement | null>(null);
const labelId = useId();
useFocusTrap(panel, open);
</script>

<template>
  <div class="lg:hidden">
    <button
      type="button"
      class="inline-flex size-9 items-center justify-center rounded-md hover:bg-surface"
      aria-label="เปิดเมนู"
      :aria-expanded="open"
      @click="open = true"
    >
      <Icon name="menu" />
    </button>
    <div v-if="open" class="fixed inset-0 z-50" @keydown.esc="open = false">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="open = false" />
      <nav
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelId"
        tabindex="-1"
        class="relative flex h-full w-60 flex-col gap-1 border-r border-border bg-bg p-3 shadow-xl"
      >
        <div class="mb-2 flex items-center justify-between">
          <span :id="labelId" class="px-2 text-lg font-semibold">Mossplan</span>
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center rounded-md hover:bg-surface"
            aria-label="ปิดเมนู"
            @click="open = false"
          >
            <Icon name="x" />
          </button>
        </div>
        <a
          v-for="item in items"
          :key="item.key"
          :href="item.href"
          :aria-current="item.key === active ? 'page' : undefined"
          class="flex items-center gap-3 rounded-md border-l-4 px-3 py-2 hover:bg-surface"
          :class="
            item.key === active ? 'border-brand bg-surface font-medium' : 'border-transparent'
          "
        >
          <Icon :name="item.icon" />{{ item.label }}
        </a>
      </nav>
    </div>
  </div>
</template>
