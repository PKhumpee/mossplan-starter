<script setup lang="ts">
import { ref } from 'vue';
import { t, type Locale } from '../../shared/i18n';

export interface SetupDraft {
  siteName: string;
  siteUrl: string;
  defaultLang: 'th' | 'en';
  indexingEnabled: boolean;
  resendApiKey: string;
  emailFrom: string | null;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  adminEmail: string;
}

const props = defineProps<{
  locale: Locale;
  loading: boolean;
  error?: string;
  initialValues?: Partial<SetupDraft>;
}>();

const emit = defineEmits<{
  (e: 'submit', draft: SetupDraft): void;
  (e: 'back'): void;
}>();

const siteName = ref(props.initialValues?.siteName ?? '');
const siteUrl = ref(props.initialValues?.siteUrl ?? '');
const defaultLang = ref<'th' | 'en'>(props.initialValues?.defaultLang ?? 'th');
const indexingEnabled = ref(props.initialValues?.indexingEnabled ?? false);
const adminEmail = ref(props.initialValues?.adminEmail ?? '');
const resendApiKey = ref(props.initialValues?.resendApiKey ?? '');
const emailFrom = ref(props.initialValues?.emailFrom ?? '');
const turnstileSiteKey = ref(props.initialValues?.turnstileSiteKey ?? '');
const turnstileSecretKey = ref(props.initialValues?.turnstileSecretKey ?? '');

function handleSubmit() {
  if (props.loading) return;

  const normalizedSiteUrl = siteUrl.value.trim().replace(/\/+$/, '');
  const normalizedEmailFrom = emailFrom.value.trim() ? emailFrom.value.trim() : null;

  emit('submit', {
    siteName: siteName.value.trim(),
    siteUrl: normalizedSiteUrl,
    defaultLang: defaultLang.value,
    indexingEnabled: indexingEnabled.value,
    resendApiKey: resendApiKey.value.trim(),
    emailFrom: normalizedEmailFrom,
    turnstileSiteKey: turnstileSiteKey.value.trim(),
    turnstileSecretKey: turnstileSecretKey.value.trim(),
    adminEmail: adminEmail.value.trim().toLowerCase(),
  });
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-8">
    <div>
      <h2 class="text-h3 font-bold text-text">
        {{ t(locale, 'setup.step.configure') }}
      </h2>
      <p class="mt-1 text-body-sm text-muted">
        {{ t(locale, 'setup.step.configureDescription') }}
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

    <!-- Section: Site -->
    <fieldset class="space-y-4 rounded-md border border-border p-4 sm:p-5">
      <legend class="px-2 text-body-sm font-bold text-text">
        {{ t(locale, 'setup.section.site') }}
      </legend>

      <div class="space-y-2">
        <label for="setup-site-name" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.siteName') }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="setup-site-name"
          v-model="siteName"
          type="text"
          name="siteName"
          required
          :placeholder="t(locale, 'setup.field.siteNamePlaceholder')"
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <div class="space-y-2">
        <label for="setup-site-url" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.siteUrl') }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="setup-site-url"
          v-model="siteUrl"
          type="url"
          name="siteUrl"
          required
          :placeholder="t(locale, 'setup.field.siteUrlPlaceholder')"
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <div class="space-y-2">
        <label for="setup-default-lang" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.defaultLang') }}
        </label>
        <select
          id="setup-default-lang"
          v-model="defaultLang"
          name="defaultLang"
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <option value="th">{{ t(locale, 'setup.language.th') }}</option>
          <option value="en">{{ t(locale, 'setup.language.en') }}</option>
        </select>
      </div>

      <div class="pt-2">
        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input
            id="setup-indexing"
            v-model="indexingEnabled"
            type="checkbox"
            name="indexingEnabled"
            class="mt-1 size-4 rounded border-border-input text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand accent-brand"
          />
          <div>
            <span class="block text-body-sm font-medium text-text">
              {{ t(locale, 'setup.field.indexing') }}
            </span>
            <span class="block text-caption text-muted">
              {{ t(locale, 'setup.field.indexingHint') }}
            </span>
          </div>
        </label>
      </div>
    </fieldset>

    <!-- Section: Administrator Account -->
    <fieldset class="space-y-4 rounded-md border border-border p-4 sm:p-5">
      <legend class="px-2 text-body-sm font-bold text-text">
        {{ t(locale, 'setup.section.admin') }}
      </legend>

      <div class="space-y-2">
        <label for="setup-admin-email" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.adminEmail') }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="setup-admin-email"
          v-model="adminEmail"
          type="email"
          name="adminEmail"
          required
          :placeholder="t(locale, 'setup.field.adminEmailPlaceholder')"
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>
    </fieldset>

    <!-- Section: Email Delivery -->
    <fieldset class="space-y-4 rounded-md border border-border p-4 sm:p-5">
      <legend class="px-2 text-body-sm font-bold text-text">
        {{ t(locale, 'setup.section.email') }}
      </legend>

      <div class="space-y-2">
        <label for="setup-resend-key" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.resendApiKey') }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="setup-resend-key"
          v-model="resendApiKey"
          type="password"
          name="resendApiKey"
          autocomplete="off"
          spellcheck="false"
          required
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <div class="space-y-2">
        <label for="setup-email-from" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.emailFrom') }}
        </label>
        <input
          id="setup-email-from"
          v-model="emailFrom"
          type="text"
          name="emailFrom"
          :placeholder="t(locale, 'setup.field.emailFromPlaceholder')"
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <p class="text-caption text-muted">
          {{ t(locale, 'setup.field.emailFromHint') }}
        </p>
      </div>
    </fieldset>

    <!-- Section: Spam Protection (Turnstile) -->
    <fieldset class="space-y-4 rounded-md border border-border p-4 sm:p-5">
      <legend class="px-2 text-body-sm font-bold text-text">
        {{ t(locale, 'setup.section.security') }}
      </legend>

      <div class="space-y-2">
        <label for="setup-turnstile-site-key" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.turnstileSiteKey') }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="setup-turnstile-site-key"
          v-model="turnstileSiteKey"
          type="text"
          name="turnstileSiteKey"
          autocomplete="off"
          spellcheck="false"
          required
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <p class="text-caption text-muted">
          {{ t(locale, 'setup.field.turnstileSiteKeyHint') }}
        </p>
      </div>

      <div class="space-y-2">
        <label for="setup-turnstile-secret-key" class="block text-body-sm font-medium text-text">
          {{ t(locale, 'setup.field.turnstileSecretKey') }}
          <span class="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="setup-turnstile-secret-key"
          v-model="turnstileSecretKey"
          type="password"
          name="turnstileSecretKey"
          autocomplete="off"
          spellcheck="false"
          required
          class="w-full rounded-md border border-border-input bg-surface px-3.5 py-2.5 text-body-sm text-text placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>
    </fieldset>

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
        :disabled="loading"
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
          {{ loading ? t(locale, 'setup.status.sending') : t(locale, 'setup.action.saveAndSend') }}
        </span>
      </button>
    </div>
  </form>
</template>
