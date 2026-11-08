<script setup lang="ts">
import { computed, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import FormField from '../ui/FormField.vue';
import Icon from '../ui/Icon.vue';
import Input from '../ui/Input.vue';
import Modal from '../ui/Modal.vue';
import Spinner from '../ui/Spinner.vue';
import Textarea from '../ui/Textarea.vue';

interface ResolvedHop {
  url: string;
  status: number;
  location?: string;
}

interface ResolveData {
  hops: ResolvedHop[];
  finalUrl: string;
  finalHost: string;
  merchant: {
    id: string;
    name: string;
    domain: string;
    trackingHosts: string[];
  } | null;
  suggestedSlug: string;
  suggestedLabel: string;
  problems: string[];
}

const currentStep = ref<1 | 2 | 3 | 4>(1);

// Step 1: Input
const pastedUrl = ref('');
const resolving = ref(false);
const resolveError = ref<string | null>(null);

// Step 2: Inspection data
const resolveData = ref<ResolveData | null>(null);

// Create Merchant Modal (if merchant not matched)
const showCreateMerchantModal = ref(false);
const newMerchantName = ref('');
const newMerchantDomain = ref('');
const newMerchantTrackingHosts = ref('');
const creatingMerchant = ref(false);

// Step 3: Final form fields
const label = ref('');
const slug = ref('');
const fallbackUrl = ref('');
const expiresAtStr = ref('');
const saving = ref(false);
const saveError = ref<string | null>(null);

// Step 4: Success
const createdSlug = ref('');
const copied = ref(false);

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isSlugValid = computed(() => slugRegex.test(slug.value.trim()));

async function handleResolve() {
  const url = pastedUrl.value.trim();
  if (!url) {
    resolveError.value = 'กรุณาวางลิงก์ affiliate ที่ได้จากโปรแกรม';
    return;
  }

  resolving.value = true;
  resolveError.value = null;

  try {
    const data = await api<ResolveData>('/api/admin/affiliate/links/resolve', {
      method: 'POST',
      body: { url },
    });

    resolveData.value = data;
    label.value = data.suggestedLabel;
    slug.value = data.suggestedSlug;
    currentStep.value = 2;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      resolveError.value = `${err.code}: ${err.message}`;
    } else {
      resolveError.value = 'เกิดข้อผิดพลาดในการตรวจสอบลิงก์ กรุณาลองใหม่อีกครั้ง';
    }
  } finally {
    resolving.value = false;
  }
}

function openCreateMerchant() {
  if (!resolveData.value) return;
  const landingHost = resolveData.value.finalHost;
  let pastedHost = '';
  try {
    pastedHost = new URL(pastedUrl.value.trim()).hostname.toLowerCase();
  } catch {
    // ignore
  }

  newMerchantName.value = landingHost.split('.')[0]?.toUpperCase() || landingHost;
  newMerchantDomain.value = landingHost;

  const tracking: string[] = [];
  if (pastedHost && pastedHost !== landingHost) {
    tracking.push(pastedHost);
  }
  newMerchantTrackingHosts.value = tracking.join(', ');
  showCreateMerchantModal.value = true;
}

async function handleCreateMerchant() {
  const name = newMerchantName.value.trim();
  const domain = newMerchantDomain.value.trim().toLowerCase();
  if (!name || !domain) {
    toast.error('กรุณาระบุชื่อและโดเมนร้านค้า');
    return;
  }

  const trackingHosts = newMerchantTrackingHosts.value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  creatingMerchant.value = true;
  try {
    const created = await api<{
      id: string;
      name: string;
      domain: string;
      trackingHosts: string[];
    }>('/api/admin/affiliate/merchants', {
      method: 'POST',
      body: { name, domain, trackingHosts },
    });

    if (resolveData.value) {
      resolveData.value.merchant = created;
      resolveData.value.problems = resolveData.value.problems.filter(
        (p) => !p.includes('ไม่พบร้านค้า'),
      );
    }

    toast.success(`สร้างร้านค้า ${name} สำเร็จแล้ว`);
    showCreateMerchantModal.value = false;
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'สร้างร้านค้าไม่สำเร็จ');
  } finally {
    creatingMerchant.value = false;
  }
}

function proceedToStep3() {
  if (!resolveData.value?.merchant) {
    toast.error('กรุณากำหนดร้านค้าสำหรับลิงก์นี้ก่อนดำเนินการต่อ');
    return;
  }
  currentStep.value = 3;
}

async function handleSaveLink() {
  if (!resolveData.value?.merchant) {
    toast.error('ไม่พบข้อมูลร้านค้า');
    return;
  }
  if (!label.value.trim()) {
    saveError.value = 'กรุณาระบุชื่อป้ายกำกับลิงก์';
    return;
  }
  if (!isSlugValid.value) {
    saveError.value = 'รูปแบบ slug ไม่ถูกต้อง (ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น)';
    return;
  }

  saving.value = true;
  saveError.value = null;

  try {
    let expiresAt: number | null = null;
    if (expiresAtStr.value) {
      expiresAt = new Date(expiresAtStr.value).getTime();
    }

    const payload = {
      slug: slug.value.trim(),
      merchantId: resolveData.value.merchant.id,
      destinationUrl: pastedUrl.value.trim(), // Stored as pasted, byte-for-byte
      fallbackUrl: fallbackUrl.value.trim() || null,
      label: label.value.trim(),
      status: 'active',
      expiresAt,
    };

    const res = await api<{ id: string; slug: string }>('/api/admin/affiliate/links', {
      method: 'POST',
      body: payload,
    });

    createdSlug.value = res.slug;
    currentStep.value = 4;
    toast.success('บันทึกและสร้างลิงก์ affiliate สำเร็จ');
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      saveError.value = `${err.code}: ${err.message}`;
    } else {
      saveError.value = 'เกิดข้อผิดพลาดในการบันทึกลิงก์';
    }
  } finally {
    saving.value = false;
  }
}

function copyResultGoUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/go/${createdSlug.value}/`;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    toast.success('คัดลอกลิงก์เรียบร้อยแล้ว');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}

function resetForm() {
  currentStep.value = 1;
  pastedUrl.value = '';
  resolveData.value = null;
  label.value = '';
  slug.value = '';
  fallbackUrl.value = '';
  expiresAtStr.value = '';
  resolveError.value = null;
  saveError.value = null;
  createdSlug.value = '';
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-8">
    <!-- Breadcrumb & Header -->
    <div>
      <a
        href="/admin/affiliate/"
        class="inline-flex items-center gap-1 text-sm text-muted hover:text-text mb-3"
      >
        <Icon name="chevron-left" :size="16" />
        <span>กลับไปยังรายการลิงก์</span>
      </a>
      <h2 class="text-xl font-bold text-text">เพิ่มลิงก์ affiliate ใหม่</h2>
      <p class="text-sm text-muted mt-1">
        ตรวจสอบและสร้างลิงก์สำหรับโปรแกรม affiliate ผ่านขั้นตอน 3 ขั้นตอน
      </p>
    </div>

    <!-- Stepper indicator -->
    <div class="flex items-center justify-between border-b border-border pb-4">
      <div
        class="flex items-center gap-2 text-sm"
        :class="currentStep >= 1 ? 'text-brand font-semibold' : 'text-muted'"
      >
        <span
          class="flex size-6 items-center justify-center rounded-full text-xs font-bold"
          :class="
            currentStep >= 1
              ? 'bg-brand text-white'
              : 'bg-surface-elevated border border-border text-muted'
          "
        >
          1
        </span>
        <span>วางลิงก์</span>
      </div>

      <div class="h-0.5 w-12 bg-border"></div>

      <div
        class="flex items-center gap-2 text-sm"
        :class="currentStep >= 2 ? 'text-brand font-semibold' : 'text-muted'"
      >
        <span
          class="flex size-6 items-center justify-center rounded-full text-xs font-bold"
          :class="
            currentStep >= 2
              ? 'bg-brand text-white'
              : 'bg-surface-elevated border border-border text-muted'
          "
        >
          2
        </span>
        <span>ตรวจสอบปลายทาง</span>
      </div>

      <div class="h-0.5 w-12 bg-border"></div>

      <div
        class="flex items-center gap-2 text-sm"
        :class="currentStep >= 3 ? 'text-brand font-semibold' : 'text-muted'"
      >
        <span
          class="flex size-6 items-center justify-center rounded-full text-xs font-bold"
          :class="
            currentStep >= 3
              ? 'bg-brand text-white'
              : 'bg-surface-elevated border border-border text-muted'
          "
        >
          3
        </span>
        <span>บันทึกและสร้าง slug</span>
      </div>
    </div>

    <!-- STEP 1: Paste Link -->
    <div
      v-if="currentStep === 1"
      class="rounded-xl border border-border bg-surface p-6 space-y-6 shadow-sm"
    >
      <div>
        <label for="pasted-url" class="block text-sm font-semibold text-text mb-2">
          วางลิงก์ affiliate ที่ได้จากโปรแกรม
        </label>
        <p class="text-xs text-muted mb-3">
          ระบบจะจัดเก็บ URL นี้ไว้ตามเดิมทุกตัวอักษรเพื่อรักษาพารามิเตอร์การติดตาม (tracking params)
          ของเครือข่าย
        </p>
        <Textarea
          id="pasted-url"
          v-model="pastedUrl"
          rows="3"
          placeholder="https://shope.ee/... หรือ https://invol.co/... หรือ https://shopee.co.th/..."
          class="font-mono text-xs"
        />
      </div>

      <div
        v-if="resolveError"
        class="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2"
      >
        <Icon name="alert" :size="18" class="shrink-0 mt-0.5" />
        <span>{{ resolveError }}</span>
      </div>

      <div class="flex justify-end">
        <Button
          variant="primary"
          :loading="resolving"
          :disabled="!pastedUrl.trim()"
          @click="handleResolve"
        >
          <span>ตรวจสอบลิงก์ (ตรวจการเปลี่ยนเส้นทาง)</span>
          <Icon name="chevron-right" :size="16" />
        </Button>
      </div>
    </div>

    <!-- STEP 2: Inspect Redirects & Match Merchant -->
    <div v-else-if="currentStep === 2 && resolveData" class="space-y-6">
      <div class="rounded-xl border border-border bg-surface p-6 space-y-6 shadow-sm">
        <h3 class="text-base font-semibold text-text flex items-center gap-2">
          <Icon name="check" :size="18" class="text-success" />
          <span>ผลการตรวจสอบลิงก์และการเปลี่ยนเส้นทาง</span>
        </h3>

        <!-- Pasted URL -->
        <div class="rounded-lg bg-surface-elevated border border-border p-4">
          <div class="text-xs font-semibold uppercase text-muted mb-1">
            ลิงก์ที่วาง (จัดเก็บตามเดิมไม่แปลงค่า):
          </div>
          <div class="font-mono text-xs text-text break-all select-all">{{ pastedUrl }}</div>
        </div>

        <!-- Redirect Hops Chain -->
        <div>
          <div class="text-sm font-semibold text-text mb-2">
            เส้นทางการเปลี่ยนเส้นทาง ({{ resolveData.hops.length }} ขั้นตอน):
          </div>
          <div class="space-y-2">
            <div
              v-for="(hop, idx) in resolveData.hops"
              :key="idx"
              class="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-elevated/40 text-xs"
            >
              <span class="font-bold text-muted mt-0.5">#{{ idx + 1 }}</span>
              <span
                class="px-1.5 py-0.5 rounded font-mono font-semibold"
                :class="
                  hop.status >= 300 && hop.status < 400
                    ? 'bg-warning/10 text-warning'
                    : 'bg-success/10 text-success'
                "
              >
                {{ hop.status }}
              </span>
              <div class="flex-1 break-all font-mono">
                <div>{{ hop.url }}</div>
                <div v-if="hop.location" class="text-brand mt-1 flex items-center gap-1">
                  <Icon name="arrow-down" :size="12" />
                  <span>เปลี่ยนเส้นทางไปยัง: {{ hop.location }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Final Landing Host & Detected Merchant -->
        <div class="grid gap-4 sm:grid-cols-2 pt-2">
          <div class="p-4 rounded-lg border border-border bg-surface-elevated">
            <div class="text-xs text-muted mb-1">หน้าปลายทางสุดท้าย:</div>
            <div
              class="font-mono text-xs font-semibold text-text truncate"
              :title="resolveData.finalUrl"
            >
              {{ resolveData.finalHost }}
            </div>
          </div>

          <div class="p-4 rounded-lg border border-border bg-surface-elevated">
            <div class="text-xs text-muted mb-1">ร้านค้าที่ตรวจพบ:</div>
            <div v-if="resolveData.merchant" class="flex items-center gap-2">
              <Badge variant="success">{{ resolveData.merchant.name }}</Badge>
              <span class="text-xs font-mono text-muted">({{ resolveData.merchant.domain }})</span>
            </div>
            <div v-else class="text-warning text-xs flex items-center justify-between">
              <span>ไม่พบร้านค้าที่ตรงกับโดเมนนี้</span>
              <button
                type="button"
                class="text-brand font-semibold underline hover:text-brand/80"
                @click="openCreateMerchant"
              >
                สร้างร้านค้าใหม่
              </button>
            </div>
          </div>
        </div>

        <!-- Problems / Warnings -->
        <div
          v-if="resolveData.problems.length > 0"
          class="p-4 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs space-y-1"
        >
          <div class="font-semibold flex items-center gap-1">
            <Icon name="alert" :size="14" />
            <span>ข้อสังเกตจากระบบ:</span>
          </div>
          <ul class="list-disc list-inside space-y-0.5">
            <li v-for="(p, i) in resolveData.problems" :key="i">{{ p }}</li>
          </ul>
        </div>

        <div class="flex items-center justify-between pt-2">
          <Button variant="secondary" @click="currentStep = 1"> ย้อนกลับไปแก้ไข URL </Button>

          <Button variant="primary" :disabled="!resolveData.merchant" @click="proceedToStep3">
            <span>ถัดไป: กำหนดข้อมูลลิงก์</span>
            <Icon name="chevron-right" :size="16" />
          </Button>
        </div>
      </div>
    </div>

    <!-- STEP 3: Label, Slug, Fallback, Expiry -->
    <div
      v-else-if="currentStep === 3 && resolveData"
      class="rounded-xl border border-border bg-surface p-6 space-y-6 shadow-sm"
    >
      <h3 class="text-base font-semibold text-text">กำหนดข้อมูลลิงก์ affiliate</h3>

      <div class="space-y-4">
        <!-- Label -->
        <div>
          <label for="link-label" class="block text-sm font-semibold text-text mb-1">
            ชื่อป้ายกำกับลิงก์ (Admin Label) <span class="text-danger">*</span>
          </label>
          <Input
            id="link-label"
            v-model="label"
            placeholder="เช่น หูฟังไร้สาย Sony WH-1000XM5 ลดราคาพิเศษ"
          />
          <p class="text-xs text-muted mt-1">
            ดึงมาจากชื่อหน้าปลายทาง (&lt;title&gt;) โดยอัตโนมัติ สามารถแก้ไขได้
          </p>
        </div>

        <!-- Slug -->
        <div>
          <label for="link-slug" class="block text-sm font-semibold text-text mb-1">
            Slug สำหรับลิงก์ /go/&lt;slug&gt;/ <span class="text-danger">*</span>
          </label>
          <div class="flex items-center">
            <span
              class="px-3 py-2 border border-r-0 border-border bg-surface-elevated text-xs font-mono text-muted rounded-l-lg"
            >
              /go/
            </span>
            <input
              id="link-slug"
              v-model="slug"
              type="text"
              class="flex-1 rounded-r-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="sony-wh1000xm5-deal"
            />
          </div>
          <p class="text-xs text-muted mt-1">
            ใช้ตัวอักษรภาษาอังกฤษตัวพิมพ์เล็ก ตัวเลข และขีดกลาง (-) เท่านั้น
          </p>
        </div>

        <!-- Fallback URL -->
        <div>
          <label for="link-fallback" class="block text-sm font-semibold text-text mb-1">
            URL สำรอง (Fallback URL - ตัวเลือก)
          </label>
          <Input
            id="link-fallback"
            v-model="fallbackUrl"
            placeholder="https://shopee.co.th/search?keyword=sony"
          />
          <p class="text-xs text-muted mt-1">สำหรับส่งผู้อ่านไปเมื่อลิงก์นี้ถูกพักหรือหมดอายุ</p>
        </div>

        <!-- Expiry Date -->
        <div>
          <label for="link-expiry" class="block text-sm font-semibold text-text mb-1">
            วันหมดอายุของโปรโมชั่น (ตัวเลือก)
          </label>
          <input
            id="link-expiry"
            v-model="expiresAtStr"
            type="date"
            class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div
        v-if="saveError"
        class="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2"
      >
        <Icon name="alert" :size="18" class="shrink-0 mt-0.5" />
        <span>{{ saveError }}</span>
      </div>

      <div class="flex items-center justify-between pt-2">
        <Button variant="secondary" @click="currentStep = 2"> ย้อนกลับ </Button>

        <Button
          variant="primary"
          :loading="saving"
          :disabled="!label.trim() || !isSlugValid"
          @click="handleSaveLink"
        >
          บันทึกและสร้างลิงก์
        </Button>
      </div>
    </div>

    <!-- STEP 4: Success Screen -->
    <div
      v-else-if="currentStep === 4"
      class="rounded-xl border border-success/30 bg-surface p-8 text-center space-y-6 shadow-sm"
    >
      <div
        class="inline-flex size-14 items-center justify-center rounded-full bg-success/10 text-success"
      >
        <Icon name="check" :size="32" />
      </div>

      <div>
        <h3 class="text-lg font-bold text-text">สร้างลิงก์ affiliate สำเร็จแล้ว!</h3>
        <p class="text-sm text-muted mt-1">
          ลิงก์ /go/ พร้อมใช้งานในบทความและเปิดให้ระบบนับคลิกทันที
        </p>
      </div>

      <!-- Generated URL Card -->
      <div
        class="max-w-md mx-auto p-4 rounded-lg bg-surface-elevated border border-border text-left"
      >
        <div class="text-xs font-semibold text-muted mb-1">URL สำหรับนำไปใส่ในบทความ:</div>
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-sm font-bold text-brand truncate"
            >/go/{{ createdSlug }}/</span
          >
          <Button variant="secondary" size="sm" @click="copyResultGoUrl">
            <Icon :name="copied ? 'check' : 'copy'" :size="14" />
            <span>{{ copied ? 'คัดลอกแล้ว' : 'คัดลอก' }}</span>
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button variant="secondary" @click="resetForm"> เพิ่มลิงก์ใหม่อีก </Button>
        <a
          href="/admin/affiliate/"
          class="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <span>ดูรายการลิงก์ทั้งหมด</span>
          <Icon name="chevron-right" :size="16" />
        </a>
      </div>
    </div>

    <!-- Create Merchant Modal -->
    <Modal
      v-model:open="showCreateMerchantModal"
      title="สร้างร้านค้าใหม่"
      description="ระบบจะสร้างร้านค้านี้เพื่อผูกกับลิงก์ affiliate ที่กำลังสร้าง"
    >
      <div class="space-y-4 py-2">
        <div>
          <label class="block text-sm font-semibold text-text mb-1">ชื่อร้านค้า</label>
          <Input v-model="newMerchantName" placeholder="Shopee Thailand" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-text mb-1"
            >โดเมนหลัก (Registrable Domain)</label
          >
          <Input v-model="newMerchantDomain" placeholder="shopee.co.th" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-text mb-1"
            >Tracking Hosts เพิ่มเติม (คั่นด้วยจุลภาค)</label
          >
          <Input v-model="newMerchantTrackingHosts" placeholder="shope.ee, invol.co" />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" @click="showCreateMerchantModal = false">ยกเลิก</Button>
          <Button variant="primary" :loading="creatingMerchant" @click="handleCreateMerchant">
            บันทึกร้านค้า
          </Button>
        </div>
      </template>
    </Modal>
  </div>
</template>
