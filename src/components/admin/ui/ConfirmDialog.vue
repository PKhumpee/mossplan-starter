<script setup lang="ts">
import Button from './Button.vue';
import Modal from './Modal.vue';

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** One sentence saying what will happen. */
    message: string;
    /** The explicit verb, e.g. "ลบบทความ" (never "ตกลง"). */
    confirmLabel: string;
    cancelLabel?: string;
    loading?: boolean;
    danger?: boolean;
  }>(),
  { cancelLabel: 'ยกเลิก', loading: false, danger: true },
);
defineEmits<{ 'update:open': [value: boolean]; confirm: [] }>();
</script>

<template>
  <Modal :open="open" :title="title" size="sm" @update:open="$emit('update:open', $event)">
    <p>{{ message }}</p>
    <template #footer>
      <!-- Focus starts on Cancel so Enter never destroys anything by accident. -->
      <Button data-autofocus :disabled="loading" @click="$emit('update:open', false)">
        {{ cancelLabel }}
      </Button>
      <Button :variant="danger ? 'danger' : 'primary'" :loading="loading" @click="$emit('confirm')">
        {{ confirmLabel }}
      </Button>
    </template>
  </Modal>
</template>
