<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

export interface BuildItem {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  reason: string;
  requestedBy: string | null;
  requestedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  runUrl: string | null;
  error: string | null;
}

const latestBuild = ref<BuildItem | null>(null);
const loading = ref(true);
let pollTimer: ReturnType<typeof setInterval> | null = null;

function clearPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchLatestBuild() {
  try {
    const res = await fetch('/api/admin/builds?limit=1');
    if (!res.ok) return;
    const json = (await res.json()) as { data?: { items?: BuildItem[] } };
    const items = json?.data?.items;
    if (Array.isArray(items) && items.length > 0) {
      latestBuild.value = items[0];
      // Only keep polling while queued or running
      if (items[0].status === 'queued' || items[0].status === 'running') {
        if (!pollTimer) {
          pollTimer = setInterval(fetchLatestBuild, 4000);
        }
      } else {
        clearPolling();
      }
    } else {
      latestBuild.value = null;
      clearPolling();
    }
  } catch {
    // Network errors tolerated; keep existing state
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchLatestBuild();
});

onBeforeUnmount(() => {
  clearPolling();
});
</script>

<template>
  <div class="inline-flex items-center text-xs font-medium" role="status" aria-live="polite">
    <!-- Queued or Running -->
    <template v-if="latestBuild?.status === 'queued' || latestBuild?.status === 'running'">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-warning"
      >
        <span
          class="inline-block size-2 rounded-full border-2 border-warning border-t-transparent motion-safe:animate-spin"
          aria-hidden="true"
        />
        <span>กำลังอัปเดตเว็บไซต์…</span>
      </span>
    </template>

    <!-- Failed -->
    <template v-else-if="latestBuild?.status === 'failed'">
      <a
        href="/admin/#recent-builds"
        class="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-1 text-danger hover:underline focus:outline-none focus:ring-2 focus:ring-danger/50"
        title="การอัปเดตเว็บไซต์ไม่สำเร็จ คลิกเพื่อดูรายละเอียด"
      >
        <span class="inline-block size-2 rounded-full bg-danger" aria-hidden="true" />
        <span>อัปเดตไม่สำเร็จ</span>
      </a>
    </template>

    <!-- Succeeded or Default -->
    <template v-else>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-success"
      >
        <span class="inline-block size-2 rounded-full bg-success" aria-hidden="true" />
        <span>เว็บไซต์เป็นปัจจุบัน</span>
      </span>
    </template>
  </div>
</template>
