<script setup lang="ts">
import { computed } from 'vue';

export type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger';
export type ArticleStatus = 'draft' | 'scheduled' | 'published' | 'failed';

const props = defineProps<{ tone?: BadgeTone; status?: ArticleStatus }>();

const STATUS: Record<ArticleStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: 'neutral', label: 'ฉบับร่าง' },
  scheduled: { tone: 'warning', label: 'ตั้งเวลาเผยแพร่' },
  published: { tone: 'success', label: 'เผยแพร่แล้ว' },
  failed: { tone: 'danger', label: 'ไม่สำเร็จ' },
};

const tone = computed<BadgeTone>(() =>
  props.status ? STATUS[props.status].tone : (props.tone ?? 'neutral'),
);

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'text-muted border-border bg-surface',
  warning: 'text-warning border-warning/40 bg-warning/10',
  success: 'text-success border-success/40 bg-success/10',
  danger: 'text-danger border-danger/40 bg-danger/10',
};
</script>

<template>
  <!-- Always text plus colour, never colour alone. -->
  <span
    class="inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium"
    :class="TONE_CLASS[tone]"
  >
    <slot>{{ status ? STATUS[status].label : '' }}</slot>
  </span>
</template>
