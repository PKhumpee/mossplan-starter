<script setup lang="ts">
import { ref } from 'vue';
import { t, type Locale } from '../../shared/i18n';

const props = defineProps<{
  locale: Locale;
  adminEmail: string;
  testSender: boolean;
  loading: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: 'submit', otp: string): void;
  (e: 'back'): void;
}>();

const otp = ref('');

function handleSubmit() {
  const val = otp.value.trim();
  if (val.length !== 6 || props.loading) return;
  emit('submit', val);
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <div>
      <h2 class="text-h3 font-bold text-text">
        {{ t(locale, 'setup.step.email') }}
      </h2>
      <p class="mt-1 text-body-sm text-muted">
        {{ t(locale, 'setup.step.emailDescription') }}
      </p>
    </div>

    <!-- Test sender warning banner (D-010 item 3) -->
    <div
      v-if="testSender"
      role="note"
      class="rounded-md border border-brand/40 bg-surface p-4 text-body-sm text-text"
    >
      <div class="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-brand mt-0.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="space-y-1">
          <p class="font-medium text-text">
            {{ t(locale, 'setup.notice.testSender') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Success notice indicating OTP was dispatched -->
    <div
      role="status"
      class="rounded-md border border-border bg-bg p-3.5 text-body-sm text-muted flex items-center gap-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-brand shrink-0"
        aria-hidden="true"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      <span>
        {{ t(locale, 'setup.success.otpSent') }} (<strong>{{ adminEmail }}</strong
        >)
      </span>
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

    <!-- OTP input field -->
    <div class="space-y-2">
      <label for="setup-otp" class="block text-body-sm font-medium text-text">
        {{ t(locale, 'setup.field.otp') }}
        <span class="text-danger" aria-hidden="true">*</span>
      </label>
      <input
        id="setup-otp"
        v-model="otp"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{6}"
        maxlength="6"
        autocomplete="one-time-code"
        required
        :placeholder="t(locale, 'setup.field.otpPlaceholder')"
        class="w-full text-center tracking-[0.5em] font-mono text-xl sm:text-2xl font-bold rounded-md border border-border-input bg-surface px-4 py-3 text-text placeholder:tracking-normal placeholder:font-sans placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
    </div>

    <!-- Actions -->
    <div class="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
      <button
        type="button"
        @click="$emit('back')"
        :disabled="loading"
        class="inline-flex w-full sm:w-auto items-center justify-center rounded-md border border-border bg-surface px-4 py-2.5 text-body-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ t(locale, 'setup.action.back') }}
      </button>

      <button
        type="submit"
        :disabled="loading || otp.trim().length !== 6"
        class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-body-sm font-semibold text-brand-contrast shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
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
          {{ loading ? t(locale, 'setup.status.verifying') : t(locale, 'setup.action.verify') }}
        </span>
      </button>
    </div>
  </form>
</template>
