<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { turnstileErrorMessage } from './turnstile-error';

const props = defineProps<{
  turnstileSiteKey?: string;
  nextUrl?: string;
}>();

const step = ref<'email' | 'otp'>('email');
const email = ref('');
const otpDigits = ref<string[]>(['', '', '', '', '', '']);
const otpInputs = ref<HTMLInputElement[]>([]);
const turnstileContainer = ref<HTMLElement | null>(null);
let turnstileWidgetId: string | null = null;
const turnstileToken = ref('');
let turnstileFailure = '';

const loading = ref(false);
const error = ref('');
const notice = ref('');
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

function renderTurnstile() {
  if (
    typeof window !== 'undefined' &&
    props.turnstileSiteKey &&
    turnstileContainer.value &&
    !turnstileWidgetId &&
    (window as any).turnstile
  ) {
    try {
      turnstileWidgetId = (window as any).turnstile.render(turnstileContainer.value, {
        sitekey: props.turnstileSiteKey,
        callback: (token: string) => {
          turnstileToken.value = token;
          // A retry can succeed after an earlier failure was shown.
          if (error.value === turnstileFailure) error.value = '';
          turnstileFailure = '';
        },
        'error-callback': (code: string) => {
          turnstileToken.value = '';
          turnstileFailure = turnstileErrorMessage(code, window.location.hostname);
          error.value = turnstileFailure;
        },
      });
    } catch (e) {
      console.warn('[turnstile] render warning:', e);
    }
  }
}

/** Turnstile accepts a token once, so every send needs a new one. */
function replaceSpentTurnstileToken() {
  if (!turnstileToken.value) return;
  turnstileToken.value = '';
  try {
    (window as any).turnstile.reset(turnstileWidgetId);
  } catch (e) {
    console.warn('[turnstile] reset warning:', e);
  }
}

onMounted(() => {
  renderTurnstile();
  // Poll for turnstile script load if not ready immediately
  if (props.turnstileSiteKey && !(window as any).turnstile) {
    const checkInterval = setInterval(() => {
      if ((window as any).turnstile) {
        clearInterval(checkInterval);
        renderTurnstile();
      }
    }, 300);
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

function startCountdown() {
  countdown.value = 60;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--;
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

async function sendOtp() {
  const normalized = email.value.trim().toLowerCase();
  if (!normalized || !normalized.includes('@') || !normalized.includes('.')) {
    error.value = 'กรุณากรอกอีเมลให้ถูกต้อง';
    return;
  }

  // The server rejects a send without a token, so say why instead of showing its 400.
  if (props.turnstileSiteKey && !turnstileToken.value) {
    error.value = turnstileFailure || 'ระบบตรวจสอบความปลอดภัยยังไม่พร้อม รอสักครู่แล้วลองอีกครั้ง';
    return;
  }

  loading.value = true;
  error.value = '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (turnstileToken.value) {
    headers['cf-turnstile-response'] = turnstileToken.value;
  }

  try {
    const res = await fetch('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: normalized,
        type: 'sign-in',
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || 'ส่งรหัสยืนยันไม่สำเร็จ');
    }

    // Always transition to Step 2 and show neutral message (never leak invite existence per DESIGN §10.1)
    step.value = 'otp';
    notice.value = 'ถ้าอีเมลนี้อยู่ในทีม คุณจะได้รับรหัสยืนยัน 6 หลักภายใน 1 นาที';
    startCountdown();
    await nextTick();
    otpInputs.value[0]?.focus();
  } catch (err: any) {
    error.value = err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
  } finally {
    loading.value = false;
    replaceSpentTurnstileToken();
  }
}

function onDigitInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const val = input.value;

  if (val.length > 1) {
    // Take the last entered character
    otpDigits.value[index] = val.slice(-1);
  }

  if (otpDigits.value[index] && index < 5) {
    otpInputs.value[index + 1]?.focus();
  }

  // If all 6 digits are filled, automatically verify
  const fullCode = otpDigits.value.join('');
  if (fullCode.length === 6) {
    verifyOtp();
  }
}

function onKeyDown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace' && !otpDigits.value[index] && index > 0) {
    otpInputs.value[index - 1]?.focus();
  }
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text') || '';
  const digits = text.replace(/\D/g, '').slice(0, 6).split('');

  digits.forEach((d, i) => {
    if (i < 6) otpDigits.value[i] = d;
  });

  const nextFocusIndex = Math.min(digits.length, 5);
  otpInputs.value[nextFocusIndex]?.focus();

  if (digits.length === 6) {
    verifyOtp();
  }
}

async function verifyOtp() {
  const code = otpDigits.value.join('');
  if (code.length !== 6) {
    error.value = 'กรุณากรอกรหัสยืนยัน 6 หลักให้ครบถ้วน';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const res = await fetch('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim().toLowerCase(),
        otp: code,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว');
    }

    // Success: redirect to sanitized destination
    const destination = props.nextUrl || '/admin/';
    window.location.assign(destination);
  } catch (err: any) {
    error.value = err.message || 'รหัสยืนยันไม่ถูกต้อง ลองใหม่อีกครั้ง';
    otpDigits.value = ['', '', '', '', '', ''];
    otpInputs.value[0]?.focus();
  } finally {
    loading.value = false;
  }
}

function resetToEmail() {
  step.value = 'email';
  error.value = '';
  notice.value = '';
  otpDigits.value = ['', '', '', '', '', ''];
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notice message -->
    <div
      v-if="notice"
      class="rounded-xl border border-brand/20 bg-brand-subdued/20 p-4 text-body-sm text-brand-deep leading-relaxed"
    >
      {{ notice }}
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-body-sm text-danger leading-relaxed"
    >
      {{ error }}
    </div>

    <!-- STEP 1: Enter Email -->
    <form v-if="step === 'email'" @submit.prevent="sendOtp" class="space-y-4">
      <div>
        <label for="email" class="block text-body-sm font-semibold text-text mb-1.5">
          อีเมลทีมงาน
        </label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autofocus
          autocomplete="email"
          placeholder="yourname@example.com"
          class="w-full rounded-xl border border-border-input bg-bg px-4 py-2.5 text-body text-text placeholder:text-muted focus-visible:border-brand focus-visible:outline-none transition-colors"
        />
      </div>

      <button
        type="submit"
        :disabled="loading"
        class="w-full min-h-[44px] rounded-full bg-brand px-6 py-2.5 text-body-sm font-semibold text-brand-contrast shadow-sm transition-all hover:bg-brand-deep hover:shadow-card disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span
          v-if="loading"
          class="size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
        ></span>
        <span>ส่งรหัสยืนยัน</span>
      </button>
    </form>

    <!-- STEP 2: Enter 6-digit OTP -->
    <form v-else @submit.prevent="verifyOtp" class="space-y-6">
      <div>
        <label class="block text-body-sm font-semibold text-text mb-3 text-center">
          กรอกรหัสยืนยัน 6 หลัก
        </label>
        <div class="flex justify-center gap-2 sm:gap-3" @paste="onPaste">
          <input
            v-for="(_, i) in otpDigits"
            :key="i"
            ref="otpInputs"
            v-model="otpDigits[i]"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="1"
            autocomplete="one-time-code"
            class="size-11 sm:size-12 rounded-xl border border-border-input bg-bg text-center text-h3 font-bold text-text focus-visible:border-brand focus-visible:outline-none shadow-sm transition-all tabular-nums"
            @input="onDigitInput(i, $event)"
            @keydown="onKeyDown(i, $event)"
          />
        </div>
      </div>

      <button
        type="submit"
        :disabled="loading || otpDigits.join('').length !== 6"
        class="w-full min-h-[44px] rounded-full bg-brand px-6 py-2.5 text-body-sm font-semibold text-brand-contrast shadow-sm transition-all hover:bg-brand-deep hover:shadow-card disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span
          v-if="loading"
          class="size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
        ></span>
        <span>ยืนยันและเข้าสู่ระบบ</span>
      </button>

      <div class="flex items-center justify-between text-caption pt-2 border-t border-border">
        <button
          type="button"
          :disabled="countdown > 0 || loading"
          @click="sendOtp"
          class="font-semibold text-brand hover:text-brand-deep disabled:text-muted disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="countdown > 0" class="tabular-nums"
            >ส่งรหัสใหม่ได้ใน ({{ countdown }}วิ)</span
          >
          <span v-else>ส่งรหัสใหม่อีกครั้ง</span>
        </button>

        <button
          type="button"
          @click="resetToEmail"
          class="text-muted hover:text-text transition-colors"
        >
          เปลี่ยนอีเมล
        </button>
      </div>
    </form>

    <!-- Stays mounted across both steps so a resend can get a new token -->
    <div v-if="props.turnstileSiteKey" class="flex justify-center">
      <div ref="turnstileContainer"></div>
    </div>
  </div>
</template>
