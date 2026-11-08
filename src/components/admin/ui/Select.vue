<script setup lang="ts">
import { computed, useId } from 'vue';
import Icon from './Icon.vue';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = defineProps<{
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Text of an empty first option, e.g. "ทั้งหมด". Omit for no empty option. */
  placeholder?: string;
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
    <label :for="id" class="text-sm font-medium">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>
    <select
      :id="id"
      v-model="model"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="h-9 w-full rounded-md border bg-bg px-2 text-fg disabled:opacity-60"
      :class="error ? 'border-danger' : 'border-border'"
    >
      <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">
        {{ o.label }}
      </option>
    </select>
    <p v-if="hint" :id="`${id}-hint`" class="text-sm text-muted">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="flex items-center gap-1 text-sm text-danger">
      <Icon name="alert" :size="16" />{{ error }}
    </p>
  </div>
</template>
