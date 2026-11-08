<script setup lang="ts">
import { ref } from 'vue';
import { t, type Locale } from '../../shared/i18n';

const props = defineProps<{
  locale: Locale;
  loading: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: 'submit', token: string): void;
}>();

const token = ref('');
const showToken = ref(false);

function handleSubmit() {
  const val = token.value.trim();
  if (!val || props.loading) return;
  emit('submit', val);
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <div>
      <h2 class="text-h3 font-bold text-text">
        {{ t(locale, 'setup.step.verify') }}
      </h2>
      <p class="mt-1 text-body-sm text-muted">
        {{ t(locale, 'setup.step.verifyDescription') }}
      </p>
    </div>

    <!-- Error notice -->
    <div
      v-if="error"
      role="alert"
      aria-live="polite"
      class="rounded-md border border-danger/40 bg-surface p-3.5 text-body-sm text-danger"
    >
      {{ error }}
    </div>

    <!-- Token input field -->
    <div class="space-y-2">
      <label for="setup-token" class="block text-body-sm font-medium text-text">
        {{ t(locale, 'setup.field.token') }}
        <span class="text-danger" aria-hidden="true">*</span>
      </label>

      <div class="relative">
        <input
          id="setup-token"
          v-model="token"
          :type="showToken ? 'text' : 'password'"
          name="token"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          required
          :placeholder="t(locale, 'setup.field.tokenPlaceholder')"
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 pr-10 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <button
          type="button"
          @click="showToken = !showToken"
          class="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-r-md"
          :aria-label="showToken ? 'Hide token' : 'Show token'"
        >
          <svg
            v-if="showToken"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
            />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="pt-2">
      <button
        type="submit"
        :disabled="loading || !token.trim()"
        class="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-body-sm font-semibold text-brand-contrast shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <svg
          v-if="loading"
          class="size-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>
          {{ loading ? t(locale, 'setup.status.verifying') : t(locale, 'setup.action.continue') }}
        </span>
      </button>
    </div>
  </form>
</template>
