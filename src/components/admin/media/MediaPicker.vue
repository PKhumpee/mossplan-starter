<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import { downscaleImageBeforeUpload } from '../../../lib/media/client-downscale';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import Modal from '../ui/Modal.vue';

export interface PickedMedia {
  id: string;
  alt: string;
  width: number;
  height: number;
  url: string;
}

export interface MediaItem {
  id: string;
  r2Key: string;
  filename: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  uploadedBy: string | null;
  createdAt: number;
  url: string;
}

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  select: [media: PickedMedia];
}>();

const activeTab = ref<'library' | 'upload'>('library');
const loading = ref(false);
const items = ref<MediaItem[]>([]);
const selectedItem = ref<MediaItem | null>(null);
const currentAlt = ref('');
const savingAlt = ref(false);

// Filter
const searchQuery = ref('');
const onlyMissingAlt = ref(false);

// Upload state
const uploadStatus = ref('');
const uploading = ref(false);
const uploadAlt = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

async function loadMedia() {
  loading.value = true;
  try {
    const query: Record<string, any> = { limit: 50 };
    if (searchQuery.value.trim()) query.q = searchQuery.value.trim();
    if (onlyMissingAlt.value) query.missingAlt = true;

    const res = await api<{ items: MediaItem[] }>('/api/admin/media', { query });
    items.value = res.items || [];
  } catch (err: any) {
    console.error('[MediaPicker] failed to load media:', err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      loadMedia();
      selectedItem.value = null;
      currentAlt.value = '';
    }
  },
);

function selectItem(item: MediaItem) {
  selectedItem.value = item;
  currentAlt.value = item.alt || '';
}

async function saveCurrentAlt() {
  if (!selectedItem.value) return;
  savingAlt.value = true;
  try {
    const updated = await api<MediaItem>(`/api/admin/media/${selectedItem.value.id}`, {
      method: 'PATCH',
      body: { alt: currentAlt.value.trim() },
    });
    selectedItem.value.alt = updated.alt;
    const idx = items.value.findIndex((m) => m.id === updated.id);
    if (idx !== -1) items.value[idx]!.alt = updated.alt;
    toast.success('บันทึกข้อความแทนภาพเรียบร้อย');
  } catch (err: any) {
    toast.error('บันทึกข้อความแทนภาพไม่สำเร็จ');
  } finally {
    savingAlt.value = false;
  }
}

async function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  const originalFile = files[0]!;
  uploading.value = true;
  uploadStatus.value = 'กำลังเตรียมไฟล์...';

  try {
    const processedFile = await downscaleImageBeforeUpload(originalFile, (msg) => {
      uploadStatus.value = msg;
    });

    uploadStatus.value = 'กำลังอัปโหลดไปยังคลาวด์...';

    const form = new FormData();
    form.append('file', processedFile);
    form.append('alt', uploadAlt.value.trim());

    const res = await api<MediaItem>('/api/admin/media', {
      method: 'POST',
      body: form,
    });

    items.value.unshift(res);
    selectItem(res);
    activeTab.value = 'library';
    uploadAlt.value = '';
    if (fileInput.value) fileInput.value.value = '';
    toast.success('อัปโหลดรูปภาพสำเร็จ');
  } catch (err: any) {
    toast.error(err.message || 'อัปโหลดไม่สำเร็จ');
  } finally {
    uploading.value = false;
    uploadStatus.value = '';
  }
}

function confirmSelection() {
  if (!selectedItem.value) return;
  if (!currentAlt.value.trim()) {
    toast.error('กรุณาระบุข้อความแทนภาพ (Alt text) ก่อนเลือก');
    return;
  }

  // If alt was modified in input, update it
  if (currentAlt.value.trim() !== selectedItem.value.alt) {
    saveCurrentAlt();
  }

  emit('select', {
    id: selectedItem.value.id,
    alt: currentAlt.value.trim(),
    width: selectedItem.value.width ?? 1200,
    height: selectedItem.value.height ?? 800,
    url: `/api/admin/media/${selectedItem.value.id}/file`,
  });

  emit('update:open', false);
}
</script>

<template>
  <Modal
    :open="open"
    title="เลือกรูปภาพจากคลังสื่อ"
    size="lg"
    @update:open="emit('update:open', $event)"
    @close="emit('update:open', false)"
  >
    <div class="space-y-4">
      <!-- Tabs (Library / Upload) -->
      <div class="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-lg text-body-sm font-bold transition-all',
            activeTab === 'library'
              ? 'bg-brand text-brand-contrast'
              : 'text-text-secondary hover:bg-surface',
          ]"
          @click="activeTab = 'library'"
        >
          คลังรูปภาพ
        </button>
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-lg text-body-sm font-bold transition-all',
            activeTab === 'upload'
              ? 'bg-brand text-brand-contrast'
              : 'text-text-secondary hover:bg-surface',
          ]"
          @click="activeTab = 'upload'"
        >
          + อัปโหลดรูปภาพใหม่
        </button>
      </div>

      <!-- 1. LIBRARY TAB -->
      <div v-if="activeTab === 'library'" class="space-y-4">
        <!-- Search & Filter -->
        <div class="flex items-center gap-3">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="ค้นหาชื่อไฟล์ หรือคำอธิบาย..."
            class="flex-1 rounded-xl border border-border-input bg-bg px-3.5 py-1.5 text-body-sm text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
            @input="loadMedia"
          />
          <button
            type="button"
            :class="[
              'px-3 py-1.5 rounded-xl border text-caption font-semibold whitespace-nowrap transition-colors',
              onlyMissingAlt
                ? 'bg-warning/10 text-warning border-warning/40'
                : 'bg-surface text-muted border-border hover:bg-bg',
            ]"
            @click="
              onlyMissingAlt = !onlyMissingAlt;
              loadMedia();
            "
          >
            ⚠️ ไม่มี Alt Text
          </button>
        </div>

        <!-- Thumbnail Grid + Selected Details Sidebar -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
          <!-- Thumbnail Grid (8 cols) -->
          <div
            class="sm:col-span-8 max-h-96 overflow-y-auto p-1 rounded-xl border border-border bg-surface/30"
          >
            <div v-if="loading" class="py-16 text-center text-muted">กำลังโหลดรูปภาพ...</div>
            <div v-else-if="items.length === 0" class="py-16 text-center text-muted">
              ไม่พบรูปภาพในคลังสื่อ
            </div>
            <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              <button
                v-for="item in items"
                :key="item.id"
                type="button"
                :class="[
                  'group relative aspect-square rounded-xl overflow-hidden border-2 bg-surface focus:outline-none transition-all',
                  selectedItem?.id === item.id
                    ? 'border-brand ring-2 ring-brand/30 shadow-md'
                    : 'border-transparent hover:border-border',
                ]"
                @click="selectItem(item)"
              >
                <img
                  :src="`/api/admin/media/${item.id}/file`"
                  :alt="item.alt || item.filename"
                  loading="lazy"
                  class="size-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <span
                  v-if="!item.alt"
                  class="absolute top-1 right-1 rounded-md bg-warning/90 px-1 py-0.5 text-[0.65rem] font-bold text-white shadow"
                  title="ไม่มี Alt text"
                >
                  !
                </span>
              </button>
            </div>
          </div>

          <!-- Selected Preview & Alt Editor (4 cols) -->
          <div class="sm:col-span-4 rounded-xl border border-border bg-bg p-3.5 space-y-3">
            <div v-if="selectedItem" class="space-y-3">
              <!-- Thumbnail Preview -->
              <div
                class="aspect-video w-full rounded-lg overflow-hidden bg-surface border border-border"
              >
                <img
                  :src="`/api/admin/media/${selectedItem.id}/file`"
                  :alt="selectedItem.alt"
                  class="size-full object-contain"
                />
              </div>

              <!-- Metadata -->
              <div class="text-[0.75rem] text-muted space-y-0.5 font-mono">
                <p class="truncate font-semibold text-text">{{ selectedItem.filename }}</p>
                <p>
                  {{ selectedItem.width }} × {{ selectedItem.height }} px ({{
                    Math.round(selectedItem.bytes / 1024)
                  }}
                  KB)
                </p>
              </div>

              <!-- Alt Text (REQUIRED) -->
              <div class="space-y-1">
                <div class="flex justify-between items-center">
                  <label class="block text-caption font-bold text-text">
                    ข้อความแทนภาพ (Alt Text) <span class="text-danger">*</span>
                  </label>
                </div>
                <textarea
                  v-model="currentAlt"
                  rows="2"
                  placeholder="อธิบายว่าภาพนี้คืออะไรสำหรับผู้พิการทางสายตาและ SEO..."
                  class="w-full rounded-lg border border-border-input bg-bg p-2 text-caption text-text focus-visible:border-brand resize-none"
                  @blur="saveCurrentAlt"
                ></textarea>
                <p v-if="!currentAlt.trim()" class="text-[0.7rem] text-danger">
                  * ต้องระบุ Alt text เพื่อความสมบูรณ์ด้านการเข้าถึง (Accessibility)
                </p>
              </div>

              <!-- Select Button -->
              <Button
                variant="primary"
                size="md"
                class="w-full"
                type="button"
                :disabled="!currentAlt.trim()"
                @click="confirmSelection"
              >
                เลือกรูปภาพนี้
              </Button>
            </div>
            <div v-else class="py-12 text-center text-caption text-muted">
              คลิกเลือกรูปภาพจากรายการทางซ้าย
            </div>
          </div>
        </div>
      </div>

      <!-- 2. UPLOAD TAB -->
      <div v-else class="space-y-4">
        <div
          class="rounded-2xl border-2 border-dashed border-border bg-surface/40 p-8 text-center space-y-3"
        >
          <div
            class="mx-auto size-12 rounded-full bg-brand/10 text-brand flex items-center justify-center"
          >
            <Icon name="photo" :size="24" />
          </div>
          <div>
            <p class="font-bold text-text text-body">ลากรูปภาพมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
            <p class="text-caption text-muted mt-1">
              รองรับ JPEG, PNG, WebP, AVIF, GIF (ระบบจะย่อขนาดเหลือสูงสุด 2400px และลบพิกัด GPS
              อัตโนมัติ)
            </p>
          </div>

          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            class="hidden"
            @change="handleFileUpload"
          />

          <Button
            variant="secondary"
            size="md"
            type="button"
            :disabled="uploading"
            @click="fileInput?.click()"
          >
            {{ uploading ? uploadStatus : 'เลือกไฟล์จากอุปกรณ์' }}
          </Button>

          <div v-if="uploadStatus" class="text-caption font-semibold text-brand animate-pulse">
            {{ uploadStatus }}
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text">
            ข้อความแทนภาพเริ่มต้น (Alt text)
          </label>
          <input
            v-model="uploadAlt"
            type="text"
            placeholder="เช่น ภาพถ่ายเราเตอร์ Wi-Fi สีขาวบนโต๊ะทำงาน"
            class="w-full rounded-xl border border-border-input bg-bg px-3.5 py-2 text-body-sm text-text focus-visible:border-brand shadow-sm"
          />
        </div>
      </div>
    </div>
  </Modal>
</template>
