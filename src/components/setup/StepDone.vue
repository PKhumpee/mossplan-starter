<script setup lang="ts">
import { onMounted } from 'vue';
import { t, type Locale } from '../../shared/i18n';
import Mossbit from './Mossbit.vue';

const props = withDefaults(
  defineProps<{
    locale: Locale;
    redirectUrl?: string;
  }>(),
  {
    redirectUrl: '/admin',
  },
);

function handleFinish() {
  if (typeof window !== 'undefined') {
    window.location.href = props.redirectUrl;
  }
}

onMounted(() => {
  const timer = setTimeout(() => {
    handleFinish();
  }, 2000);
  return () => clearTimeout(timer);
});
</script>

<template>
  <div class="text-center py-6 space-y-6">
    <div class="flex justify-center">
      <Mossbit :size="80" variant="normal" />
    </div>

    <div class="space-y-2">
      <h2 class="text-h2 font-bold text-text">
        {{ t(locale, 'setup.success.completed') }}
      </h2>
      <p class="text-body text-muted">
        {{ t(locale, 'setup.success.redirect') }}
      </p>
    </div>

    <div class="pt-4 flex justify-center">
      <button
        type="button"
        @click="handleFinish"
        class="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-6 py-2.5 text-body-sm font-semibold text-brand-contrast shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span>{{ t(locale, 'setup.action.finish') }}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </div>
  </div>
</template>
