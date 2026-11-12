<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import Input from '../ui/Input.vue';

interface BuildConnection {
  deploy_hook: { configured: boolean; last4: string | null };
  site_url: string;
}

const connection = ref<BuildConnection | null>(null);
const hookUrl = ref('');
const buildToken = ref('');
const saving = ref(false);
const revealing = ref(false);
// True while the admin replaces a hook that is already set.
const editing = ref(false);
const hookForm = ref<HTMLFormElement | null>(null);
const maskedRow = ref<HTMLElement | null>(null);

const configured = computed(() => connection.value?.deploy_hook.configured === true);
const last4 = computed(() => connection.value?.deploy_hook.last4 ?? '');
// Only the last four characters ever reach the page; the dots stand in for the rest.
const masked = computed(() => `${'•'.repeat(12)}${last4.value}`);
const showMasked = computed(() => configured.value && !editing.value);

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด ลองอีกครั้ง';
}

async function load() {
  try {
    connection.value = await api<BuildConnection>('/api/admin/settings/build-connection');
  } catch (err: unknown) {
    toast.error(errorMessage(err));
  }
}

// Moves focus after the swap between the masked row and the form, so keyboard users stay in place.
async function focusIn(container: () => HTMLElement | null, selector: string) {
  await nextTick();
  container()?.querySelector<HTMLElement>(selector)?.focus();
}

function startEdit() {
  hookUrl.value = '';
  editing.value = true;
  void focusIn(() => hookForm.value, 'input');
}

function cancelEdit() {
  hookUrl.value = '';
  editing.value = false;
  void focusIn(() => maskedRow.value, 'button');
}

async function saveHook() {
  saving.value = true;
  try {
    await api('/api/admin/settings/deploy-hook', {
      method: 'PUT',
      body: { url: hookUrl.value },
    });
    hookUrl.value = '';
    toast.success('บันทึก Deploy Hook แล้ว');
    await load();
    editing.value = false;
    void focusIn(() => maskedRow.value, 'button');
  } catch (err: unknown) {
    toast.error(errorMessage(err));
  } finally {
    saving.value = false;
  }
}

async function revealToken() {
  revealing.value = true;
  try {
    const res = await api<{ token: string }>('/api/admin/settings/build-token', {
      method: 'POST',
    });
    buildToken.value = res.token;
  } catch (err: unknown) {
    toast.error(errorMessage(err));
  } finally {
    revealing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="rounded-xl border border-border bg-surface p-6 shadow-card">
    <h2 class="text-lg font-bold text-text">การเผยแพร่บทความ</h2>
    <p class="mt-1 text-body-sm text-text-secondary">
      เชื่อมเว็บกับ Workers Builds เพื่อให้บทความที่เผยแพร่ขึ้นเว็บอัตโนมัติ
    </p>

    <ol class="mt-4 list-decimal space-y-4 pl-5 text-body-sm text-text">
      <li>
        ใน Cloudflare เปิด Worker นี้ แล้วไปที่ Settings &gt; Builds &gt; Deploy Hooks เพื่อสร้าง
        Hook จากนั้นวาง URL ด้านล่าง

        <div
          v-if="showMasked"
          ref="maskedRow"
          class="mt-2 flex flex-col gap-1"
          data-test="hook-masked"
        >
          <span id="deploy-hook-label" class="text-sm font-medium">Deploy Hook URL</span>
          <div
            class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg px-3 py-1.5"
          >
            <span class="flex min-w-0 flex-1 items-center gap-2 text-fg">
              <Icon name="lock" :size="16" />
              <span class="truncate font-mono text-sm tracking-wider" aria-hidden="true">
                {{ masked }}
              </span>
              <span class="sr-only">ตั้งค่าแล้ว{{ last4 ? ` ลงท้ายด้วย ${last4}` : '' }}</span>
            </span>
            <Button size="sm" aria-describedby="deploy-hook-label" @click="startEdit"
              >เปลี่ยน</Button
            >
          </div>
          <p class="text-sm text-muted">ตั้งค่าแล้ว ค่าจริงไม่แสดงเพื่อความปลอดภัย</p>
        </div>

        <form
          v-else
          ref="hookForm"
          class="mt-2 space-y-2"
          data-test="hook-form"
          @submit.prevent="saveHook"
        >
          <Input
            v-model="hookUrl"
            label="Deploy Hook URL"
            type="password"
            autocomplete="off"
            :hint="editing ? 'วาง URL ใหม่เพื่อแทนค่าเดิม' : 'ยังไม่ได้ตั้งค่า'"
          />
          <div class="flex gap-2">
            <Button type="submit" size="sm" :loading="saving" :disabled="!hookUrl">บันทึก</Button>
            <Button v-if="editing" size="sm" variant="ghost" :disabled="saving" @click="cancelEdit">
              ยกเลิก
            </Button>
          </div>
        </form>
      </li>
      <li>
        ใน Settings &gt; Builds &gt; Build variables เพิ่มสองค่านี้ แล้ว build ใหม่หนึ่งครั้ง
        <dl class="mt-2 space-y-2">
          <div>
            <dt class="font-medium">BUILD_SITE_URL</dt>
            <dd class="break-all font-mono">{{ connection?.site_url }}</dd>
          </div>
          <div>
            <dt class="font-medium">BUILD_CALLBACK_TOKEN</dt>
            <dd v-if="buildToken" class="break-all font-mono">{{ buildToken }}</dd>
            <dd v-else>
              <Button size="sm" :loading="revealing" @click="revealToken">แสดง token</Button>
            </dd>
          </div>
        </dl>
      </li>
    </ol>
  </div>
</template>
