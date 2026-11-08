<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface AuditItem {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_LABELS: Record<
  string,
  { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  'article.create': { label: 'สร้างบทความร่าง', variant: 'neutral' },
  'article.update': { label: 'แก้ไขบทความ', variant: 'info' },
  'article.delete': { label: 'ลบบทความ', variant: 'danger' },
  'article.publish': { label: 'เผยแพร่บทความ', variant: 'success' },
  'article.unpublish': { label: 'ยกเลิกการเผยแพร่', variant: 'warning' },
  'article.review': { label: 'ตรวจทานบทความ', variant: 'success' },
  'article.review_clear': { label: 'ยกเลิกการตรวจทาน', variant: 'warning' },
  'profile.update': { label: 'อัปเดตโปรไฟล์', variant: 'info' },
  'team.invite': { label: 'เชิญสมาชิกใหม่', variant: 'info' },
  'team.invite_revoke': { label: 'ยกเลิกคำเชิญ', variant: 'warning' },
  'team.first_login': { label: 'เข้าสู่ระบบครั้งแรก', variant: 'success' },
  'team.role_change': { label: 'เปลี่ยนบทบาทสมาชิก', variant: 'warning' },
  'team.remove': { label: 'ลบสมาชิกจากทีม', variant: 'danger' },
};

const loading = ref(true);
const items = ref<AuditItem[]>([]);
const pagination = ref<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });

// Filters
const selectedAction = ref('');
const dateFrom = ref('');
const dateTo = ref('');

function formatThaiDateTime(ms: number): string {
  const d = new Date(ms);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

async function loadAuditLogs(page = 1) {
  loading.value = true;
  try {
    const query: Record<string, any> = {
      page,
      limit: pagination.value.limit,
    };

    if (selectedAction.value) query.action = selectedAction.value;
    if (dateFrom.value) query.from = new Date(dateFrom.value).getTime();
    if (dateTo.value) {
      // Set to end of day 23:59:59
      const d = new Date(dateTo.value);
      d.setHours(23, 59, 59, 999);
      query.to = d.getTime();
    }

    const res = await api<{ items: AuditItem[]; pagination: Pagination }>('/api/admin/audit', {
      query,
    });
    items.value = res.items;
    pagination.value = res.pagination;
  } catch (err: any) {
    toast.error(err.message || 'โหลดประวัติการใช้งานไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  selectedAction.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  loadAuditLogs(1);
}

onMounted(() => {
  loadAuditLogs(1);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Filter Toolbar -->
    <div class="rounded-2xl border border-border bg-bg p-4 sm:p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between border-b border-border pb-3">
        <h2 class="text-body-sm font-bold text-text flex items-center gap-2">
          <Icon name="history" :size="18" />
          <span>ตัวกรองประวัติการใช้งาน</span>
        </h2>
        <button
          type="button"
          class="text-caption text-brand hover:underline font-semibold"
          @click="resetFilters"
        >
          ล้างตัวกรองทั้งหมด
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Action Filter -->
        <div class="space-y-1.5">
          <label class="block text-caption font-semibold text-text">
            ประเภทการกระทำ (Action)
          </label>
          <select
            v-model="selectedAction"
            class="w-full rounded-xl border border-border-input bg-bg px-3 py-2 text-body-sm text-text focus-visible:border-brand shadow-sm cursor-pointer"
            @change="loadAuditLogs(1)"
          >
            <option value="">ทั้งหมดทุกการกระทำ</option>
            <option v-for="(val, key) in ACTION_LABELS" :key="key" :value="key">
              {{ val.label }} ({{ key }})
            </option>
          </select>
        </div>

        <!-- Date From -->
        <div class="space-y-1.5">
          <label class="block text-caption font-semibold text-text"> ตั้งแต่วันที่ </label>
          <input
            v-model="dateFrom"
            type="date"
            class="w-full rounded-xl border border-border-input bg-bg px-3 py-2 text-body-sm text-text focus-visible:border-brand shadow-sm"
            @change="loadAuditLogs(1)"
          />
        </div>

        <!-- Date To -->
        <div class="space-y-1.5">
          <label class="block text-caption font-semibold text-text"> ถึงวันที่ </label>
          <input
            v-model="dateTo"
            type="date"
            class="w-full rounded-xl border border-border-input bg-bg px-3 py-2 text-body-sm text-text focus-visible:border-brand shadow-sm"
            @change="loadAuditLogs(1)"
          />
        </div>
      </div>
    </div>

    <!-- Audit Logs Table (DESIGN §10.5) -->
    <div class="rounded-2xl border border-border bg-bg shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-body-sm border-collapse">
          <thead>
            <tr class="border-b border-border bg-surface text-caption text-muted">
              <th class="py-3 px-4 font-semibold">วัน-เวลา</th>
              <th class="py-3 px-4 font-semibold">ผู้ใช้งาน</th>
              <th class="py-3 px-4 font-semibold">การกระทำ (Action)</th>
              <th class="py-3 px-4 font-semibold">เป้าหมาย (Target)</th>
              <th class="py-3 px-4 font-semibold">รายละเอียดเสริม</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-if="loading" class="text-center">
              <td colspan="5" class="py-12 text-muted">กำลังโหลดประวัติการใช้งาน...</td>
            </tr>
            <tr v-else-if="items.length === 0" class="text-center">
              <td colspan="5" class="py-12 text-muted">
                ไม่พบข้อมูลประวัติการใช้งานตามเงื่อนไขที่เลือก
              </td>
            </tr>
            <tr
              v-for="log in items"
              v-else
              :key="log.id"
              class="hover:bg-surface/50 transition-colors"
            >
              <!-- Date & Time -->
              <td class="py-3.5 px-4 text-caption text-text font-mono whitespace-nowrap">
                {{ formatThaiDateTime(log.createdAt) }}
              </td>

              <!-- Actor -->
              <td class="py-3.5 px-4">
                <div v-if="log.actorName">
                  <div class="font-semibold text-text">{{ log.actorName }}</div>
                  <div class="text-[0.75rem] text-muted font-mono">{{ log.actorEmail }}</div>
                </div>
                <div v-else class="text-muted italic">ระบบอัตโนมัติ</div>
              </td>

              <!-- Action Badge -->
              <td class="py-3.5 px-4 whitespace-nowrap">
                <Badge :variant="ACTION_LABELS[log.action]?.variant || 'neutral'">
                  {{ ACTION_LABELS[log.action]?.label || log.action }}
                </Badge>
              </td>

              <!-- Target -->
              <td class="py-3.5 px-4 text-caption font-mono">
                <span class="text-muted">{{ log.targetType }}</span>
                <span v-if="log.targetId" class="text-text font-semibold ml-1"
                  >#{{ log.targetId.slice(0, 8) }}</span
                >
              </td>

              <!-- Meta Details -->
              <td class="py-3.5 px-4 text-caption text-muted font-mono max-w-xs truncate">
                <span v-if="log.meta">{{ JSON.stringify(log.meta) }}</span>
                <span v-else class="text-muted/60">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div
        v-if="pagination.totalPages > 1"
        class="p-4 border-t border-border flex items-center justify-between text-caption text-muted"
      >
        <span
          >ทั้งหมด {{ pagination.total }} รายการ (หน้า {{ pagination.page }} จาก
          {{ pagination.totalPages }})</span
        >
        <div class="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            :disabled="pagination.page <= 1"
            @click="loadAuditLogs(pagination.page - 1)"
          >
            ← หน้าก่อนหน้า
          </Button>
          <Button
            variant="secondary"
            size="sm"
            :disabled="pagination.page >= pagination.totalPages"
            @click="loadAuditLogs(pagination.page + 1)"
          >
            หน้าถัดไป →
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
