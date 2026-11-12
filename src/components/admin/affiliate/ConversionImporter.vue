<script setup lang="ts">
import { computed, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';
import AffiliateSubNav from './AffiliateSubNav.vue';

interface PreviewRow {
  rowNum: number;
  dateStr: string;
  merchantDomain: string;
  linkSlug?: string | null;
  externalId?: string | null;
  amountSatang?: number | null;
  commissionSatang: number;
  status: string;
}

interface RowReason {
  row: number;
  reason: string;
}

interface ImportResponse {
  imported: number;
  skipped: number;
  rejected: number;
  reasons: RowReason[];
  preview?: PreviewRow[];
}

interface Props {
  userRole?: 'owner' | 'admin' | 'editor';
}

const props = withDefaults(defineProps<Props>(), {
  userRole: 'admin',
});

const isAdmin = computed(() => props.userRole === 'admin' || props.userRole === 'owner');

const file = ref<File | null>(null);
const fileContent = ref<string>('');
const parsing = ref(false);
const importing = ref(false);
const error = ref<string | null>(null);

// Preview data
const previewRows = ref<PreviewRow[]>([]);
const skippedReasons = ref<RowReason[]>([]);
const rejectedReasons = ref<RowReason[]>([]);

// Final result
const importResult = ref<ImportResponse | null>(null);

const sampleCsv = `date,merchant_domain,link_slug,external_id,amount,commission,status
2026-10-25,shopee.co.th,shopee-sale,ORD-9821,1590.00,159.00,approved
2026-10-25,lazada.co.th,,ORD-9822,2400.00,240.00,pending
2026-10-25,shopee.co.th,shopee-sale,ORD-9823,850.00,85.00,approved`;

function copySampleCsv() {
  navigator.clipboard.writeText(sampleCsv).then(() => {
    toast.success('คัดลอกรูปแบบตัวอย่าง CSV เรียบร้อยแล้ว');
  });
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  const selected = target.files[0];
  if (!selected) return;

  file.value = selected;
  error.value = null;
  importResult.value = null;

  const reader = new FileReader();
  reader.onload = async (e) => {
    fileContent.value = String(e.target?.result || '');
    await runPreview();
  };
  reader.readAsText(selected);
}

async function runPreview() {
  if (!fileContent.value.trim()) return;
  parsing.value = true;
  error.value = null;
  try {
    const res = await api<ImportResponse>('/api/admin/affiliate/conversions/import', {
      method: 'POST',
      body: {
        csv: fileContent.value,
        preview: true,
      },
    });

    previewRows.value = res.preview || [];
    skippedReasons.value = res.reasons.filter(
      (r) => r.reason.includes('ข้าม') || r.reason.includes('ซ้ำ'),
    );
    rejectedReasons.value = res.reasons.filter(
      (r) => !r.reason.includes('ข้าม') && !r.reason.includes('ซ้ำ'),
    );
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = `${err.code}: ${err.message}`;
    } else {
      error.value = 'ไม่สามารถอ่านหรือตรวจสอบไฟล์ CSV ได้';
    }
  } finally {
    parsing.value = false;
  }
}

async function handleImport() {
  if (!fileContent.value || importing.value) return;
  importing.value = true;
  error.value = null;

  try {
    const res = await api<ImportResponse>('/api/admin/affiliate/conversions/import', {
      method: 'POST',
      body: {
        csv: fileContent.value,
        preview: false,
      },
    });

    importResult.value = res;
    previewRows.value = [];
    toast.success(`นำเข้ายอดขายสำเร็จ ${res.imported} รายการ`);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = `${err.code}: ${err.message}`;
    } else {
      error.value = 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล';
    }
  } finally {
    importing.value = false;
  }
}

function resetAll() {
  file.value = null;
  fileContent.value = '';
  previewRows.value = [];
  skippedReasons.value = [];
  rejectedReasons.value = [];
  importResult.value = null;
  error.value = null;
}

function formatSatangToBaht(satang: number | null | undefined): string {
  if (satang === null || satang === undefined) return '-';
  return (satang / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
</script>

<template>
  <div class="space-y-6 max-w-4xl mx-auto">
    <AffiliateSubNav active="import" :user-role="userRole" />

    <div>
      <h2 class="text-xl font-bold text-text">นำเข้ายอดขาย affiliate (CSV)</h2>
      <p class="text-sm text-muted mt-1">
        อัปโหลดไฟล์รายงานยอดขายและค่าคอมมิชชันที่ส่งออกจากระบบ affiliate เพื่อคำนวณสถิติ EPC และ RPM
      </p>
    </div>

    <!-- Access check for non-admin -->
    <div v-if="!isAdmin" class="rounded-xl border border-warning/30 bg-surface p-6 text-center">
      <Icon name="alert" :size="32" class="text-warning mx-auto mb-2" />
      <h3 class="text-base font-semibold text-text">สิทธิ์การใช้งานจำกัด</h3>
      <p class="text-sm text-muted mt-1">เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้ายอดขายได้</p>
    </div>

    <!-- Admin Importer View -->
    <div v-else class="space-y-6">
      <!-- Format Specs Card -->
      <div class="rounded-xl border border-border bg-surface p-6 space-y-4 shadow-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-text flex items-center gap-2">
            <Icon name="info" :size="16" class="text-brand" />
            <span>คอลัมน์ที่รองรับในไฟล์ CSV</span>
          </h3>

          <Button variant="secondary" size="sm" @click="copySampleCsv">
            <Icon name="copy" :size="14" />
            <span>คัดลอกไฟล์ตัวอย่าง</span>
          </Button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border border-border rounded-lg">
            <thead class="bg-surface-elevated text-muted">
              <tr>
                <th class="p-2 border-b border-border">คอลัมน์</th>
                <th class="p-2 border-b border-border">ความจำเป็น</th>
                <th class="p-2 border-b border-border">คำอธิบายและรูปแบบ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border font-mono text-[11px]">
              <tr>
                <td class="p-2 font-bold text-brand">date</td>
                <td class="p-2 text-danger font-sans">จำเป็น</td>
                <td class="p-2 font-sans text-muted">วันที่เกิดรายการ (เช่น YYYY-MM-DD)</td>
              </tr>
              <tr>
                <td class="p-2 font-bold text-brand">merchant_domain</td>
                <td class="p-2 text-danger font-sans">จำเป็น</td>
                <td class="p-2 font-sans text-muted">
                  โดเมนร้านค้า (ต้องตรงกับร้านค้าในระบบ เช่น shopee.co.th)
                </td>
              </tr>
              <tr>
                <td class="p-2 font-bold text-brand">commission</td>
                <td class="p-2 text-danger font-sans">จำเป็น</td>
                <td class="p-2 font-sans text-muted">ค่าคอมมิชชันในสกุลบาท (เช่น 150.00)</td>
              </tr>
              <tr>
                <td class="p-2 font-bold text-text">external_id</td>
                <td class="p-2 text-muted font-sans">ตัวเลือก</td>
                <td class="p-2 font-sans text-muted">
                  รหัสคำสั่งซื้อ (หากซ้ำกับที่มีอยู่แล้ว ระบบจะข้ามอัตโนมัติ)
                </td>
              </tr>
              <tr>
                <td class="p-2 font-bold text-text">link_slug</td>
                <td class="p-2 text-muted font-sans">ตัวเลือก</td>
                <td class="p-2 font-sans text-muted">Slug ของลิงก์ที่ถูกคลิก</td>
              </tr>
              <tr>
                <td class="p-2 font-bold text-text">amount</td>
                <td class="p-2 text-muted font-sans">ตัวเลือก</td>
                <td class="p-2 font-sans text-muted">ยอดขายรวมของคำสั่งซื้อ (บาท)</td>
              </tr>
              <tr>
                <td class="p-2 font-bold text-text">status</td>
                <td class="p-2 text-muted font-sans">ตัวเลือก</td>
                <td class="p-2 font-sans text-muted">
                  approved, pending หรือ rejected (ค่าเริ่มต้น: pending)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- File Upload Box -->
      <div
        v-if="!importResult"
        class="border-2 border-dashed border-border hover:border-brand rounded-xl p-8 text-center bg-surface transition-colors"
      >
        <div
          class="inline-flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-3"
        >
          <Icon name="plus" :size="24" />
        </div>
        <h4 class="text-sm font-semibold text-text">เลือกไฟล์ CSV สำหรับนำเข้า</h4>
        <p class="text-xs text-muted mt-1 mb-4">รองรับไฟล์ CSV เข้ารหัส UTF-8</p>

        <label
          class="inline-flex items-center gap-2 cursor-pointer bg-brand hover:bg-brand/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <span>เลือกไฟล์จากเครื่อง</span>
          <input type="file" accept=".csv,text/csv" class="hidden" @change="handleFileChange" />
        </label>
        <div v-if="file" class="mt-3 text-xs text-muted font-mono font-medium">
          ไฟล์ที่เลือก: {{ file.name }} ({{ Math.round(file.size / 1024) }} KB)
        </div>
      </div>

      <!-- Parsing / Loading indicator -->
      <div v-if="parsing" class="p-8 text-center bg-surface rounded-xl border border-border">
        <Spinner size="lg" />
        <p class="text-sm text-muted mt-3">กำลังตรวจสอบโครงสร้างไฟล์ CSV...</p>
      </div>

      <!-- Error Box -->
      <div
        v-if="error"
        class="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2"
      >
        <Icon name="alert" :size="18" class="shrink-0 mt-0.5" />
        <span>{{ error }}</span>
      </div>

      <!-- Preview Section -->
      <div v-if="previewRows.length > 0 && !importResult" class="space-y-4">
        <!-- Summary Counters -->
        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-border bg-surface text-center">
            <div class="text-xs text-muted mb-1">พร้อมนำเข้า</div>
            <div class="text-xl font-bold text-success">{{ previewRows.length }}</div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-surface text-center">
            <div class="text-xs text-muted mb-1">ข้าม (รหัสคำสั่งซื้อซ้ำ)</div>
            <div class="text-xl font-bold text-warning">{{ skippedReasons.length }}</div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-surface text-center">
            <div class="text-xs text-muted mb-1">ปฏิเสธ (ข้อมูลผิดพลาด)</div>
            <div class="text-xl font-bold text-danger">{{ rejectedReasons.length }}</div>
          </div>
        </div>

        <!-- Warning notes if any skipped or rejected -->
        <div
          v-if="skippedReasons.length > 0 || rejectedReasons.length > 0"
          class="p-4 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning space-y-1"
        >
          <div class="font-semibold flex items-center gap-1">
            <Icon name="alert" :size="14" />
            <span>หมายเหตุการตรวจสอบแถวข้อมูล:</span>
          </div>
          <ul class="list-disc list-inside space-y-0.5">
            <li v-for="(r, i) in [...skippedReasons, ...rejectedReasons]" :key="i">
              แถวที่ {{ r.row }}: {{ r.reason }}
            </li>
          </ul>
        </div>

        <!-- Preview Table -->
        <div class="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
          <div class="p-4 border-b border-border bg-surface-elevated font-semibold text-sm">
            ตัวอย่างข้อมูลแถวที่ถูกต้อง ({{ previewRows.length }} แถว)
          </div>

          <div class="overflow-x-auto max-h-80">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-surface-elevated text-muted sticky top-0">
                <tr>
                  <th class="p-2.5">แถว</th>
                  <th class="p-2.5">วันที่</th>
                  <th class="p-2.5">ร้านค้า</th>
                  <th class="p-2.5">รหัสอ้างอิง (ID)</th>
                  <th class="p-2.5 text-right">ยอดขาย (บาท)</th>
                  <th class="p-2.5 text-right">คอมมิชชัน (บาท)</th>
                  <th class="p-2.5">สถานะ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="row in previewRows"
                  :key="row.rowNum"
                  class="hover:bg-surface-elevated/50 font-mono"
                >
                  <td class="p-2.5 text-muted">{{ row.rowNum }}</td>
                  <td class="p-2.5">{{ row.dateStr }}</td>
                  <td class="p-2.5 font-sans">{{ row.merchantDomain }}</td>
                  <td class="p-2.5 text-muted">{{ row.externalId || '-' }}</td>
                  <td class="p-2.5 text-right">{{ formatSatangToBaht(row.amountSatang) }}</td>
                  <td class="p-2.5 text-right font-bold text-success">
                    {{ formatSatangToBaht(row.commissionSatang) }}
                  </td>
                  <td class="p-2.5">
                    <Badge variant="neutral">{{ row.status }}</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Action bar -->
        <div class="flex items-center justify-between pt-2">
          <Button variant="secondary" @click="resetAll">ยกเลิก</Button>
          <Button variant="primary" :loading="importing" @click="handleImport">
            <span>ยืนยันการนำเข้ายอดขาย ({{ previewRows.length }} รายการ)</span>
            <Icon name="check" :size="16" />
          </Button>
        </div>
      </div>

      <!-- Result Screen -->
      <div
        v-if="importResult"
        class="rounded-xl border border-success/30 bg-surface p-8 text-center space-y-6 shadow-sm"
      >
        <div
          class="inline-flex size-14 items-center justify-center rounded-full bg-success/10 text-success"
        >
          <Icon name="check" :size="32" />
        </div>

        <div>
          <h3 class="text-lg font-bold text-text">นำเข้ายอดขายสำเร็จเรียบร้อย</h3>
          <p class="text-sm text-muted mt-1">
            ข้อมูลถูกบันทึกลงในระบบ affiliate พร้อมสำหรับการดูรายงาน
          </p>
        </div>

        <div class="grid grid-cols-3 gap-4 max-w-lg mx-auto">
          <div class="p-4 rounded-xl border border-border bg-surface-elevated text-center">
            <div class="text-xs text-muted mb-1">นำเข้าสำเร็จ</div>
            <div class="text-xl font-bold text-success">{{ importResult.imported }}</div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-surface-elevated text-center">
            <div class="text-xs text-muted mb-1">ข้าม (ซ้ำ)</div>
            <div class="text-xl font-bold text-warning">{{ importResult.skipped }}</div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-surface-elevated text-center">
            <div class="text-xs text-muted mb-1">ปฏิเสธ</div>
            <div class="text-xl font-bold text-danger">{{ importResult.rejected }}</div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button variant="secondary" @click="resetAll"> นำเข้าไฟล์อื่นอีก </Button>
          <a
            href="/admin/affiliate/report/"
            class="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
          >
            <span>ดูรายงานผลตอบแทน (EPC / RPM)</span>
            <Icon name="chevron-right" :size="16" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
