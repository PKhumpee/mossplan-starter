<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import FormField from '../ui/FormField.vue';
import Icon from '../ui/Icon.vue';
import Input from '../ui/Input.vue';
import Spinner from '../ui/Spinner.vue';

interface ArticleReference {
  id: string;
  title: string;
  slug: string;
  status: string;
}

interface AffiliateLinkDetail {
  id: string;
  slug: string;
  merchantId: string;
  merchantName: string;
  merchantDomain: string;
  destinationUrl?: string;
  fallbackUrl?: string | null;
  label: string;
  status: 'active' | 'paused' | 'broken';
  expiresAt: number | null;
  lastCheckedAt: number | null;
  lastCheckStatus: string | null;
  lastCheckHops: number | null;
  articles: ArticleReference[];
  createdAt: number;
  updatedAt: number;
}

interface Props {
  linkId: string;
  userRole?: 'owner' | 'admin' | 'editor';
}

const props = withDefaults(defineProps<Props>(), {
  userRole: 'admin',
});

const isAdmin = computed(() => props.userRole === 'admin' || props.userRole === 'owner');

const loading = ref(true);
const error = ref<string | null>(null);
const link = ref<AffiliateLinkDetail | null>(null);

// Form fields
const label = ref('');
const slug = ref('');
const destinationUrl = ref('');
const fallbackUrl = ref('');
const status = ref<'active' | 'paused' | 'broken'>('active');
const expiresAtStr = ref('');

const originalDestinationUrl = ref('');
const copied = ref(false);

const saving = ref(false);
const saveError = ref<string | null>(null);

// Checking link
const checking = ref(false);
const checkResult = ref<{ ok: boolean; status: string; hops: number } | null>(null);

// Deleting
const showDeleteDialog = ref(false);
const deleting = ref(false);

async function loadDetail() {
  loading.value = true;
  error.value = null;
  try {
    const data = await api<AffiliateLinkDetail>(`/api/admin/affiliate/links/${props.linkId}`);
    link.value = data;

    label.value = data.label;
    slug.value = data.slug;
    destinationUrl.value = data.destinationUrl || '';
    originalDestinationUrl.value = data.destinationUrl || '';
    fallbackUrl.value = data.fallbackUrl || '';
    status.value = data.status;
    if (data.expiresAt) {
      expiresAtStr.value = new Date(data.expiresAt).toISOString().slice(0, 10);
    } else {
      expiresAtStr.value = '';
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = err.message;
    } else {
      error.value = 'ไม่สามารถโหลดข้อมูลลิงก์ได้';
    }
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!isAdmin.value) return;
  if (!label.value.trim()) {
    saveError.value = 'กรุณาระบุชื่อป้ายกำกับลิงก์';
    return;
  }

  saving.value = true;
  saveError.value = null;

  try {
    let expiresAt: number | null = null;
    if (expiresAtStr.value) {
      expiresAt = new Date(expiresAtStr.value).getTime();
    }

    const payload: Record<string, unknown> = {
      label: label.value.trim(),
      slug: slug.value.trim(),
      fallbackUrl: fallbackUrl.value.trim() || null,
      status: status.value,
      expiresAt,
    };

    if (destinationUrl.value.trim() !== originalDestinationUrl.value) {
      payload.destinationUrl = destinationUrl.value.trim();
    }

    const updated = await api<AffiliateLinkDetail>(`/api/admin/affiliate/links/${props.linkId}`, {
      method: 'PATCH',
      body: payload,
    });

    toast.success('บันทึกข้อมูลลิงก์เรียบร้อยแล้ว');
    link.value = {
      ...link.value!,
      ...updated,
    };
    originalDestinationUrl.value = destinationUrl.value.trim();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      saveError.value = `${err.code}: ${err.message}`;
    } else {
      saveError.value = 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
    }
  } finally {
    saving.value = false;
  }
}

async function handleCheckNow() {
  if (!isAdmin.value || checking.value) return;
  checking.value = true;
  try {
    const res = await api<{ ok: boolean; lastCheckStatus: string; lastCheckHops: number }>(
      `/api/admin/affiliate/links/${props.linkId}/check`,
      { method: 'POST' },
    );
    checkResult.value = {
      ok: res.ok,
      status: res.lastCheckStatus,
      hops: res.lastCheckHops,
    };
    if (link.value) {
      link.value.lastCheckedAt = Date.now();
      link.value.lastCheckStatus = res.lastCheckStatus;
      link.value.lastCheckHops = res.lastCheckHops;
    }
    toast.success(`ตรวจสอบลิงก์เรียบร้อย (สถานะ ${res.lastCheckStatus})`);
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'ตรวจสอบลิงก์ไม่สำเร็จ');
  } finally {
    checking.value = false;
  }
}

async function handleDelete() {
  deleting.value = true;
  try {
    await api(`/api/admin/affiliate/links/${props.linkId}`, { method: 'DELETE' });
    toast.success('ลบลิงก์เรียบร้อยแล้ว');
    window.location.assign('/admin/affiliate/');
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'ลบลิงก์ไม่สำเร็จ');
  } finally {
    deleting.value = false;
  }
}

function copyGoUrl() {
  if (!link.value) return;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/go/${link.value.slug}/`;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    toast.success('คัดลอกลิงก์เรียบร้อยแล้ว');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}

function formatThaiDate(ms: number | null): string {
  if (!ms) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

onMounted(() => {
  loadDetail();
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8">
    <!-- Breadcrumb -->
    <div>
      <a
        href="/admin/affiliate/"
        class="inline-flex items-center gap-1 text-sm text-muted hover:text-text mb-3"
      >
        <Icon name="chevron-left" :size="16" />
        <span>กลับไปยังรายการลิงก์</span>
      </a>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-text">
            {{ isAdmin ? 'แก้ไขลิงก์ affiliate' : 'รายละเอียดลิงก์ affiliate' }}
          </h2>
          <p class="text-sm text-muted mt-1">
            ร้านค้า: <strong class="text-text">{{ link?.merchantName }}</strong> ({{
              link?.merchantDomain
            }})
          </p>
        </div>

        <div v-if="link" class="flex items-center gap-2">
          <Button variant="secondary" size="sm" @click="copyGoUrl">
            <Icon :name="copied ? 'check' : 'copy'" :size="14" />
            <span>{{ copied ? 'คัดลอกแล้ว' : 'คัดลอก /go/ URL' }}</span>
          </Button>

          <Button
            v-if="isAdmin"
            variant="secondary"
            size="sm"
            :loading="checking"
            @click="handleCheckNow"
          >
            <Icon name="history" :size="14" />
            <span>ตรวจลิงก์ตอนนี้</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center p-12 bg-surface rounded-xl border border-border"
    >
      <Spinner size="lg" />
      <p class="mt-4 text-sm text-muted">กำลังโหลดข้อมูลลิงก์...</p>
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
      <Button variant="secondary" @click="loadDetail">ลองใหม่อีกครั้ง</Button>
    </div>

    <!-- Form Content -->
    <div v-else-if="link" class="space-y-8">
      <!-- Main Settings Card -->
      <div class="rounded-xl border border-border bg-surface p-6 space-y-6 shadow-sm">
        <h3 class="text-base font-semibold text-text">ข้อมูลลิงก์</h3>

        <div class="space-y-4">
          <!-- Slug -->
          <div>
            <label class="block text-sm font-semibold text-text mb-1">Slug</label>
            <div class="flex items-center">
              <span
                class="px-3 py-2 border border-r-0 border-border bg-surface-elevated text-xs font-mono text-muted rounded-l-lg"
              >
                /go/
              </span>
              <input
                v-model="slug"
                :disabled="!isAdmin"
                type="text"
                class="flex-1 rounded-r-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-surface-elevated/50"
              />
            </div>
            <p class="text-xs text-muted mt-1">
              Slug จะคงเดิมเพื่อให้บทความที่เคยใส่ลิงก์นี้ไว้ไม่ต้องแก้ไขใหม่
            </p>
          </div>

          <!-- Label -->
          <div>
            <label class="block text-sm font-semibold text-text mb-1">ชื่อป้ายกำกับลิงก์</label>
            <Input v-model="label" :disabled="!isAdmin" />
          </div>

          <!-- Status -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-sm font-semibold text-text mb-1">สถานะลิงก์</label>
              <select
                v-model="status"
                :disabled="!isAdmin"
                class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-surface-elevated/50"
              >
                <option value="active">ใช้งานได้ (active)</option>
                <option value="paused">พักการใช้งาน (paused)</option>
                <option value="broken">ลิงก์เสีย (broken)</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-semibold text-text mb-1">วันหมดอายุ</label>
              <input
                v-model="expiresAtStr"
                :disabled="!isAdmin"
                type="date"
                class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-surface-elevated/50"
              />
            </div>
          </div>

          <!-- Destination URL (Admin only) -->
          <div v-if="isAdmin">
            <label class="block text-sm font-semibold text-text mb-1">
              URL ปลายทางของโปรแกรม (Destination URL)
            </label>
            <Input v-model="destinationUrl" />
            <p class="text-xs text-muted mt-1">
              หากแก้ไข URL ปลายทาง ระบบจะตรวจสอบความปลอดภัยและตรวจการเปลี่ยนเส้นทางใหม่อีกครั้ง
            </p>
          </div>

          <!-- Fallback URL (Admin only) -->
          <div v-if="isAdmin">
            <label class="block text-sm font-semibold text-text mb-1"
              >URL สำรอง (Fallback URL)</label
            >
            <Input v-model="fallbackUrl" placeholder="https://..." />
            <p class="text-xs text-muted mt-1">
              ส่งผู้อ่านไปหน้านี้เมื่อลิงก์ถูกพักการใช้งานหรือมีปัญหา
            </p>
          </div>
        </div>

        <!-- Check Result info -->
        <div class="rounded-lg bg-surface-elevated border border-border p-4 text-xs space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-muted">ตรวจเช็กสถานะล่าสุด:</span>
            <span class="font-medium text-text">{{ formatThaiDate(link.lastCheckedAt) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted">รหัสตอบกลับ (HTTP status):</span>
            <span class="font-mono font-semibold">{{ link.lastCheckStatus || '-' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted">จำนวนการเปลี่ยนเส้นทาง (Hops):</span>
            <span class="font-mono">{{
              link.lastCheckHops !== null ? link.lastCheckHops : '-'
            }}</span>
          </div>
        </div>

        <div
          v-if="saveError"
          class="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2"
        >
          <Icon name="alert" :size="18" class="shrink-0 mt-0.5" />
          <span>{{ saveError }}</span>
        </div>

        <div v-if="isAdmin" class="flex items-center justify-between pt-2">
          <Button variant="danger" @click="showDeleteDialog = true"> ลบลิงก์ </Button>

          <Button variant="primary" :loading="saving" @click="handleSave"> บันทึกการแก้ไข </Button>
        </div>
      </div>

      <!-- Articles Using This Link -->
      <div class="rounded-xl border border-border bg-surface p-6 space-y-4 shadow-sm">
        <h3 class="text-base font-semibold text-text">
          บทความที่ใช้ลิงก์นี้ ({{ link.articles.length }})
        </h3>

        <div v-if="link.articles.length === 0" class="text-sm text-muted py-4 text-center">
          ยังไม่มีบทความใดใส่ลิงก์ affiliate นี้
        </div>

        <ul v-else class="divide-y divide-border">
          <li
            v-for="article in link.articles"
            :key="article.id"
            class="py-3 flex items-center justify-between gap-4"
          >
            <div>
              <div class="font-medium text-sm text-text">{{ article.title }}</div>
              <div class="text-xs text-muted font-mono">/articles/{{ article.slug }}/</div>
            </div>
            <div class="flex items-center gap-2">
              <Badge :variant="article.status === 'published' ? 'success' : 'neutral'">
                {{ article.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง' }}
              </Badge>
              <a
                :href="`/admin/articles/${article.id}/`"
                class="p-1.5 text-muted hover:text-brand transition-colors rounded hover:bg-surface-elevated"
                title="แก้ไขบทความ"
              >
                <Icon name="chevron-right" :size="16" />
              </a>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Confirm Delete Dialog -->
    <ConfirmDialog
      v-model:open="showDeleteDialog"
      title="ยืนยันการลบลิงก์ affiliate"
      description="หากมีบทความที่เผยแพร่แล้วกำลังใช้งานลิงก์นี้ ระบบจะไม่อนุญาตให้ลบ คุณต้องนำลิงก์ออกจากบทความหรือยกเลิกการเผยแพร่ก่อน"
      confirm-text="ลบลิงก์"
      variant="danger"
      :loading="deleting"
      @confirm="handleDelete"
    />
  </div>
</template>
