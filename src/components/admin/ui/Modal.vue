<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import { useFocusTrap } from '../../../admin-client/focus-trap';
import Icon from './Icon.vue';

const props = withDefaults(
  defineProps<{ open: boolean; title: string; size?: 'sm' | 'md' | 'lg' }>(),
  {
    size: 'md',
  },
);
const emit = defineEmits<{
  'update:open': [value: boolean];
  close: [];
}>();

const titleId = useId();
const panel = ref<HTMLElement | null>(null);
const active = ref(props.open);
useFocusTrap(panel, active);

let previousOverflow = '';
let locked = false;
function lockScroll(lock: boolean): void {
  if (lock && !locked) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    locked = true;
  } else if (!lock && locked) {
    document.body.style.overflow = previousOverflow;
    locked = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    active.value = isOpen;
    lockScroll(isOpen);
  },
  { immediate: true },
);
onBeforeUnmount(() => lockScroll(false));

function close(): void {
  emit('update:open', false);
  emit('close');
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
  }
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' } as const;
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      @keydown="onKeydown"
    >
      <div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="close" />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="relative flex max-h-full w-full flex-col rounded-lg border border-border bg-bg shadow-xl"
        :class="WIDTH[size]"
      >
        <header class="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <h2 :id="titleId" class="text-lg font-semibold">{{ title }}</h2>
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center rounded-md hover:bg-surface"
            aria-label="ปิด"
            @click="close"
          >
            <Icon name="x" />
          </button>
        </header>
        <div class="overflow-y-auto px-5 py-4"><slot /></div>
        <footer
          v-if="$slots.footer"
          class="flex justify-end gap-2 border-t border-border px-5 py-3"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
