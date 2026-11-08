<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { t, type Locale, type MessageKey } from '../../shared/i18n';
import Mossbit from './Mossbit.vue';
import SetupSteps from './SetupSteps.vue';
import StepToken from './StepToken.vue';
import StepDetails, { type SetupDraft } from './StepDetails.vue';
import StepOtp from './StepOtp.vue';
import StepDone from './StepDone.vue';

const locale = ref<Locale>('th');
const step = ref<'token' | 'details' | 'otp' | 'done'>('token');
const initialChecking = ref(true);
const isCompleted = ref(false);
const loading = ref(false);
const error = ref('');

// In-memory token - never saved in URL or storage
const currentToken = ref('');

// Draft values
const draftValues = ref<Partial<SetupDraft>>({
  siteName: '',
  siteUrl: '',
  defaultLang: 'th',
  indexingEnabled: false,
  adminEmail: '',
  resendApiKey: '',
  emailFrom: null,
  turnstileSiteKey: '',
  turnstileSecretKey: '',
});

const isTestSender = ref(false);
const redirectUrl = ref('/admin');

function toggleLocale() {
  locale.value = locale.value === 'th' ? 'en' : 'th';
}

function resolveErrorMessage(
  code?: string,
  defaultKey: MessageKey = 'setup.error.invalid_input',
): string {
  if (
    code &&
    `setup.error.${code}` in
      {
        'setup.error.invalid_token': true,
        'setup.error.rate_limited': true,
        'setup.error.setup_unavailable': true,
        'setup.error.invalid_input': true,
        'setup.error.no_session': true,
        'setup.error.resend_failed': true,
        'setup.error.invalid_otp': true,
        'setup.error.setup_completed': true,
      }
  ) {
    return t(locale.value, `setup.error.${code}` as MessageKey);
  }
  return t(locale.value, defaultKey);
}

onMounted(async () => {
  try {
    const res = await fetch('/api/setup/status');
    if (res.ok) {
      const data = (await res.json()) as { completed?: boolean };
      if (data.completed) {
        isCompleted.value = true;
      }
    }
  } catch {
    // If status check fails, allow flow to proceed
  } finally {
    initialChecking.value = false;
  }
});

async function handleTokenSubmit(token: string) {
  loading.value = true;
  error.value = '';
  currentToken.value = token;

  try {
    const res = await fetch('/api/setup/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (res.status === 200) {
      step.value = 'details';
    } else if (res.status === 404) {
      isCompleted.value = true;
    } else {
      let code = '';
      try {
        const body = await res.json();
        code = body?.error?.code;
      } catch {
        // ignore parse error
      }
      if (res.status === 429) {
        error.value = t(locale.value, 'setup.error.rate_limited');
      } else if (res.status === 503) {
        error.value = t(locale.value, 'setup.error.setup_unavailable');
      } else {
        error.value = resolveErrorMessage(code, 'setup.error.invalid_token');
      }
    }
  } catch {
    error.value = t(locale.value, 'setup.error.invalid_token');
  } finally {
    loading.value = false;
  }
}

async function handleDetailsSubmit(draft: SetupDraft) {
  loading.value = true;
  error.value = '';
  draftValues.value = draft;

  try {
    const res = await fetch('/api/setup/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    });

    if (res.status === 200) {
      const data = (await res.json()) as { otpSent?: boolean; testSender?: boolean };
      isTestSender.value = Boolean(data.testSender);
      step.value = 'otp';
    } else if (res.status === 404) {
      isCompleted.value = true;
    } else {
      let code = '';
      try {
        const body = await res.json();
        code = body?.error?.code;
      } catch {
        // ignore
      }
      if (res.status === 401) {
        error.value = t(locale.value, 'setup.error.no_session');
      } else if (res.status === 502) {
        error.value = t(locale.value, 'setup.error.resend_failed');
      } else {
        error.value = resolveErrorMessage(code, 'setup.error.invalid_input');
      }
    }
  } catch {
    error.value = t(locale.value, 'setup.error.invalid_input');
  } finally {
    loading.value = false;
  }
}

async function handleOtpSubmit(otp: string) {
  loading.value = true;
  error.value = '';

  try {
    const res = await fetch('/api/setup/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ otp }),
    });

    if (res.status === 200) {
      const data = (await res.json()) as { completed?: boolean; redirect?: string };
      redirectUrl.value = data.redirect || '/admin';
      step.value = 'done';
    } else if (res.status === 404) {
      isCompleted.value = true;
    } else {
      let code = '';
      try {
        const body = await res.json();
        code = body?.error?.code;
      } catch {
        // ignore
      }
      error.value = resolveErrorMessage(code, 'setup.error.invalid_otp');
    }
  } catch {
    error.value = t(locale.value, 'setup.error.invalid_otp');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="w-full max-w-xl mx-auto rounded-lg border border-border bg-surface p-6 sm:p-8 shadow-card"
  >
    <!-- Top toolbar: Language switch -->
    <div class="flex items-center justify-between pb-4 border-b border-border">
      <div class="flex items-center gap-3">
        <Mossbit :size="32" variant="normal" />
        <span class="font-mono text-body-sm font-bold tracking-tight text-text">mossplan</span>
      </div>

      <button
        type="button"
        @click="toggleLocale"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-caption font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        :aria-label="locale === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'"
      >
        <span class="font-mono">{{ locale === 'th' ? 'EN' : 'TH' }}</span>
      </button>
    </div>

    <!-- 404 / Already Completed View -->
    <div v-if="isCompleted" class="py-10 text-center space-y-6">
      <div class="flex justify-center">
        <Mossbit :size="80" variant="404" />
      </div>

      <div class="space-y-2">
        <h1 class="text-h1 font-bold text-text">404</h1>
        <p class="text-body font-medium text-text">
          {{ t(locale, 'setup.error.setup_completed') }}
        </p>
      </div>

      <div class="pt-4 flex justify-center">
        <a
          href="/admin/"
          class="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-6 py-2.5 text-body-sm font-semibold text-brand-contrast shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span>{{ t(locale, 'setup.action.finish') }}</span>
        </a>
      </div>
    </div>

    <!-- Active Setup Flow -->
    <div v-else-if="!initialChecking">
      <!-- Header -->
      <div v-if="step !== 'done'" class="text-center pt-4 pb-2">
        <h1 class="text-h2 font-bold text-text">
          {{ t(locale, 'setup.title') }}
        </h1>
        <p class="mt-1.5 text-body-sm text-muted">
          {{ t(locale, 'setup.intro') }}
        </p>
      </div>

      <!-- Step Indicator -->
      <SetupSteps v-if="step !== 'done'" :current-step="step" :locale="locale" />

      <!-- Step Content -->
      <div class="mt-6">
        <!-- Step 1: Token -->
        <StepToken
          v-if="step === 'token'"
          :locale="locale"
          :loading="loading"
          :error="error"
          @submit="handleTokenSubmit"
        />

        <!-- Step 2: Details -->
        <StepDetails
          v-else-if="step === 'details'"
          :locale="locale"
          :loading="loading"
          :error="error"
          :initial-values="draftValues"
          @back="step = 'token'"
          @submit="handleDetailsSubmit"
        />

        <!-- Step 3: OTP -->
        <StepOtp
          v-else-if="step === 'otp'"
          :locale="locale"
          :admin-email="draftValues.adminEmail || ''"
          :test-sender="isTestSender"
          :loading="loading"
          :error="error"
          @back="step = 'details'"
          @submit="handleOtpSubmit"
        />

        <!-- Step 4: Done -->
        <StepDone v-else-if="step === 'done'" :locale="locale" :redirect-url="redirectUrl" />
      </div>
    </div>

    <!-- Initial loading state -->
    <div v-else class="py-16 text-center">
      <div class="inline-flex items-center justify-center">
        <svg
          class="size-8 animate-spin text-brand"
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
      </div>
    </div>
  </div>
</template>
