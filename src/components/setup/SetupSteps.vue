<script setup lang="ts">
import { computed } from 'vue';
import { t, type Locale } from '../../shared/i18n';

const props = defineProps<{
  currentStep: 'token' | 'details' | 'otp' | 'done';
  locale: Locale;
}>();

const steps = computed(() => [
  { id: 'token', name: t(props.locale, 'setup.step.verify'), index: 1 },
  { id: 'details', name: t(props.locale, 'setup.step.configure'), index: 2 },
  { id: 'otp', name: t(props.locale, 'setup.step.email'), index: 3 },
]);

const stepOrder = { token: 1, details: 2, otp: 3, done: 4 };

function getStatus(stepId: 'token' | 'details' | 'otp') {
  const currentNum = stepOrder[props.currentStep];
  const thisNum = stepOrder[stepId];
  if (currentNum > thisNum) return 'complete';
  if (currentNum === thisNum) return 'current';
  return 'upcoming';
}
</script>

<template>
  <nav :aria-label="t(locale, 'setup.title')" class="my-6 w-full">
    <ol class="flex items-center justify-between w-full">
      <li
        v-for="(step, idx) in steps"
        :key="step.id"
        class="relative flex flex-1 items-center"
        :class="{ 'flex-none': idx === steps.length - 1 }"
      >
        <div
          class="flex items-center gap-2 sm:gap-3"
          :aria-current="getStatus(step.id) === 'current' ? 'step' : undefined"
        >
          <!-- Step indicator circle -->
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-full text-caption font-semibold transition-colors"
            :class="{
              'bg-brand text-brand-contrast': getStatus(step.id) === 'complete',
              'border-2 border-brand bg-surface text-brand ring-2 ring-brand/20':
                getStatus(step.id) === 'current',
              'border border-border bg-surface text-muted': getStatus(step.id) === 'upcoming',
            }"
          >
            <!-- Checkmark for completed -->
            <svg
              v-if="getStatus(step.id) === 'complete'"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span v-else>{{ step.index }}</span>
          </span>

          <!-- Step label (responsive) -->
          <span
            class="text-caption font-medium sm:text-body-sm transition-colors"
            :class="{
              'text-text font-semibold': getStatus(step.id) === 'current',
              'text-text': getStatus(step.id) === 'complete',
              'text-muted': getStatus(step.id) === 'upcoming',
            }"
          >
            {{ step.name }}
          </span>
        </div>

        <!-- Connecting line -->
        <div
          v-if="idx < steps.length - 1"
          class="mx-2 h-0.5 flex-1 transition-colors sm:mx-4"
          :class="{
            'bg-brand': stepOrder[currentStep] > step.index,
            'bg-border': stepOrder[currentStep] <= step.index,
          }"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>
