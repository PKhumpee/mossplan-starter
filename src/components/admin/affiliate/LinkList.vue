<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import EmptyState from '../ui/EmptyState.vue';
import Icon from '../ui/Icon.vue';
import Input from '../ui/Input.vue';
import Select from '../ui/Select.vue';
import Spinner from '../ui/Spinner.vue';
import AffiliateSubNav from './AffiliateSubNav.vue';

interface AffiliateLinkItem {
  id: string;
  slug: string;
  merchantId: string;
  merchantName: string;
  merchantDomain: string;
  label: string;
  status: 'active' | 'paused' | 'broken';
  expiresAt: number | null;
  lastCheckedAt: number | null;
  lastCheckStatus: string | null;
  lastCheckHops: number | null;
  clicks7d: number;
  clicks30d: number;
  createdAt: number;
  updatedAt: number;
  destinationUrl?: string;
  fallbackUrl?: string | null;
}

interface Props {
  userRole?: 'admin' | 'editor';
}

const props = withDefaults(defineProps<Props>(), {
  userRole: 'admin',
});

const isAdmin = computed(() => props.userRole === 'admin');

const loading = ref(true);
const error = ref<string | null>(null);
const links = ref<AffiliateLinkItem[]>([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);

// Filters
const search = ref('');
const statusFilter = ref<'all' | 'active' | 'paused' | 'broken'>('all');

// Copy feedback
const copiedSlug = ref<string | null>(null);

// Delete confirmation
const showDeleteDialog = ref(false);
const linkToDelete = ref<AffiliateLinkItem | null>(null);
const deleting = ref(false);

// Link check
const checkingLinkId = ref<string | null>(null);

async function loadLinks() {
  loading.value = true;
  error.value = null;
  try {
    const query: Record<string, string | number> = {
      page: page.value,
      limit: limit.value,
    };
    if (search.value.trim()) query.q = search.value.trim();
    if (statusFilter.value !== 'all') query.status = statusFilter.value;

    const res = await api<{
      items: AffiliateLinkItem[];
      total: number;
      page: number;
      limit: number;
    }>('/api/admin/affiliate/links', { query });

    links.value = res.items;
    total.value = res.total;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = err.message;
    } else {
      error.value = 'เกิดข้อผิดพลาดในการโหลดรายการลิงก์ กรุณาลองใหม่อีกครั้ง';
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadLinks();
}

function copyGoUrl(slug: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/go/${slug}/`;
  navigator.clipboard.writeText(url).then(() => {
    copiedSlug.value = slug;
    toast.success('คัดลอกลิงก์เรียบร้อยแล้ว');
    setTimeout(() => {
      if (copiedSlug.value === slug) copiedSlug.value = null;
    }, 2000);
  });
}

async function runCheckNow(link: AffiliateLinkItem) {
  if (!isAdmin.value || checkingLinkId.value) return;
  checkingLinkId.value = link.id;
  try {
    const res = await api<{ ok: boolean; lastCheckStatus: string; lastCheckHops: number }>(
      `/api/admin/affiliate/links/${link.id}/check`,
      { method: 'POST' },
    );
    link.lastCheckedAt = Date.now();
    link.lastCheckStatus = res.lastCheckStatus;
    link.lastCheckHops = res.lastCheckHops;
    toast.success(`ตรวจสอบลิงก์สำเร็จ (สถานะ ${res.lastCheckStatus})`);
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'ตรวจสอบลิงก์ไม่สำเร็จ');
  } finally {
    checkingLinkId.value = null;
  }
}

function confirmDelete(link: AffiliateLinkItem) {
  linkToDelete.value = link;
  showDeleteDialog.value = true;
}

async function executeDelete() {
  if (!linkToDelete.value) return;
  deleting.value = true;
  try {
    await api(`/api/admin/affiliate/links/${linkToDelete.value.id}`, { method: 'DELETE' });
    toast.success('ลบลิงก์ affiliate เรียบร้อยแล้ว');
    showDeleteDialog.value = false;
    linkToDelete.value = null;
    await loadLinks();
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'ลบลิงก์ไม่สำเร็จ');
  } finally {
    deleting.value = false;
  }
}

function formatThaiDate(ms: number | null): string {
  if (!ms) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ms));
}

function getExpiryClass(ms: number | null): string {
  if (!ms) return 'text-muted';
  const now = Date.now();
  if (ms < now) return 'text-danger font-medium';
  if (ms <= now + 14 * 86400_000) return 'text-warning font-medium';
  return 'text-muted';
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'paused') return 'warning';
  if (status === 'broken') return 'danger';
  return 'neutral';
}

function getStatusLabel(status: string): string {
  if (status === 'active') return 'ใช้งานได้';
  if (status === 'paused') return 'พักการใช้งาน';
  if (status === 'broken') return 'ลิงก์เสีย';
  return status;
}

onMounted(() => {
  loadLinks();
});
</script>

<template>
  <div class="space-y-6">
    <AffiliateSubNav active="links" :user-role="userRole" />

    <!-- Action & Filter Bar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div class="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div class="relative flex-1 max-w-md">
          <Input
            v-model="search"
            placeholder="ค้นหาชื่อป้ายกำกับ หรือ slug..."
            type="search"
            @keyup.enter="handleSearch"
          />
        </div>

        <div class="w-44">
          <select
            v-model="statusFilter"
            class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            @change="handleSearch"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="active">ใช้งานได้ (active)</option>
            <option value="paused">พักการใช้งาน (paused)</option>
            <option value="broken">ลิงก์เสีย (broken)</option>
          </select>
        </div>

        <Button variant="secondary" size="md" @click="handleSearch"> ค้นหา </Button>
      </div>

      <div v-if="isAdmin">
        <a
          href="/admin/affiliate/new/"
          class="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <Icon name="plus" :size="16" />
          <span>เพิ่มลิงก์</span>
        </a>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center p-12 bg-surface rounded-xl border border-border"
    >
      <Spinner size="lg" />
      <p class="mt-4 text-sm text-muted">กำลังโหลดรายการลิงก์ affiliate...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-8 text-center bg-surface rounded-xl border border-danger/30">
      <div
        class="inline-flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger mb-4"
      >
        <Icon name="alert" :size="24" />
      </div>
      <h3 class="text-base font-semibold text-text mb-2">ไม่สามารถโหลดข้อมูลได้</h3>
      <p class="text-sm text-muted mb-4">{{ error }}</p>
      <Button variant="secondary" @click="loadLinks">ลองใหม่อีกครั้ง</Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="links.length === 0" class="bg-surface rounded-xl border border-border p-8">
      <EmptyState
        title="ยังไม่มีลิงก์ affiliate"
        description="คุณสามารถเพิ่มลิงก์ affiliate ใหม่ผ่านขั้นตอนตรวจสอบอัตโนมัติ 3 ขั้นตอน"
      >
        <template #action v-if="isAdmin">
          <a
            href="/admin/affiliate/new/"
            class="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
          >
            <Icon name="plus" :size="16" />
            <span>เพิ่มลิงก์ใหม่ตอนนี้</span>
          </a>
        </template>
      </EmptyState>
    </div>

    <!-- Links Table -->
    <div v-else class="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-text border-collapse">
          <thead
            class="bg-surface-elevated border-b border-border text-xs uppercase tracking-wider text-muted"
          >
            <tr>
              <th scope="col" class="px-4 py-3 font-semibold">ลิงก์และป้ายกำกับ</th>
              <th scope="col" class="px-4 py-3 font-semibold">ร้านค้า</th>
              <th scope="col" class="px-4 py-3 font-semibold">สถานะ</th>
              <th scope="col" class="px-4 py-3 font-semibold text-right">คลิก (7/30 วัน)</th>
              <th scope="col" class="px-4 py-3 font-semibold">ตรวจล่าสุด</th>
              <th scope="col" class="px-4 py-3 font-semibold">วันหมดอายุ</th>
              <th scope="col" class="px-4 py-3 font-semibold text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="link in links"
              :key="link.id"
              class="hover:bg-surface-elevated/50 transition-colors"
            >
              <!-- Label and Go Slug -->
              <td class="px-4 py-3.5">
                <div class="font-medium text-text">{{ link.label }}</div>
                <div class="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <span
                    class="font-mono bg-surface-elevated px-1.5 py-0.5 rounded border border-border"
                  >
                    /go/{{ link.slug }}/
                  </span>
                  <button
                    type="button"
                    class="p-1 text-muted hover:text-brand transition-colors rounded"
                    :title="copiedSlug === link.slug ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'"
                    @click="copyGoUrl(link.slug)"
                  >
                    <Icon :name="copiedSlug === link.slug ? 'check' : 'copy'" :size="14" />
                  </button>
                </div>
              </td>

              <!-- Merchant -->
              <td class="px-4 py-3.5">
                <div class="font-medium">{{ link.merchantName }}</div>
                <div class="text-xs text-muted">{{ link.merchantDomain }}</div>
              </td>

              <!-- Status -->
              <td class="px-4 py-3.5">
                <Badge :variant="getStatusBadgeVariant(link.status)">
                  {{ getStatusLabel(link.status) }}
                </Badge>
              </td>

              <!-- Clicks 7d / 30d -->
              <td class="px-4 py-3.5 text-right font-mono">
                <span class="font-semibold text-text">{{ link.clicks7d }}</span>
                <span class="text-muted text-xs"> / {{ link.clicks30d }}</span>
              </td>

              <!-- Last Check -->
              <td class="px-4 py-3.5 text-xs text-muted">
                <div v-if="link.lastCheckedAt">
                  <span>{{ formatThaiDate(link.lastCheckedAt) }}</span>
                  <span
                    class="ml-1 inline-block px-1 rounded text-[10px]"
                    :class="
                      link.lastCheckStatus === '200'
                        ? 'bg-success/10 text-success'
                        : 'bg-danger/10 text-danger'
                    "
                  >
                    {{ link.lastCheckStatus || 'ตรวจแล้ว' }}
                  </span>
                </div>
                <div v-else>-</div>
              </td>

              <!-- Expiry -->
              <td class="px-4 py-3.5 text-xs" :class="getExpiryClass(link.expiresAt)">
                {{ formatThaiDate(link.expiresAt) }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3.5 text-right">
                <div class="inline-flex items-center gap-1">
                  <!-- Check Now (Admin only) -->
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="p-1.5 text-muted hover:text-brand transition-colors rounded hover:bg-surface-elevated disabled:opacity-50"
                    title="ตรวจลิงก์ตอนนี้"
                    :disabled="checkingLinkId === link.id"
                    @click="runCheckNow(link)"
                  >
                    <Spinner v-if="checkingLinkId === link.id" size="sm" />
                    <Icon v-else name="history" :size="16" />
                  </button>

                  <!-- Edit / View -->
                  <a
                    :href="`/admin/affiliate/${link.id}/`"
                    class="p-1.5 text-muted hover:text-brand transition-colors rounded hover:bg-surface-elevated"
                    :title="isAdmin ? 'แก้ไขลิงก์' : 'ดูรายละเอียด'"
                  >
                    <Icon name="chevron-right" :size="16" />
                  </a>

                  <!-- Delete (Admin only) -->
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="p-1.5 text-muted hover:text-danger transition-colors rounded hover:bg-danger/10"
                    title="ลบลิงก์"
                    @click="confirmDelete(link)"
                  >
                    <Icon name="x" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div
        v-if="total > limit"
        class="flex items-center justify-between border-t border-border px-4 py-3 bg-surface-elevated/30"
      >
        <span class="text-xs text-muted">
          แสดง {{ links.length }} จากทั้งหมด {{ total }} รายการ
        </span>
        <div class="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            :disabled="page <= 1"
            @click="
              page--;
              loadLinks();
            "
          >
            ก่อนหน้า
          </Button>
          <span class="text-xs font-medium px-2">{{ page }}</span>
          <Button
            variant="secondary"
            size="sm"
            :disabled="page * limit >= total"
            @click="
              page++;
              loadLinks();
            "
          >
            ถัดไป
          </Button>
        </div>
      </div>
    </div>

    <!-- Confirm Delete Dialog -->
    <ConfirmDialog
      v-model:open="showDeleteDialog"
      title="ยืนยันการลบลิงก์ affiliate"
      :description="`คุณต้องการลบลิงก์ &quot;${linkToDelete?.label}&quot; หรือไม่? หากลิงก์นี้ถูกใช้งานในบทความที่เผยแพร่อยู่ ระบบจะปฏิเสธการลบเพื่อความปลอดภัย`"
      confirm-text="ลบลิงก์"
      variant="danger"
      :loading="deleting"
      @confirm="executeDelete"
    />
  </div>
</template>
