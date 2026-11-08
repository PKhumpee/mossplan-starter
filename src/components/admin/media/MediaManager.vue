<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import { downscaleImageBeforeUpload } from '../../../lib/media/client-downscale';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import Icon from '../ui/Icon.vue';

interface MediaItem {
  id: string;
  r2Key: string;
  filename: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: number;
  url: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const loading = ref(true);
const items = ref<MediaItem[]>([]);
const pagination = ref<Pagination>({ page: 1, limit: 32, total: 0, totalPages: 1 });

// Filters
const searchQuery = ref('');
const onlyMissingAlt = ref(false);

// Active Selected Item for Details Side Panel
const activeItem = ref<MediaItem | null>(null);
const activeAlt = ref('');
const savingAlt = ref(false);

// Upload state
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadStatus = ref('');

// Delete confirmation
const showDeleteConfirm = ref(false);
const deleting = ref(false);

function formatThaiDate(ms: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

async function loadMedia(page = 1) {
  loading.value = true;
  try {
    const query: Record<string, any> = {
      page,
      limit: pagination.value.limit,
    };
    if (searchQuery.value.trim()) query.q = searchQuery.value.trim();
    if (onlyMissingAlt.value) query.missingAlt = true;

    const res = await api<{ items: MediaItem[]; pagination: Pagination }>('/api/admin/media', {
      query,
    });
    items.value = res.items || [];
    pagination.value = res.pagination || { page: 1, limit: 32, total: 0, totalPages: 1 };

    // Keep active item selected if still in list
    if (activeItem.value) {
      const match = items.value.find((m) => m.id === activeItem.value?.id);
      if (match) {
        activeItem.value = match;
        activeAlt.value = match.alt;
      }
    }
  } catch (err: any) {
    toast.error(err.message || 'โหลดคลังสื่อไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
}

function selectItem(item: MediaItem) {
  activeItem.value = item;
  activeAlt.value = item.alt || '';
}

async function saveAltText() {
  if (!activeItem.value) return;
  savingAlt.value = true;
  try {
    const updated = await api<MediaItem>(`/api/admin/media/${activeItem.value.id}`, {
      method: 'PATCH',
      body: { alt: activeAlt.value.trim() },
    });
    activeItem.value.alt = updated.alt;
    const idx = items.value.findIndex((m) => m.id === updated.id);
    if (idx !== -1) items.value[idx]!.alt = updated.alt;
    toast.success('บันทึกข้อความแทนภาพเรียบร้อยแล้ว');
  } catch (err: any) {
    toast.error('บันทึกไม่สำเร็จ');
  } finally {
    savingAlt.value = false;
  }
}

async function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  uploading.value = true;
  uploadStatus.value = 'กำลังเตรียมรูปภาพ...';

  try {
    for (let i = 0; i < files.length; i++) {
      const originalFile = files[i]!;
      const processed = await downscaleImageBeforeUpload(originalFile, (msg) => {
        uploadStatus.value = `${originalFile.name}: ${msg}`;
      });

      uploadStatus.value = `กำลังส่ง ${originalFile.name} ขึ้น R2...`;
      const form = new FormData();
      form.append('file', processed);

      const res = await api<MediaItem>('/api/admin/media', {
        method: 'POST',
        body: form,
      });

      items.value.unshift(res);
      selectItem(res);
    }

    toast.success(`อัปโหลดรูปภาพสำเร็จ (${files.length} รายการ)`);
    if (fileInput.value) fileInput.value.value = '';
  } catch (err: any) {
    toast.error(err.message || 'อัปโหลดรูปภาพไม่สำเร็จ');
  } finally {
    uploading.value = false;
    uploadStatus.value = '';
  }
}

async function confirmDeleteMedia() {
  if (!activeItem.value) return;
  const target = activeItem.value;
  deleting.value = true;

  try {
    await api(`/api/admin/media/${target.id}`, { method: 'DELETE' });
    items.value = items.value.filter((m) => m.id !== target.id);
    activeItem.value = null;
    showDeleteConfirm.value = false;
    toast.success(`ลบรูปภาพ "${target.filename}" เรียบร้อยแล้ว`);
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'MEDIA_IN_USE') {
      toast.error('ไม่สามารถลบได้: รูปภาพนี้กำลังถูกใช้งานอยู่ในบทความหรือโปรไฟล์สมาชิก');
    } else {
      toast.error(err.message || 'ลบไม่สำเร็จ');
    }
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  loadMedia(1);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Top Action Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div class="flex items-center gap-3 flex-1 max-w-lg">
        <!-- Search Input -->
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="ค้นหาชื่อไฟล์ หรือข้อความแทนภาพ..."
            class="w-full rounded-xl border border-border-input bg-bg px-4 py-2 text-body-sm text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
            @input="loadMedia(1)"
          />
        </div>

        <!-- Missing Alt Filter Chip -->
        <button
          type="button"
          :class="[
            'px-3.5 py-2 rounded-xl border text-caption font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5',
            onlyMissingAlt
              ? 'bg-warning/10 text-warning border-warning/40'
              : 'bg-surface text-muted border-border hover:bg-bg',
          ]"
          @click="
            onlyMissingAlt = !onlyMissingAlt;
            loadMedia(1);
          "
        >
          <span>⚠️</span>
          <span>ไม่มี Alt Text</span>
        </button>
      </div>

      <!-- Upload Button -->
      <div>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          class="hidden"
          @change="handleFileUpload"
        />
        <Button
          variant="primary"
          size="md"
          type="button"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          <Icon v-if="uploading" name="loader" class="animate-spin" />
          <Icon v-else name="plus" />
          {{ uploading ? uploadStatus : 'อัปโหลดรูปภาพ' }}
        </Button>
      </div>
    </div>

    <!-- Main Content Area: Grid + Side Panel (DESIGN §10.3) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Media Thumbnail Grid (8 or 12 cols) -->
      <div :class="['transition-all', activeItem ? 'lg:col-span-8' : 'lg:col-span-12']">
        <div class="rounded-2xl border border-border bg-bg p-4 sm:p-5 shadow-sm space-y-4">
          <div v-if="loading" class="py-24 text-center text-muted">
            กำลังโหลดรายการสื่อจาก R2...
          </div>
          <div v-else-if="items.length === 0" class="py-24 text-center space-y-3">
            <div
              class="mx-auto size-12 rounded-full bg-surface text-muted flex items-center justify-center"
            >
              <Icon name="photo" :size="24" />
            </div>
            <p class="text-text font-semibold">ไม่พบรูปภาพในคลังสื่อ</p>
            <p class="text-caption text-muted">
              คลิกปุ่ม "อัปโหลดรูปภาพ" ด้านบนเพื่อเพิ่มรูปภาพเข้าสู่ระบบ
            </p>
          </div>
          <div
            v-else
            :class="[
              'grid gap-3 sm:gap-4',
              activeItem
                ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'
                : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8',
            ]"
          >
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              :class="[
                'group relative aspect-square rounded-xl overflow-hidden border-2 bg-surface text-left focus:outline-none transition-all',
                activeItem?.id === item.id
                  ? 'border-brand ring-2 ring-brand/30 shadow-md scale-[0.98]'
                  : 'border-transparent hover:border-border hover:shadow-sm',
              ]"
              @click="selectItem(item)"
            >
              <img
                :src="item.url"
                :alt="item.alt || item.filename"
                loading="lazy"
                class="size-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <span
                v-if="!item.alt"
                class="absolute top-1.5 right-1.5 rounded-md bg-warning px-1.5 py-0.5 text-[0.65rem] font-bold text-white shadow"
                title="ไม่มีข้อความแทนภาพ (Missing Alt)"
              >
                !
              </span>
            </button>
          </div>

          <!-- Pagination -->
          <div
            v-if="pagination.totalPages > 1"
            class="pt-4 border-t border-border flex items-center justify-between text-caption text-muted"
          >
            <span
              >ทั้งหมด {{ pagination.total }} ไฟล์ (หน้า {{ pagination.page }} จาก
              {{ pagination.totalPages }})</span
            >
            <div class="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                :disabled="pagination.page <= 1"
                @click="loadMedia(pagination.page - 1)"
              >
                ← ก่อนหน้า
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="pagination.page >= pagination.totalPages"
                @click="loadMedia(pagination.page + 1)"
              >
                ถัดไป →
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Details Side Panel (DESIGN §10.3, 4 cols) -->
      <div v-if="activeItem" class="lg:col-span-4 lg:sticky lg:top-8">
        <div class="rounded-2xl border border-border bg-bg p-5 shadow-sm space-y-5">
          <!-- Header & Close Button -->
          <div class="flex items-center justify-between border-b border-border pb-3">
            <h3 class="font-bold text-text text-body-sm">รายละเอียดรูปภาพ</h3>
            <button
              type="button"
              class="p-1 rounded-lg text-muted hover:text-text hover:bg-surface"
              title="ปิดแถบด้านข้าง"
              @click="activeItem = null"
            >
              <Icon name="x" :size="18" />
            </button>
          </div>

          <!-- Large Preview -->
          <div
            class="aspect-video w-full rounded-xl overflow-hidden bg-surface border border-border"
          >
            <img :src="activeItem.url" :alt="activeItem.alt" class="size-full object-contain" />
          </div>

          <!-- Metadata Specifications -->
          <div
            class="space-y-2 text-caption font-mono bg-surface/50 p-3.5 rounded-xl border border-border"
          >
            <div class="flex justify-between">
              <span class="text-muted">ชื่อไฟล์:</span>
              <span
                class="font-semibold text-text truncate max-w-xs"
                :title="activeItem.filename"
                >{{ activeItem.filename }}</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-muted">มิติภาพ:</span>
              <span class="text-text"
                >{{ activeItem.width || '?' }} × {{ activeItem.height || '?' }} px</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-muted">ขนาดไฟล์:</span>
              <span class="text-text">{{ Math.round(activeItem.bytes / 1024) }} KB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">ประเภท MIME:</span>
              <span class="text-text">{{ activeItem.mime }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">อัปโหลดเมื่อ:</span>
              <span class="text-text">{{ formatThaiDate(activeItem.createdAt) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">ที่จัดเก็บบน R2:</span>
              <span class="text-text truncate max-w-xs" :title="activeItem.r2Key">{{
                activeItem.r2Key
              }}</span>
            </div>
          </div>

          <!-- Alt Text Editor (Required per Accessibility & SEO) -->
          <div class="space-y-1.5">
            <div class="flex justify-between items-center">
              <label class="block text-caption font-bold text-text">
                ข้อความแทนภาพ (Alt Text) <span class="text-danger">*</span>
              </label>
              <Badge v-if="activeAlt.trim()" variant="success">✓ มี Alt Text</Badge>
              <Badge v-else variant="warning">⚠️ ยังไม่มี Alt</Badge>
            </div>
            <textarea
              v-model="activeAlt"
              rows="3"
              placeholder="อธิบายรายละเอียดภาพอย่างกระชับ เช่น 'กราฟแท่งเปรียบเทียบสถิติการใช้งานอินเทอร์เน็ต'..."
              class="w-full rounded-xl border border-border-input bg-bg p-3 text-body-sm text-text focus-visible:border-brand resize-none leading-relaxed shadow-sm"
              @keydown.enter.ctrl="saveAltText"
            ></textarea>
            <p class="text-[0.7rem] text-muted">
              * สำคัญมากสำหรับ SEO ของ Google Discover และการเข้าถึงของผู้พิการทางสายตา (Screen
              Reader)
            </p>
            <div class="flex justify-end pt-1">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                :disabled="savingAlt"
                @click="saveAltText"
              >
                {{ savingAlt ? 'กำลังบันทึก...' : 'บันทึก Alt text' }}
              </Button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="pt-3 border-t border-border flex items-center justify-between">
            <a
              :href="activeItem.url"
              target="_blank"
              class="text-caption font-semibold text-brand hover:underline"
            >
              เปิดดูไฟล์ต้นฉบับ ↗
            </a>
            <Button variant="danger" size="sm" type="button" @click="showDeleteConfirm = true">
              ลบรูปภาพ
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      title="ยืนยันการลบไฟล์สื่อ"
      :message="`คุณต้องการลบ &quot;${activeItem?.filename}&quot; ออกจากระบบและ Cloudflare R2 ใช่หรือไม่? หากไฟล์นี้กำลังถูกใช้งานอยู่ในบทความ ระบบจะปฏิเสธการลบเพื่อความปลอดภัยของข้อมูล`"
      confirm-label="ลบไฟล์ถาวร"
      variant="danger"
      :loading="deleting"
      @confirm="confirmDeleteMedia"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>
