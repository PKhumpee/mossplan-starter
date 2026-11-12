<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../../../../admin-client/api';
import { toast } from '../../../../admin-client/toast';
import Icon from '../Icon.vue';
import { ROLE_LABEL } from './nav';

// The role prop is `userRole`: a prop named `role` clashes with the HTML attribute type under `astro check`.
interface Props {
  name: string;
  email: string;
  userRole: 'owner' | 'admin' | 'editor';
  /** Shows a dot while the author profile is incomplete (DESIGN §10.5). */
  profileIncomplete?: boolean;
}
defineProps<Props>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const busy = ref(false);

function onDocumentClick(event: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

async function signOut(): Promise<void> {
  busy.value = true;
  try {
    await api.post('/api/auth/sign-out/');
    window.location.assign('/admin/login/');
  } catch {
    busy.value = false;
    toast.error('ออกจากระบบไม่สำเร็จ ลองอีกครั้ง');
  }
}
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="inline-flex h-9 items-center gap-2 rounded-md px-2 hover:bg-surface"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon name="user" />
      <span class="hidden max-w-40 truncate sm:inline">{{ name }}</span>
      <span
        v-if="profileIncomplete"
        class="size-2 rounded-full bg-warning"
        role="img"
        aria-label="โปรไฟล์ยังไม่ครบ"
      />
      <Icon name="chevron-down" :size="16" />
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-border bg-bg p-2 shadow-lg"
    >
      <div class="border-b border-border px-2 pb-2">
        <p class="truncate font-medium">{{ name }}</p>
        <p class="truncate text-sm text-muted">{{ email }}</p>
        <p class="text-sm text-muted">{{ ROLE_LABEL[userRole] }}</p>
      </div>
      <a
        href="/admin/profile/"
        class="mt-1 flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface"
      >
        <Icon name="user" :size="18" />โปรไฟล์ของฉัน
      </a>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-surface"
        :disabled="busy"
        @click="signOut"
      >
        <Icon name="logout" :size="18" />ออกจากระบบ
      </button>
    </div>
  </div>
</template>
