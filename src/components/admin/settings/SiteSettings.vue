<script setup lang="ts">
import { computed, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Button from '../ui/Button.vue';
import BuildConnection from './BuildConnection.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import Modal from '../ui/Modal.vue';

interface Props {
  initialAllowIndexing: boolean;
  hardOverride?: boolean;
  isWorkersDev?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  initialAllowIndexing: false,
  hardOverride: false,
  isWorkersDev: false,
});

const allowIndexing = ref(props.initialAllowIndexing);
const saving = ref(false);

// Confirm enable indexing modal with checklist
const showEnableModal = ref(false);
const showDisableConfirm = ref(false);

// Pre-launch checklist state
const checklist = ref({
  domainHttps: false,
  legalPages: false,
  sitemapRobots: false,
  analyticsReady: false,
  launchReady: false,
});

const allChecked = computed(() => {
  return (
    checklist.value.domainHttps &&
    checklist.value.legalPages &&
    checklist.value.sitemapRobots &&
    checklist.value.analyticsReady &&
    checklist.value.launchReady
  );
});

function handleToggleClick() {
  if (props.hardOverride || props.isWorkersDev) {
    return;
  }
  if (!allowIndexing.value) {
    // Turning ON -> Show checklist modal
    checklist.value = {
      domainHttps: false,
      legalPages: false,
      sitemapRobots: false,
      analyticsReady: false,
      launchReady: false,
    };
    showEnableModal.value = true;
  } else {
    // Turning OFF -> Show confirm dialog
    showDisableConfirm.value = true;
  }
}

async function updateIndexingSetting(nextValue: boolean) {
  saving.value = true;
  try {
    const res = await api<{ allow_indexing: boolean }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ allow_indexing: nextValue }),
    });
    allowIndexing.value = res.allow_indexing;
    toast.success(
      nextValue
        ? 'เปิดให้ Search Engine เก็บข้อมูลเรียบร้อยแล้ว'
        : 'ปิดการเก็บข้อมูลจาก Search Engine เรียบร้อยแล้ว',
    );
    showEnableModal.value = false;
    showDisableConfirm.value = false;
    // Reload page after brief delay to update layout banners
    setTimeout(() => {
      window.location.reload();
    }, 600);
  } catch (err: unknown) {
    const msg = err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า';
    toast.error(msg);
  } finally {
    saving.value = false;
  }
}

function confirmEnable() {
  updateIndexingSetting(true);
}

function confirmDisable() {
  updateIndexingSetting(false);
}
</script>

<template>
  <div class="space-y-6 max-w-4xl">
    <!-- Notice Banners if locked by env or host -->
    <div
      v-if="hardOverride"
      class="rounded-xl border border-warning bg-warning/10 p-5 text-text"
      role="note"
    >
      <h3 class="font-bold text-body">สวิตช์ถูกล็อกโดย PUBLIC_NOINDEX=true</h3>
      <p class="mt-1 text-body-sm text-text-secondary">
        ในไฟล์ <code>wrangler.jsonc</code> มีการกำหนด
        <code>PUBLIC_NOINDEX: "true"</code> เป็นฮาร์ดโค้ด ระบบจะส่งคำสั่งไม่ให้เก็บข้อมูล (noindex)
        ตลอดเวลาจนกว่าจะปรับเป็น <code>"false"</code> ในคอนฟิก
      </p>
    </div>

    <div
      v-else-if="isWorkersDev"
      class="rounded-xl border border-warning bg-warning/10 p-5 text-text"
      role="note"
    >
      <h3 class="font-bold text-body">โฮสต์ทดสอบ *.workers.dev ปิด Indexing อัตโนมัติ</h3>
      <p class="mt-1 text-body-sm text-text-secondary">
        ระบบจะส่ง X-Robots-Tag: noindex บนโดเมน *.workers.dev
        เสมอเพื่อป้องกันไม่ให้หน้าทดสอบติดอันดับใน Google การเปิด Indexing จะมีผลบน Custom Domain
        เท่านั้น
      </p>
    </div>

    <!-- Main Setting Card -->
    <div class="rounded-xl border border-border bg-surface p-6 shadow-card">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-lg font-bold text-text">
            อนุญาตให้ Search Engine เก็บข้อมูลเว็บไซต์ (Allow Indexing)
          </h2>
          <p class="mt-1 text-body-sm text-text-secondary">
            ควบคุมการส่ง Header <code>X-Robots-Tag: noindex, nofollow</code> ไปยัง Search Engine
            (Google, Bing ฯลฯ)
          </p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <button
            type="button"
            role="switch"
            :aria-checked="allowIndexing"
            :disabled="saving || hardOverride || isWorkersDev"
            class="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="allowIndexing ? 'bg-brand' : 'bg-border'"
            @click="handleToggleClick"
          >
            <span class="sr-only">สลับสถานะ Indexing</span>
            <span
              class="pointer-events-none inline-block size-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
              :class="allowIndexing ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
          <span
            class="text-body-sm font-semibold"
            :class="allowIndexing ? 'text-brand' : 'text-muted'"
          >
            {{ allowIndexing ? 'เปิดอยู่' : 'ปิดอยู่' }}
          </span>
        </div>
      </div>

      <!-- Current Status Explanation -->
      <div class="mt-6 border-t border-border pt-4">
        <div v-if="allowIndexing" class="flex items-start gap-3 text-body-sm text-text">
          <span
            class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 font-bold text-xs"
            >✓</span
          >
          <div>
            <p class="font-medium">สถานะปัจจุบัน: เว็บไซต์เปิดให้ค้นหาได้ (Indexing Enabled)</p>
            <p class="text-muted mt-0.5">
              หน้าเว็บสาธารณะจะไม่ส่ง <code>X-Robots-Tag: noindex</code> และอนุญาตให้ Search Engine
              เก็บเนื้อหาไปแสดงในผลการค้นหาได้ตามปกติ
            </p>
          </div>
        </div>
        <div v-else class="flex items-start gap-3 text-body-sm text-text">
          <span
            class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-600 font-bold text-xs"
            >!</span
          >
          <div>
            <p class="font-medium text-red-600">สถานะปัจจุบัน: ปิดการเก็บข้อมูล (Noindex Active)</p>
            <p class="text-muted mt-0.5">
              Worker จะส่ง HTTP Header <code>X-Robots-Tag: noindex, nofollow</code> สำหรับทุกคำขอ
              ป้องกันไม่ให้บอทค้นหาบันทึกหน้าเว็บเข้าสู่ดัชนี
            </p>
          </div>
        </div>
      </div>
    </div>

    <BuildConnection />

    <!-- Pre-launch Checklist Modal (When enabling indexing) -->
    <Modal
      :open="showEnableModal"
      title="รายการตรวจสอบก่อนเปิดตัว (Pre-Launch Checklist)"
      size="md"
      @update:open="showEnableModal = $event"
    >
      <div class="space-y-4">
        <p class="text-body-sm text-text-secondary">
          การเปิดให้ Search Engine เก็บข้อมูลถือเป็นขั้นตอนสำคัญ
          กรุณาตรวจสอบรายการต่อไปนี้ก่อนยืนยัน:
        </p>

        <div class="space-y-3 rounded-lg border border-border bg-bg p-4">
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="checklist.domainHttps"
              type="checkbox"
              class="mt-1 size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span class="text-body-sm text-text">
              <strong>โดเมนจริงและ HTTPS:</strong> เว็บไซต์ผูกกับ Custom Domain และมีใบรับรอง
              SSL/HTTPS ทำงานเรียบร้อย
            </span>
          </label>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="checklist.legalPages"
              type="checkbox"
              class="mt-1 size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span class="text-body-sm text-text">
              <strong>หน้าข้อมูลทางกฎหมาย:</strong> นโยบายความเป็นส่วนตัว (Privacy),
              ข้อกำหนดการใช้งาน (Terms) และหน้าติดต่อ (Contact) มีข้อมูลครบถ้วน
            </span>
          </label>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="checklist.sitemapRobots"
              type="checkbox"
              class="mt-1 size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span class="text-body-sm text-text">
              <strong>Robots.txt & Sitemap:</strong> ไฟล์ <code>robots.txt</code> และ
              <code>/sitemap-index.xml</code> สามารถเข้าถึงได้ถูกต้อง
            </span>
          </label>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="checklist.analyticsReady"
              type="checkbox"
              class="mt-1 size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span class="text-body-sm text-text">
              <strong>เครื่องมือวัดผล:</strong> เตรียมส่ง URL ไปยัง Google Search Console
              และระบบสถิติ Cloudflare Web Analytics
            </span>
          </label>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="checklist.launchReady"
              type="checkbox"
              class="mt-1 size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span class="text-body-sm text-text font-medium text-brand">
              <strong>ยืนยันความพร้อม:</strong>
              ยืนยันว่าเว็บไซต์พร้อมเปิดตัวสู่สาธารณะและยินยอมให้บอทค้นหาเริ่มทำดัชนี
            </span>
          </label>
        </div>
      </div>

      <template #footer>
        <Button variant="secondary" :disabled="saving" @click="showEnableModal = false">
          ยกเลิก
        </Button>
        <Button
          variant="primary"
          :disabled="!allChecked || saving"
          :loading="saving"
          @click="confirmEnable"
        >
          ยืนยันเปิด Indexing
        </Button>
      </template>
    </Modal>

    <!-- Disable Confirm Dialog -->
    <ConfirmDialog
      :open="showDisableConfirm"
      title="ยืนยันการปิด Indexing"
      message="คุณต้องการปิดการเก็บข้อมูลจาก Search Engine หรือไม่? เมื่อปิดแล้ว Worker จะเริ่มส่ง X-Robots-Tag: noindex, nofollow ทันทีเพื่อป้องกันไม่ให้หน้าเว็บติดผลการค้นหา"
      confirm-label="ยืนยันปิด Indexing"
      :loading="saving"
      :danger="true"
      @update:open="showDisableConfirm = $event"
      @confirm="confirmDisable"
    />
  </div>
</template>
