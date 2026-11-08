<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import Badge from '../ui/Badge.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';

interface DashboardCardData {
  brokenLinksCount: number;
  expiringLinksCount: number;
  d1WritesToday: {
    written: number;
    budget: number;
    percent: number;
  };
}

const loading = ref(true);
const error = ref<string | null>(null);
const data = ref<DashboardCardData | null>(null);

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api<DashboardCardData>('/api/admin/affiliate/dashboard');
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = err.message;
    } else {
      error.value = 'ไม่สามารถโหลดข้อมูลสถิติ affiliate ได้';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="rounded-xl border border-border bg-surface p-6 shadow-sm">
    <div class="flex items-center justify-between pb-4 border-b border-border">
      <div class="flex items-center gap-2">
        <div class="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon name="link" :size="18" />
        </div>
        <div>
          <h3 class="font-semibold text-text text-sm">สถานะ Affiliate & โควตา D1</h3>
          <p class="text-xs text-muted">ตรวจสอบความสมบูรณ์ของลิงก์และงบประมาณ D1 รายวัน</p>
        </div>
      </div>

      <a
        href="/admin/affiliate/"
        class="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
      >
        <span>จัดการลิงก์</span>
        <Icon name="chevron-right" :size="14" />
      </a>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-6 flex justify-center">
      <Spinner size="md" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="py-4 text-xs text-danger text-center">
      {{ error }}
    </div>

    <!-- Content -->
    <div v-else-if="data" class="pt-4 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <!-- Broken Links -->
        <div
          class="p-3 rounded-lg border text-left"
          :class="
            data.brokenLinksCount > 0
              ? 'border-danger/30 bg-danger/5'
              : 'border-border bg-surface-elevated/40'
          "
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted">ลิงก์เสีย (Broken)</span>
            <Badge :variant="data.brokenLinksCount > 0 ? 'danger' : 'neutral'">
              {{ data.brokenLinksCount }}
            </Badge>
          </div>
          <p class="text-[11px] text-muted mt-2">
            {{
              data.brokenLinksCount > 0 ? 'ต้องแก้ไข URL ปลายทางโดยด่วน' : 'ทุกลิงก์ทำงานได้ปกติ'
            }}
          </p>
        </div>

        <!-- Expiring Links -->
        <div
          class="p-3 rounded-lg border text-left"
          :class="
            data.expiringLinksCount > 0
              ? 'border-warning/30 bg-warning/5'
              : 'border-border bg-surface-elevated/40'
          "
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted">ใกล้หมดอายุ (14 วัน)</span>
            <Badge :variant="data.expiringLinksCount > 0 ? 'warning' : 'neutral'">
              {{ data.expiringLinksCount }}
            </Badge>
          </div>
          <p class="text-[11px] text-muted mt-2">
            {{
              data.expiringLinksCount > 0 ? 'ตรวจสอบโปรโมชั่นที่จะสิ้นสุด' : 'ไม่มีลิงก์ใกล้หมดอายุ'
            }}
          </p>
        </div>
      </div>

      <!-- D1 Writes Budget Progress -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted">D1 Row Writes วันนี้ (บันทึกคลิก affiliate)</span>
          <span class="font-mono font-medium text-text">
            {{ data.d1WritesToday.written.toLocaleString() }} /
            {{ data.d1WritesToday.budget.toLocaleString() }} ({{ data.d1WritesToday.percent }}%)
          </span>
        </div>

        <div
          class="h-2 w-full bg-surface-elevated rounded-full overflow-hidden border border-border"
        >
          <div
            class="h-full transition-all duration-300 rounded-full"
            :class="data.d1WritesToday.percent >= 50 ? 'bg-warning' : 'bg-brand'"
            :style="{ width: `${Math.min(100, Math.max(2, data.d1WritesToday.percent))}%` }"
          ></div>
        </div>

        <p
          v-if="data.d1WritesToday.percent >= 50"
          class="text-[11px] text-warning flex items-center gap-1"
        >
          <Icon name="alert" :size="12" />
          <span>การเขียน D1 เกิน 50% ของโควตาฟรีประจำวันแล้ว</span>
        </p>
      </div>
    </div>
  </div>
</template>
