<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import Icon from '../ui/Icon.vue';
import Modal from '../ui/Modal.vue';

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'editor';
  slug: string | null;
  jobTitle: string | null;
  bio: string | null;
  avatarMediaId: string | null;
  complete: boolean;
  createdAt: number;
  lastSignInAt: number | null;
}

interface InviteItem {
  id: string;
  email: string;
  role: 'admin' | 'editor';
  invitedBy: string | null;
  invitedByName: string | null;
  createdAt: number;
}

const props = defineProps<{
  currentUserId: string;
}>();

const loading = ref(true);
const users = ref<UserItem[]>([]);
const invites = ref<InviteItem[]>([]);

// Filter and search
const searchQuery = ref('');
const roleFilter = ref<'all' | 'owner' | 'admin' | 'editor'>('all');

// Modals
const showInviteModal = ref(false);
const inviteEmail = ref('');
const inviteRole = ref<'admin' | 'editor'>('editor');
const inviting = ref(false);
const lastInvitedEmail = ref<string | null>(null);

// Delete confirmation
const userToDelete = ref<UserItem | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);

// Format date helper in Asia/Bangkok Thai format
function formatThaiDateTime(ms: number | null | undefined): string {
  if (!ms) return 'ยังไม่เคยเข้าสู่ระบบ';
  const d = new Date(ms);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

async function loadTeam() {
  loading.value = true;
  try {
    const res = await api<{ users: UserItem[]; invites: InviteItem[] }>('/api/admin/team');
    users.value = res.users;
    invites.value = res.invites;
  } catch (err: any) {
    toast.error(err.message || 'โหลดข้อมูลทีมไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
}

const filteredUsers = computed(() => {
  return users.value.filter((u) => {
    if (roleFilter.value !== 'all' && u.role !== roleFilter.value) return false;
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });
});

async function handleRoleChange(user: UserItem, newRole: 'admin' | 'editor') {
  if (user.role === newRole) return;
  try {
    await api(`/api/admin/team/users/${user.id}`, {
      method: 'PATCH',
      body: { role: newRole },
    });
    user.role = newRole;
    toast.success(
      `เปลี่ยนบทบาทของ ${user.name} เป็น ${newRole === 'admin' ? 'ผู้ดูแลระบบ' : 'บรรณาธิการ'} เรียบร้อย`,
    );
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'LAST_ADMIN') {
      toast.error('ไม่สามารถลดระดับผู้ดูแลระบบคนสุดท้ายได้ ต้องมี Admin อย่างน้อย 1 คน');
    } else {
      toast.error(err.message || 'เปลี่ยนบทบาทไม่สำเร็จ');
    }
    // Revert select back
    await loadTeam();
  }
}

async function sendInvite() {
  const email = inviteEmail.value.trim();
  if (!email) {
    toast.error('กรุณาระบุอีเมล');
    return;
  }

  inviting.value = true;
  try {
    const res = await api<InviteItem>('/api/admin/team/invites', {
      method: 'POST',
      body: { email, role: inviteRole.value },
    });
    invites.value.unshift(res);
    lastInvitedEmail.value = email;
    inviteEmail.value = '';
    toast.success(`ส่งคำเชิญไปยัง ${email} เรียบร้อยแล้ว`);
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'USER_EXISTS') {
      toast.error(`มีผู้ใช้งานด้วยอีเมล ${email} ในระบบแล้ว`);
    } else if (err instanceof ApiError && err.code === 'INVITE_EXISTS') {
      toast.error(`มีคำเชิญสำหรับ ${email} อยู่แล้ว`);
    } else {
      toast.error(err.message || 'ส่งคำเชิญไม่สำเร็จ');
    }
  } finally {
    inviting.value = false;
  }
}

async function revokeInvite(invite: InviteItem) {
  try {
    await api(`/api/admin/team/invites/${invite.id}`, {
      method: 'DELETE',
    });
    invites.value = invites.value.filter((i) => i.id !== invite.id);
    toast.success(`ยกเลิกคำเชิญของ ${invite.email} เรียบร้อย`);
  } catch (err: any) {
    toast.error(err.message || 'ยกเลิกคำเชิญไม่สำเร็จ');
  }
}

function promptDeleteUser(user: UserItem) {
  if (user.id === props.currentUserId) {
    toast.error('คุณไม่สามารถลบบัญชีของตัวเองได้');
    return;
  }
  userToDelete.value = user;
  showDeleteConfirm.value = true;
}

async function confirmDeleteUser() {
  if (!userToDelete.value) return;
  const target = userToDelete.value;
  deleting.value = true;

  try {
    await api(`/api/admin/team/users/${target.id}`, {
      method: 'DELETE',
    });
    users.value = users.value.filter((u) => u.id !== target.id);
    toast.success(`ลบสมาชิก ${target.name} ออกจากระบบเรียบร้อย`);
    showDeleteConfirm.value = false;
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'LAST_ADMIN') {
      toast.error('ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้');
    } else if (err instanceof ApiError && err.code === 'USER_HAS_ARTICLES') {
      toast.error('ไม่สามารถลบผู้ใช้ที่มีบทความในระบบได้ กรุณาลบหรือเปลี่ยนผู้เขียนบทความก่อน');
    } else {
      toast.error(err.message || 'ลบสมาชิกไม่สำเร็จ');
    }
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  loadTeam();
});
</script>

<template>
  <div class="space-y-8">
    <!-- Top Action Bar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <!-- Role filter chips -->
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-full text-caption font-semibold transition-all',
            roleFilter === 'all'
              ? 'bg-brand text-brand-contrast shadow-sm'
              : 'bg-surface text-text hover:bg-border/60',
          ]"
          @click="roleFilter = 'all'"
        >
          ทั้งหมด ({{ users.length }})
        </button>
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-full text-caption font-semibold transition-all',
            roleFilter === 'admin'
              ? 'bg-brand text-brand-contrast shadow-sm'
              : 'bg-surface text-text hover:bg-border/60',
          ]"
          @click="roleFilter = 'admin'"
        >
          ผู้ดูแลระบบ ({{ users.filter((u) => u.role === 'admin' || u.role === 'owner').length }})
        </button>
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-full text-caption font-semibold transition-all',
            roleFilter === 'editor'
              ? 'bg-brand text-brand-contrast shadow-sm'
              : 'bg-surface text-text hover:bg-border/60',
          ]"
          @click="roleFilter = 'editor'"
        >
          บรรณาธิการ ({{ users.filter((u) => u.role === 'editor').length }})
        </button>
      </div>

      <div class="flex items-center gap-3">
        <!-- Search input -->
        <div class="relative w-full sm:w-64">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="ค้นหาชื่อหรืออีเมล..."
            class="w-full rounded-xl border border-border-input bg-bg px-3.5 py-1.5 text-body-sm text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
          />
        </div>

        <!-- Invite button -->
        <Button variant="primary" size="md" type="button" @click="showInviteModal = true">
          <Icon name="plus" />
          เชิญสมาชิกใหม่
        </Button>
      </div>
    </div>

    <!-- 1. Team Members Table (DESIGN §10.5) -->
    <div class="rounded-2xl border border-border bg-bg shadow-sm overflow-hidden">
      <div class="p-4 sm:p-5 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="text-h3 font-bold text-text">สมาชิกในทีม</h2>
          <p class="text-caption text-muted">ผู้ใช้ที่มีสิทธิ์เข้าใช้งานระบบจัดการเนื้อหา (CMS)</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-body-sm border-collapse">
          <thead>
            <tr class="border-b border-border bg-surface text-caption text-muted">
              <th class="py-3 px-4 font-semibold">ชื่อ / ผู้ใช้</th>
              <th class="py-3 px-4 font-semibold">อีเมล</th>
              <th class="py-3 px-4 font-semibold">บทบาท (Role)</th>
              <th class="py-3 px-4 font-semibold">สถานะโปรไฟล์ E-E-A-T</th>
              <th class="py-3 px-4 font-semibold">เข้าสู่ระบบล่าสุด</th>
              <th class="py-3 px-4 text-right font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-if="loading" class="text-center">
              <td colspan="6" class="py-12 text-muted">กำลังโหลดข้อมูลสมาชิก...</td>
            </tr>
            <tr v-else-if="filteredUsers.length === 0" class="text-center">
              <td colspan="6" class="py-12 text-muted">ไม่พบสมาชิกที่ตรงกับการค้นหา</td>
            </tr>
            <tr
              v-for="user in filteredUsers"
              v-else
              :key="user.id"
              class="hover:bg-surface/50 transition-colors"
            >
              <!-- Name & Avatar -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-3">
                  <div
                    class="size-9 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center shrink-0 border border-border text-sm overflow-hidden"
                  >
                    <img
                      v-if="user.avatarMediaId"
                      :src="`/api/admin/media/${user.avatarMediaId}/file`"
                      :alt="user.name"
                      class="size-full object-cover"
                    />
                    <span v-else>{{ user.name.charAt(0).toUpperCase() }}</span>
                  </div>
                  <div>
                    <div class="font-bold text-text flex items-center gap-1.5">
                      <span>{{ user.name }}</span>
                      <span
                        v-if="user.id === currentUserId"
                        class="text-[0.7rem] bg-brand/10 text-brand px-1.5 py-0.5 rounded font-normal"
                      >
                        (คุณ)
                      </span>
                    </div>
                    <p class="text-caption text-muted truncate max-w-xs">
                      {{ user.jobTitle || 'ยังไม่ระบุตำแหน่ง' }}
                    </p>
                  </div>
                </div>
              </td>

              <!-- Email -->
              <td class="py-3.5 px-4 text-text font-mono text-caption">
                {{ user.email }}
              </td>

              <!-- Role Selector -->
              <td class="py-3.5 px-4">
                <select
                  :value="user.role"
                  class="rounded-lg border border-border bg-bg px-2.5 py-1 text-caption font-semibold text-text focus-visible:border-brand cursor-pointer shadow-sm"
                  :disabled="
                    user.role === 'owner' || (user.id === currentUserId && user.role === 'admin')
                  "
                  @change="
                    handleRoleChange(user, ($event.target as HTMLSelectElement).value as any)
                  "
                >
                  <option value="owner" disabled>เจ้าของ</option>
                  <option value="editor">บรรณาธิการ (Editor)</option>
                  <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                </select>
              </td>

              <!-- Profile Status Badge -->
              <td class="py-3.5 px-4">
                <a
                  :href="`/admin/profile/?userId=${user.id}`"
                  class="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                  title="คลิกเพื่อดูหรือแก้ไขโปรไฟล์"
                >
                  <Badge v-if="user.complete" variant="success"> ✓ โปรไฟล์ครบ </Badge>
                  <Badge v-else variant="warning"> ⚠️ ยังไม่ครบ </Badge>
                </a>
              </td>

              <!-- Last Sign In -->
              <td class="py-3.5 px-4 text-caption text-muted tabular-nums">
                {{ formatThaiDateTime(user.lastSignInAt) }}
              </td>

              <!-- Actions -->
              <td class="py-3.5 px-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <a
                    :href="`/admin/profile/?userId=${user.id}`"
                    class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-text hover:border-brand transition-colors"
                  >
                    โปรไฟล์
                  </a>
                  <button
                    v-if="user.id !== currentUserId"
                    type="button"
                    class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-danger hover:bg-danger/10 transition-colors"
                    @click="promptDeleteUser(user)"
                  >
                    ลบ
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 2. Pending Invites Table (DESIGN §10.5) -->
    <div class="rounded-2xl border border-border bg-bg shadow-sm overflow-hidden">
      <div class="p-4 sm:p-5 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="text-h3 font-bold text-text">คำเชิญที่รอดำเนินการ</h2>
          <p class="text-caption text-muted">
            สมาชิกที่ได้รับคำเชิญแล้วแต่ยังไม่ได้เข้าสู่ระบบครั้งแรก
          </p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-body-sm border-collapse">
          <thead>
            <tr class="border-b border-border bg-surface text-caption text-muted">
              <th class="py-3 px-4 font-semibold">อีเมลผู้รับคำเชิญ</th>
              <th class="py-3 px-4 font-semibold">บทบาท</th>
              <th class="py-3 px-4 font-semibold">ผู้ส่งคำเชิญ</th>
              <th class="py-3 px-4 font-semibold">วันที่ส่งคำเชิญ</th>
              <th class="py-3 px-4 text-right font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-if="invites.length === 0" class="text-center">
              <td colspan="5" class="py-8 text-muted">ไม่มีคำเชิญที่รอดำเนินการ</td>
            </tr>
            <tr v-for="inv in invites" v-else :key="inv.id" class="hover:bg-surface/50">
              <td class="py-3.5 px-4 font-mono font-medium text-text">
                {{ inv.email }}
              </td>
              <td class="py-3.5 px-4">
                <Badge :variant="inv.role === 'admin' ? 'info' : 'neutral'">
                  {{ inv.role === 'admin' ? 'ผู้ดูแลระบบ' : 'บรรณาธิการ' }}
                </Badge>
              </td>
              <td class="py-3.5 px-4 text-caption text-muted">
                {{ inv.invitedByName || 'ผู้ดูแลระบบ' }}
              </td>
              <td class="py-3.5 px-4 text-caption text-muted tabular-nums">
                {{ formatThaiDateTime(inv.createdAt) }}
              </td>
              <td class="py-3.5 px-4 text-right">
                <button
                  type="button"
                  class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-danger hover:bg-danger/10 transition-colors"
                  @click="revokeInvite(inv)"
                >
                  ยกเลิกคำเชิญ
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 3. Invite Member Modal -->
    <Modal
      :open="showInviteModal"
      title="เชิญสมาชิกใหม่เข้าร่วมทีม"
      @close="showInviteModal = false"
    >
      <form class="space-y-4" @submit.prevent="sendInvite">
        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text">
            อีเมลของผู้รับคำเชิญ <span class="text-danger">*</span>
          </label>
          <input
            v-model="inviteEmail"
            type="email"
            placeholder="colleague@example.com"
            required
            class="w-full rounded-xl border border-border-input bg-bg px-4 py-2.5 text-body text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text"> บทบาท (Role) </label>
          <select
            v-model="inviteRole"
            class="w-full rounded-xl border border-border-input bg-bg px-3.5 py-2.5 text-body-sm text-text focus-visible:border-brand shadow-sm cursor-pointer"
          >
            <option value="editor">บรรณาธิการ (Editor) - สร้าง แก้ไข และตรวจทานบทความ</option>
            <option value="admin">ผู้ดูแลระบบ (Admin) - จัดการทีม ตั้งค่า และเผยแพร่</option>
          </select>
        </div>

        <!-- Guidance Note per DESIGN §10.5 -->
        <div
          class="rounded-xl border border-border bg-surface p-3.5 text-caption text-muted space-y-1.5"
        >
          <p class="font-semibold text-text">💡 ข้อมูลการเข้าสู่ระบบ:</p>
          <p>
            เมื่อส่งคำเชิญแล้ว สมาชิกสามารถเข้าสู่ระบบได้ที่ URL:
            <code class="text-xs font-mono bg-bg px-1.5 py-0.5 rounded border border-border"
              >/admin/login/</code
            >
            โดยกรอกอีเมลนี้เพื่อรับรหัส OTP 6 หลัก
          </p>
          <p class="text-[0.7rem] text-muted/80">
            * หมายเหตุ: ในโหมด Development รหัส OTP จะแสดงใน Terminal Console และบันทึกในฐานข้อมูล
            D1
          </p>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" @click="showInviteModal = false">
            ยกเลิก
          </Button>
          <Button variant="primary" type="submit" :disabled="inviting">
            <Icon v-if="inviting" name="loader" class="animate-spin" />
            <Icon v-else name="plus" />
            {{ inviting ? 'กำลังส่งคำเชิญ...' : 'ส่งคำเชิญ' }}
          </Button>
        </div>
      </form>
    </Modal>

    <!-- 4. Confirm Delete Dialog -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      title="ยืนยันการลบสมาชิก"
      :message="`คุณต้องการลบ ${userToDelete?.name} (${userToDelete?.email}) ออกจากทีมงานใช่หรือไม่? การกระทำนี้จะเพิกถอนเซสชันการเข้าสู่ระบบทั้งหมดของสมาชิกรายนี้ทันที`"
      confirm-label="ลบสมาชิก"
      variant="danger"
      :loading="deleting"
      @confirm="confirmDeleteUser"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>
