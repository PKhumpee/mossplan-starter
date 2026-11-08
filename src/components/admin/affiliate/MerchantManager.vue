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
import Modal from '../ui/Modal.vue';
import Spinner from '../ui/Spinner.vue';
import Textarea from '../ui/Textarea.vue';
import AffiliateSubNav from './AffiliateSubNav.vue';

interface MerchantItem {
  id: string;
  name: string;
  domain: string;
  trackingHosts: string[];
  network: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  linkCount: number;
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
const merchants = ref<MerchantItem[]>([]);
const total = ref(0);

// Modal state
const showModal = ref(false);
const editingMerchant = ref<MerchantItem | null>(null);
const formName = ref('');
const formDomain = ref('');
const formTrackingHosts = ref('');
const formNetwork = ref('');
const formNotes = ref('');
const saving = ref(false);

// Delete state
const showDeleteDialog = ref(false);
const merchantToDelete = ref<MerchantItem | null>(null);
const deleting = ref(false);

async function loadMerchants() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api<{ items: MerchantItem[]; total: number }>(
      '/api/admin/affiliate/merchants',
      {
        query: { limit: 100 },
      },
    );
    merchants.value = res.items;
    total.value = res.total;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = err.message;
    } else {
      error.value = 'เกิดข้อผิดพลาดในการโหลดรายการร้านค้า';
    }
  } finally {
    loading.value = false;
  }
}

function openCreateModal() {
  editingMerchant.value = null;
  formName.value = '';
  formDomain.value = '';
  formTrackingHosts.value = '';
  formNetwork.value = '';
  formNotes.value = '';
  showModal.value = true;
}

function openEditModal(merchant: MerchantItem) {
  editingMerchant.value = merchant;
  formName.value = merchant.name;
  formDomain.value = merchant.domain;
  formTrackingHosts.value = merchant.trackingHosts.join(', ');
  formNetwork.value = merchant.network || '';
  formNotes.value = merchant.notes || '';
  showModal.value = true;
}

async function handleSave() {
  const name = formName.value.trim();
  const domain = formDomain.value.trim().toLowerCase();
  if (!name || !domain) {
    toast.error('กรุณาระบุชื่อและโดเมนร้านค้า');
    return;
  }

  const trackingHosts = formTrackingHosts.value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (trackingHosts.length > 10) {
    toast.error('Tracking hosts ต้องไม่เกิน 10 โดเมน');
    return;
  }

  saving.value = true;
  try {
    const payload = {
      name,
      domain,
      trackingHosts,
      network: formNetwork.value.trim() || null,
      notes: formNotes.value.trim() || null,
    };

    if (editingMerchant.value) {
      await api(`/api/admin/affiliate/merchants/${editingMerchant.value.id}`, {
        method: 'PATCH',
        body: payload,
      });
      toast.success('แก้ไขข้อมูลร้านค้าสำเร็จ');
    } else {
      await api('/api/admin/affiliate/merchants', {
        method: 'POST',
        body: payload,
      });
      toast.success('เพิ่มร้านค้าใหม่สำเร็จ');
    }

    showModal.value = false;
    await loadMerchants();
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
  } finally {
    saving.value = false;
  }
}

function confirmDelete(merchant: MerchantItem) {
  if (merchant.linkCount > 0) {
    toast.error(
      `ไม่สามารถลบร้านค้านี้ได้ เนื่องจากมีลิงก์ affiliate ใช้งานอยู่ ${merchant.linkCount} รายการ`,
    );
    return;
  }
  merchantToDelete.value = merchant;
  showDeleteDialog.value = true;
}

async function executeDelete() {
  if (!merchantToDelete.value) return;
  deleting.value = true;
  try {
    await api(`/api/admin/affiliate/merchants/${merchantToDelete.value.id}`, {
      method: 'DELETE',
    });
    toast.success('ลบร้านค้าเรียบร้อยแล้ว');
    showDeleteDialog.value = false;
    merchantToDelete.value = null;
    await loadMerchants();
  } catch (err: unknown) {
    toast.error(err instanceof ApiError ? err.message : 'ลบร้านค้าไม่สำเร็จ');
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  loadMerchants();
});
</script>

<template>
  <div class="space-y-6">
    <AffiliateSubNav active="merchants" :user-role="userRole" />

    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-text">ร้านค้า affiliate</h2>
        <p class="text-sm text-muted mt-1">
          จัดการรายชื่อร้านค้า โดเมนหลัก และ tracking hosts สำหรับลิงก์ย่อ
        </p>
      </div>

      <div v-if="isAdmin">
        <Button variant="primary" @click="openCreateModal">
          <Icon name="plus" :size="16" />
          <span>เพิ่มร้านค้า</span>
        </Button>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center p-12 bg-surface rounded-xl border border-border"
    >
      <Spinner size="lg" />
      <p class="mt-4 text-sm text-muted">กำลังโหลดรายการร้านค้า...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-8 text-center bg-surface rounded-xl border border-danger/30">
      <div
        class="inline-flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger mb-4"
      >
        <Icon name="alert" :size="24" />
      </div>
      <h3 class="text-base font-semibold text-text mb-2">ไม่สามารถโหลดข้อมูลได้</h3>
      <p class="text-sm text-muted mb-4">{{ error }}</p>
      <Button variant="secondary" @click="loadMerchants">ลองใหม่อีกครั้ง</Button>
    </div>

    <!-- Empty -->
    <div v-else-if="merchants.length === 0" class="bg-surface rounded-xl border border-border p-8">
      <EmptyState
        title="ยังไม่มีร้านค้าในระบบ"
        description="เพิ่มร้านค้า เช่น Shopee, Lazada หรือ TikTok เพื่อเริ่มสร้างและติดตามลิงก์ affiliate"
      >
        <template #action v-if="isAdmin">
          <Button variant="primary" @click="openCreateModal">
            <Icon name="plus" :size="16" />
            <span>เพิ่มร้านค้าแรก</span>
          </Button>
        </template>
      </EmptyState>
    </div>

    <!-- Merchants Table -->
    <div v-else class="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-text border-collapse">
          <thead
            class="bg-surface-elevated border-b border-border text-xs uppercase tracking-wider text-muted"
          >
            <tr>
              <th scope="col" class="px-4 py-3 font-semibold">ชื่อร้านค้า</th>
              <th scope="col" class="px-4 py-3 font-semibold">โดเมนหลัก (Domain)</th>
              <th scope="col" class="px-4 py-3 font-semibold">Tracking Hosts</th>
              <th scope="col" class="px-4 py-3 font-semibold">เครือข่าย (Network)</th>
              <th scope="col" class="px-4 py-3 font-semibold text-center">ลิงก์</th>
              <th v-if="isAdmin" scope="col" class="px-4 py-3 font-semibold text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="merchant in merchants"
              :key="merchant.id"
              class="hover:bg-surface-elevated/50 transition-colors"
            >
              <td class="px-4 py-3.5">
                <div class="font-semibold text-text">{{ merchant.name }}</div>
                <div v-if="merchant.notes" class="text-xs text-muted mt-0.5 truncate max-w-xs">
                  {{ merchant.notes }}
                </div>
              </td>

              <td class="px-4 py-3.5 font-mono text-xs">
                {{ merchant.domain }}
              </td>

              <td class="px-4 py-3.5">
                <div v-if="merchant.trackingHosts.length > 0" class="flex flex-wrap gap-1">
                  <span
                    v-for="th in merchant.trackingHosts"
                    :key="th"
                    class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-muted"
                  >
                    {{ th }}
                  </span>
                </div>
                <span v-else class="text-xs text-muted">-</span>
              </td>

              <td class="px-4 py-3.5 text-xs text-muted">
                {{ merchant.network || '-' }}
              </td>

              <td class="px-4 py-3.5 text-center font-mono text-xs">
                <Badge :variant="merchant.linkCount > 0 ? 'neutral' : 'neutral'">
                  {{ merchant.linkCount }}
                </Badge>
              </td>

              <td v-if="isAdmin" class="px-4 py-3.5 text-right">
                <div class="inline-flex items-center gap-1">
                  <button
                    type="button"
                    class="p-1.5 text-muted hover:text-brand transition-colors rounded hover:bg-surface-elevated"
                    title="แก้ไขร้านค้า"
                    @click="openEditModal(merchant)"
                  >
                    <Icon name="history" :size="16" />
                  </button>

                  <button
                    type="button"
                    class="p-1.5 text-muted hover:text-danger transition-colors rounded hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="ลบร้านค้า"
                    :disabled="merchant.linkCount > 0"
                    @click="confirmDelete(merchant)"
                  >
                    <Icon name="x" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <Modal
      v-model:open="showModal"
      :title="editingMerchant ? 'แก้ไขข้อมูลร้านค้า' : 'เพิ่มร้านค้าใหม่'"
      description="กรุณาระบุโดเมนหลักและ tracking hosts เพื่อให้ระบบสามารถตรวจสอบลิงก์ได้อย่างถูกต้อง"
    >
      <div class="space-y-4 py-2">
        <div>
          <label class="block text-sm font-semibold text-text mb-1">
            ชื่อร้านค้า <span class="text-danger">*</span>
          </label>
          <Input v-model="formName" placeholder="Shopee Thailand" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-text mb-1">
            โดเมนหลัก (Registrable Domain) <span class="text-danger">*</span>
          </label>
          <Input v-model="formDomain" placeholder="shopee.co.th" />
          <p class="text-xs text-muted mt-1">
            โดเมนที่ผู้อ่านจะไปถึงหลังจากการเปลี่ยนเส้นทาง (ไม่รวม https:// หรือ /)
          </p>
        </div>

        <div>
          <label class="block text-sm font-semibold text-text mb-1">
            Tracking Hosts เพิ่มเติม (คั่นด้วยจุลภาค, สูงสุด 10 โดเมน)
          </label>
          <Input v-model="formTrackingHosts" placeholder="shope.ee, invol.co" />
          <p class="text-xs text-muted mt-1">โฮสต์ของลิงก์ย่อที่เครือข่าย affiliate ใช้ส่งต่อ</p>
        </div>

        <div>
          <label class="block text-sm font-semibold text-text mb-1">
            เครือข่าย Affiliate (Network - ตัวเลือก)
          </label>
          <Input v-model="formNetwork" placeholder="เช่น Shopee Affiliate, Involve Asia" />
        </div>

        <div>
          <label class="block text-sm font-semibold text-text mb-1">
            บันทึกช่วยจำ (Notes - ตัวเลือก)
          </label>
          <Textarea v-model="formNotes" rows="2" placeholder="รายละเอียดโปรแกรม..." />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" @click="showModal = false">ยกเลิก</Button>
          <Button variant="primary" :loading="saving" @click="handleSave"> บันทึก </Button>
        </div>
      </template>
    </Modal>

    <!-- Confirm Delete Dialog -->
    <ConfirmDialog
      v-model:open="showDeleteDialog"
      title="ยืนยันการลบร้านค้า"
      :description="`คุณต้องการลบร้านค้า &quot;${merchantToDelete?.name}&quot; หรือไม่?`"
      confirm-text="ลบร้านค้า"
      variant="danger"
      :loading="deleting"
      @confirm="executeDelete"
    />
  </div>
</template>
