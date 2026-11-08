<script setup lang="ts">
// Label + hint + error around any custom control. The control gets `id`, `describedBy` and `invalid`
// through slot props. Input, Textarea and Select already include the same structure.
import { computed, useId } from 'vue';
import Icon from './Icon.vue';

const props = defineProps<{ label: string; hint?: string; error?: string; required?: boolean }>();

const uid = useId();
const controlId = computed(() => `${uid}-control`);
const describedBy = computed(
  () =>
    [props.hint ? `${uid}-hint` : '', props.error ? `${uid}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined,
);
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="controlId" class="text-sm font-medium">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>
    <slot :id="controlId" :described-by="describedBy" :invalid="Boolean(error)" />
    <p v-if="hint" :id="`${uid}-hint`" class="text-sm text-muted">{{ hint }}</p>
    <p v-if="error" :id="`${uid}-error`" class="flex items-center gap-1 text-sm text-danger">
      <Icon name="alert" :size="16" />{{ error }}
    </p>
  </div>
</template>
