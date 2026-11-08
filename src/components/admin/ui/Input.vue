<script setup lang="ts">
import { computed, useId } from 'vue';
import Icon from './Icon.vue';

const props = defineProps<{
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  maxlength?: number;
  autocomplete?: string;
  inputmode?: 'text' | 'numeric' | 'email' | 'url' | 'search';
}>();
const model = defineModel<string>({ default: '' });

const id = useId();
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-end justify-between gap-2">
      <label :for="id" class="text-sm font-medium">
        {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
      </label>
      <!-- Counter slot, e.g. "42/60" for the SEO title (DESIGN §9.4). -->
      <span class="text-sm text-muted"><slot name="counter" /></span>
    </div>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :required="required"
      :disabled="disabled"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="h-9 w-full rounded-md border bg-bg px-3 text-fg disabled:opacity-60"
      :class="error ? 'border-danger' : 'border-border'"
    />
    <p v-if="hint" :id="`${id}-hint`" class="text-sm text-muted">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="flex items-center gap-1 text-sm text-danger">
      <Icon name="alert" :size="16" />{{ error }}
    </p>
  </div>
</template>
