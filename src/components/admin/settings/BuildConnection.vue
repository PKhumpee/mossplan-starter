<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Button from '../ui/Button.vue';
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
        <form class="mt-2 space-y-2" @submit.prevent="saveHook">
          <Input
            v-model="hookUrl"
            label="Deploy Hook URL"
            type="password"
            autocomplete="off"
            :hint="
              connection?.deploy_hook.configured
                ? `ตั้งค่าแล้ว ลงท้ายด้วย ${connection.deploy_hook.last4}`
                : 'ยังไม่ได้ตั้งค่า'
            "
          />
          <Button type="submit" size="sm" :loading="saving" :disabled="!hookUrl">บันทึก</Button>
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
