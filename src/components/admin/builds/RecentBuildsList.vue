<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { toast } from '../../../admin-client/toast';
import Button from '../ui/Button.vue';
import EmptyState from '../ui/EmptyState.vue';
import Spinner from '../ui/Spinner.vue';

export interface BuildItem {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  reason: string;
  requestedBy: string | null;
  requestedByName?: string | null;
  requestedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  runUrl: string | null;
  error: string | null;
}

const props = withDefaults(
  defineProps<{
    limit?: number;
    canTriggerRebuild?: boolean;
  }>(),
  {
    limit: 5,
    canTriggerRebuild: false,
  },
);

const builds = ref<BuildItem[]>([]);
const loading = ref(true);
const triggering = ref(false);

function formatThaiDateTime(ms: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

function statusBadge(status: BuildItem['status']): { label: string; class: string } {
  switch (status) {
    case 'succeeded':
      return { label: 'สำเร็จ', class: 'border-success/40 bg-success/10 text-success' };
    case 'running':
      return { label: 'กำลังดำเนินการ', class: 'border-warning/40 bg-warning/10 text-warning' };
    case 'queued':
      return { label: 'อยู่ในคิว', class: 'border-border bg-surface text-muted' };
    case 'failed':
      return { label: 'ไม่สำเร็จ', class: 'border-danger/40 bg-danger/10 text-danger' };
  }
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'manual':
      return 'สั่งอัปเดตด้วยตนเอง';
    case 'article.publish':
      return 'เผยแพร่บทความ';
    case 'article.update':
      return 'แก้ไขบทความที่เผยแพร่แล้ว';
    case 'article.unpublish':
      return 'ยกเลิกการเผยแพร่บทความ';
    case 'publish-scheduled':
    case 'job.publish-scheduled':
      return 'เผยแพร่ตามเวลาที่ตั้งไว้';
    default:
      return reason;
  }
}

async function fetchBuilds() {
  loading.value = true;
  try {
    const res = await fetch(`/api/admin/builds?limit=${props.limit}`);
    if (!res.ok) return;
    const json = (await res.json()) as { data?: { items?: BuildItem[] } };
    builds.value = json?.data?.items ?? [];
  } catch {
    toast.error('ไม่สามารถโหลดข้อมูลประวัติการอัปเดตเว็บไซต์ได้');
  } finally {
    loading.value = false;
  }
}

async function handleTriggerRebuild() {
  triggering.value = true;
  try {
    const res = await fetch('/api/admin/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'manual' }),
    });

    if (res.ok) {
      toast.success('ส่งคำขออัปเดตเว็บไซต์เรียบร้อยแล้ว');
      await fetchBuilds();
    } else {
      const err = (await res.json()) as { error?: { message?: string } };
      toast.error(err.error?.message || 'ส่งคำขออัปเดตเว็บไซต์ไม่สำเร็จ');
    }
  } catch {
    toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
  } finally {
    triggering.value = false;
  }
}

onMounted(() => {
  fetchBuilds();
});
</script>

<template>
  <div id="recent-builds" class="rounded-xl border border-border bg-surface p-6 shadow-sm">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold text-text">การอัปเดตเว็บไซต์ล่าสุด</h2>
        <p class="text-xs text-muted">ประวัติการสร้างและนำส่งเนื้อหาขึ้นระบบ static site</p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          v-if="canTriggerRebuild"
          variant="secondary"
          size="sm"
          :loading="triggering"
          @click="handleTriggerRebuild"
        >
          อัปเดตเว็บไซต์ทันที
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-8">
      <Spinner size="md" />
    </div>

    <!-- Empty State -->
    <div v-else-if="builds.length === 0">
      <EmptyState
        title="ยังไม่มีประวัติการอัปเดตเว็บไซต์"
        description="เมื่อมีการเผยแพร่เนื้อหาหรือสั่งอัปเดต ประวัติจะแสดงที่นี่"
      />
    </div>

    <!-- Table of Builds -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-border text-xs text-muted">
          <tr>
            <th class="py-2.5 pr-4 font-medium">สถานะ</th>
            <th class="py-2.5 px-4 font-medium">เหตุผล</th>
            <th class="py-2.5 px-4 font-medium">เวลาที่ขอ</th>
            <th class="py-2.5 px-4 font-medium">ผู้ดำเนินการ</th>
            <th class="py-2.5 pl-4 font-medium">รายละเอียด</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/60">
          <tr v-for="b in builds" :key="b.id" class="hover:bg-bg/50">
            <td class="py-3 pr-4">
              <span
                class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                :class="statusBadge(b.status).class"
              >
                {{ statusBadge(b.status).label }}
              </span>
            </td>
            <td class="py-3 px-4 font-medium text-text">
              {{ reasonLabel(b.reason) }}
            </td>
            <td class="py-3 px-4 text-xs text-muted">
              {{ formatThaiDateTime(b.requestedAt) }}
            </td>
            <td class="py-3 px-4 text-xs text-muted">
              {{ b.requestedByName || (b.requestedBy ? 'ผู้ใช้' : 'ระบบอัตโนมัติ') }}
            </td>
            <td class="py-3 pl-4 text-xs">
              <div v-if="b.error" class="max-w-xs truncate text-danger" :title="b.error">
                {{ b.error }}
              </div>
              <a
                v-else-if="b.runUrl"
                :href="b.runUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-brand hover:underline"
              >
                ดูบน GitHub →
              </a>
              <span v-else class="text-muted">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
