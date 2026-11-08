<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

interface ProfileData {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor';
  slug: string | null;
  jobTitle: string | null;
  bio: string | null;
  avatarMediaId: string | null;
  sameAs: string[];
  knowsAbout: string[];
  complete: boolean;
  createdAt: number;
}

const props = defineProps<{
  /** Optional target userId when an admin edits another user's profile */
  targetUserId?: string;
}>();

const loading = ref(true);
const saving = ref(false);
const originalSlug = ref<string | null>(null);

// Form fields
const id = ref('');
const email = ref('');
const name = ref('');
const role = ref<'admin' | 'editor'>('editor');
const slug = ref('');
const jobTitle = ref('');
const bio = ref('');
const avatarMediaId = ref('');
const sameAs = ref<string[]>([]);
const knowsAbout = ref<string[]>([]);
const isComplete = ref(false);

// New item inputs
const newLink = ref('');
const newTopic = ref('');

// Grapheme counting helper using Thai segmenter
const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('th', { granularity: 'grapheme' })
    : null;

function countGraphemes(text: string): number {
  if (!text) return 0;
  if (!segmenter) return Array.from(text).length;
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

const bioGraphemes = computed(() => countGraphemes(bio.value));
const jobTitleGraphemes = computed(() => countGraphemes(jobTitle.value));
const slugValid = computed(() => !slug.value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.value));

const bioEeatSatisfied = computed(() => bioGraphemes.value >= 150 && bioGraphemes.value <= 600);
const allEeatSatisfied = computed(() => {
  return (
    !!name.value.trim() &&
    !!slug.value.trim() &&
    slugValid.value &&
    !!jobTitle.value.trim() &&
    bioGraphemes.value >= 150 &&
    bioGraphemes.value <= 600
  );
});

async function loadProfile() {
  loading.value = true;
  try {
    const endpoint = props.targetUserId
      ? `/api/admin/team` // fetched from team list or direct profile
      : '/api/admin/profile';

    let data: ProfileData;
    if (props.targetUserId) {
      const res = await api<{ users: ProfileData[] }>('/api/admin/team');
      const target = res.users.find((u) => u.id === props.targetUserId);
      if (!target) throw new Error('ไม่พบข้อมูลผู้ใช้');
      data = target;
    } else {
      data = await api<ProfileData>(endpoint);
    }

    id.value = data.id;
    email.value = data.email;
    name.value = data.name || '';
    role.value = data.role;
    slug.value = data.slug || '';
    originalSlug.value = data.slug || '';
    jobTitle.value = data.jobTitle || '';
    bio.value = data.bio || '';
    avatarMediaId.value = data.avatarMediaId || '';
    sameAs.value = Array.isArray(data.sameAs) ? [...data.sameAs] : [];
    knowsAbout.value = Array.isArray(data.knowsAbout) ? [...data.knowsAbout] : [];
    isComplete.value = data.complete;
  } catch (err: any) {
    toast.error(err.message || 'โหลดข้อมูลโปรไฟล์ไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
}

function addLink() {
  const url = newLink.value.trim();
  if (!url) return;
  if (!url.startsWith('https://')) {
    toast.error('ลิงก์ต้องขึ้นต้นด้วย https:// เท่านั้น');
    return;
  }
  if (sameAs.value.length >= 6) {
    toast.error('เพิ่มลิงก์ภายนอกได้สูงสุด 6 รายการ');
    return;
  }
  if (sameAs.value.includes(url)) {
    toast.error('มีลิงก์นี้ในรายการแล้ว');
    return;
  }
  sameAs.value.push(url);
  newLink.value = '';
}

function removeLink(index: number) {
  sameAs.value.splice(index, 1);
}

function addTopic() {
  const topic = newTopic.value.trim();
  if (!topic) return;
  if (knowsAbout.value.length >= 8) {
    toast.error('เพิ่มความเชี่ยวชาญได้สูงสุด 8 รายการ');
    return;
  }
  if (knowsAbout.value.includes(topic)) {
    toast.error('มีหัวข้อนี้ในรายการแล้ว');
    return;
  }
  knowsAbout.value.push(topic);
  newTopic.value = '';
}

function removeTopic(index: number) {
  knowsAbout.value.splice(index, 1);
}

async function saveProfile() {
  if (!slugValid.value) {
    toast.error('กรุณาแก้ไข Slug ให้ถูกต้อง (ตัวพิมพ์เล็ก ตัวเลข และขีดกลาง)');
    return;
  }

  saving.value = true;
  try {
    const payload = {
      name: name.value.trim(),
      slug: slug.value.trim() || null,
      jobTitle: jobTitle.value.trim() || null,
      bio: bio.value.trim() || null,
      avatarMediaId: avatarMediaId.value.trim() || null,
      sameAs: sameAs.value,
      knowsAbout: knowsAbout.value,
    };

    const endpoint = props.targetUserId
      ? `/api/admin/team/users/${props.targetUserId}/profile`
      : '/api/admin/profile';

    const updated = await api<ProfileData>(endpoint, {
      method: 'PATCH',
      body: payload,
    });

    isComplete.value = updated.complete;
    originalSlug.value = updated.slug;
    toast.success('บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว');
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'SLUG_TAKEN') {
      toast.error(`Slug "${slug.value}" ถูกใช้งานโดยสมาชิกคนอื่นแล้ว`);
    } else {
      toast.error(err.message || 'บันทึกโปรไฟล์ไม่สำเร็จ ลองอีกครั้ง');
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadProfile();
});
</script>

<template>
  <div class="space-y-6">
    <!-- E-E-A-T Info Banner (DESIGN §10.5) -->
    <div class="rounded-2xl border border-brand/20 bg-brand/5 p-4 sm:p-5 flex items-start gap-4">
      <div class="p-2 rounded-xl bg-brand/10 text-brand shrink-0">
        <Icon name="user" :size="24" />
      </div>
      <div class="space-y-1 text-body-sm">
        <p class="font-bold text-text">ทำไมโปรไฟล์ผู้เขียน E-E-A-T ถึงสำคัญ?</p>
        <p class="text-text-secondary leading-relaxed">
          บทความจะเผยแพร่ได้เมื่อโปรไฟล์ผู้เขียนครบสมบูรณ์ เพราะผู้อ่านและ Google ต้องรู้ว่าใครเขียน
          โดยระบบจะนำข้อมูลนี้ไปสร้างหน้า
          <code class="text-xs bg-bg px-1.5 py-0.5 rounded border border-border"
            >/authors/[slug]/</code
          >
          และกล่องข้อมูลผู้เขียนท้ายบทความตามมาตรฐาน E-E-A-T (Experience, Expertise,
          Authoritativeness, Trustworthiness)
        </p>
      </div>
    </div>

    <!-- Main Editor Grid (Form + Live Author Box Preview) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- Left Column: Form Fields (7 cols) -->
      <div class="lg:col-span-7 space-y-6">
        <div class="rounded-2xl border border-border bg-bg p-6 shadow-sm space-y-6">
          <!-- Status Indicator Header -->
          <div class="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 class="text-h3 font-bold text-text">ข้อมูลผู้เขียน</h2>
              <p class="text-caption text-muted">
                อีเมลบัญชี: {{ email }} ({{ role === 'admin' ? 'ผู้ดูแลระบบ' : 'บรรณาธิการ' }})
              </p>
            </div>
            <div>
              <Badge v-if="allEeatSatisfied" variant="success"> ✓ โปรไฟล์ครบ (E-E-A-T ผ่าน) </Badge>
              <Badge v-else variant="warning"> ⚠️ โปรไฟล์ยังไม่ครบ </Badge>
            </div>
          </div>

          <!-- Display Name -->
          <div class="space-y-1.5">
            <label class="block text-body-sm font-semibold text-text">
              ชื่อ-นามสกุลที่แสดง (Display Name) <span class="text-danger">*</span>
            </label>
            <input
              v-model="name"
              type="text"
              placeholder="เช่น ณัฐวุฒิ แสงทอง"
              class="w-full rounded-xl border border-border-input bg-bg px-4 py-2.5 text-body text-text placeholder:text-muted focus-visible:border-brand shadow-sm transition-colors"
            />
          </div>

          <!-- Slug -->
          <div class="space-y-1.5">
            <label class="block text-body-sm font-semibold text-text">
              Slug สำหรับ URL โปรไฟล์ <span class="text-danger">*</span>
            </label>
            <div
              class="flex items-center rounded-xl border border-border-input bg-bg px-3 py-1.5 focus-within:border-brand focus-within:outline-1 focus-within:outline-brand focus-within:outline"
            >
              <span class="text-caption text-muted font-mono select-none">/authors/</span>
              <input
                v-model="slug"
                type="text"
                placeholder="nattawut-saengthong"
                class="w-full text-caption font-mono text-text bg-transparent border-0 p-1 focus:ring-0 focus:outline-none"
              />
              <span class="text-caption text-muted font-mono select-none">/</span>
            </div>
            <p v-if="!slugValid" class="text-caption text-danger">
              ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น (a-z, 0-9, -)
            </p>
            <p
              v-if="originalSlug && slug !== originalSlug"
              class="text-caption text-warning bg-warning/10 p-2.5 rounded-lg border border-warning/30"
            >
              ⚠️ คุณกำลังแก้ไข slug หากมีบทความเผยแพร่อยู่แล้ว ระบบจะสร้างการส่งต่อ (301 redirect)
              จาก URL เดิมให้อัตโนมัติ
            </p>
          </div>

          <!-- Job Title -->
          <div class="space-y-1.5">
            <div class="flex justify-between items-center">
              <label class="block text-body-sm font-semibold text-text">
                ตำแหน่ง / บทบาทความเชี่ยวชาญ (Job Title) <span class="text-danger">*</span>
              </label>
              <span class="text-caption text-muted tabular-nums"
                >{{ jobTitleGraphemes }}/80 ตัวอักษร</span
              >
            </div>
            <input
              v-model="jobTitle"
              type="text"
              placeholder="เช่น บรรณาธิการข่าวด้านเทคโนโลยีและความปลอดภัยทางไซเบอร์"
              class="w-full rounded-xl border border-border-input bg-bg px-4 py-2.5 text-body text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
            />
          </div>

          <!-- Bio -->
          <div class="space-y-1.5">
            <div class="flex justify-between items-center">
              <label class="block text-body-sm font-semibold text-text">
                ประวัติย่อและประสบการณ์ (Bio) <span class="text-danger">*</span>
              </label>
              <span
                :class="[
                  'text-caption tabular-nums font-semibold',
                  bioEeatSatisfied ? 'text-success' : 'text-warning',
                ]"
              >
                {{ bioGraphemes }}/600 ตัวอักษร
                <span v-if="bioGraphemes < 150">(ขาดอีก {{ 150 - bioGraphemes }} ตัวอักษร)</span>
              </span>
            </div>
            <textarea
              v-model="bio"
              rows="4"
              placeholder="ระบุประสบการณ์ ความเชี่ยวชาญ วุฒิการศึกษา หรือประวัติการทำงานเพื่อความน่าเชื่อถือตามเกณฑ์ E-E-A-T (ความยาวอย่างน้อย 150 ตัวอักษร)..."
              class="w-full rounded-xl border border-border-input bg-bg p-3 text-body-sm text-text placeholder:text-muted focus-visible:border-brand resize-none leading-relaxed shadow-sm"
            ></textarea>
            <div class="h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
              <div
                class="h-full transition-all duration-300 rounded-full"
                :class="bioEeatSatisfied ? 'bg-success' : 'bg-warning'"
                :style="{ width: `${Math.min(100, (bioGraphemes / 150) * 100)}%` }"
              ></div>
            </div>
            <p class="text-[0.75rem] text-muted">
              เกณฑ์ E-E-A-T กำหนดให้ประวัติย่อมีความยาวระหว่าง 150 ถึง 600 ตัวอักษร
            </p>
          </div>

          <!-- Avatar Media ID -->
          <div class="space-y-1.5">
            <label class="block text-body-sm font-semibold text-text">
              รหัสรูปภาพประจำตัว (Avatar Media ID)
            </label>
            <input
              v-model="avatarMediaId"
              type="text"
              placeholder="UUID ของรูปภาพใน Media Library (ไม่บังคับ)"
              class="w-full rounded-xl border border-border-input bg-bg px-4 py-2 text-body-sm font-mono text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
            />
            <p class="text-[0.75rem] text-muted">
              รูปภาพสี่เหลี่ยมจัตุรัส จะแสดงที่ขนาด 72px ท้ายบทความ
            </p>
          </div>

          <!-- External Profile Links (sameAs) -->
          <div class="space-y-3 pt-2 border-t border-border">
            <div class="flex justify-between items-center">
              <div>
                <label class="block text-body-sm font-semibold text-text">
                  ลิงก์โปรไฟล์ภายนอก (Same-As URLs)
                </label>
                <p class="text-caption text-muted">
                  เช่น LinkedIn, X (Twitter), Facebook, GitHub หรือบล็อกส่วนตัว (สูงสุด 6 รายการ)
                </p>
              </div>
              <span class="text-caption text-muted tabular-nums">{{ sameAs.length }}/6</span>
            </div>

            <!-- Existing Links List -->
            <div v-if="sameAs.length > 0" class="space-y-2">
              <div
                v-for="(link, idx) in sameAs"
                :key="idx"
                class="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-body-sm font-mono"
              >
                <span class="truncate text-text">{{ link }}</span>
                <button
                  type="button"
                  class="p-1 rounded-lg hover:bg-bg text-muted hover:text-danger ml-2"
                  title="ลบลิงก์"
                  @click="removeLink(idx)"
                >
                  <Icon name="x" :size="16" />
                </button>
              </div>
            </div>

            <!-- Add Link Row -->
            <div v-if="sameAs.length < 6" class="flex gap-2">
              <input
                v-model="newLink"
                type="url"
                placeholder="https://linkedin.com/in/username"
                class="flex-1 rounded-xl border border-border-input bg-bg px-3 py-2 text-body-sm font-mono text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
                @keydown.enter.prevent="addLink"
              />
              <Button variant="secondary" size="sm" type="button" @click="addLink">
                + เพิ่มลิงก์
              </Button>
            </div>
          </div>

          <!-- Expertise Topics (knowsAbout) -->
          <div class="space-y-3 pt-2 border-t border-border">
            <div class="flex justify-between items-center">
              <div>
                <label class="block text-body-sm font-semibold text-text">
                  หัวข้อความเชี่ยวชาญ (Knows About)
                </label>
                <p class="text-caption text-muted">
                  คำสำคัญด้านความเชี่ยวชาญสำหรับ Structured Data ของ Google (สูงสุด 8 รายการ)
                </p>
              </div>
              <span class="text-caption text-muted tabular-nums">{{ knowsAbout.length }}/8</span>
            </div>

            <!-- Topics Chips -->
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(topic, idx) in knowsAbout"
                :key="idx"
                class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-caption font-medium text-text"
              >
                {{ topic }}
                <button
                  type="button"
                  class="text-muted hover:text-danger rounded-full"
                  @click="removeTopic(idx)"
                >
                  <Icon name="x" :size="14" />
                </button>
              </span>
            </div>

            <!-- Add Topic Row -->
            <div v-if="knowsAbout.length < 8" class="flex gap-2">
              <input
                v-model="newTopic"
                type="text"
                placeholder="เช่น การเงินส่วนบุคคล, Wi-Fi, Cyber Security"
                class="flex-1 rounded-xl border border-border-input bg-bg px-3 py-2 text-body-sm text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
                @keydown.enter.prevent="addTopic"
              />
              <Button variant="secondary" size="sm" type="button" @click="addTopic">
                + เพิ่มหัวข้อ
              </Button>
            </div>
          </div>

          <!-- Save Button -->
          <div class="pt-4 border-t border-border flex justify-end">
            <Button
              variant="primary"
              size="md"
              type="button"
              :disabled="saving"
              @click="saveProfile"
            >
              <Icon v-if="saving" name="loader" class="animate-spin" />
              <Icon v-else name="check" />
              {{ saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลโปรไฟล์' }}
            </Button>
          </div>
        </div>
      </div>

      <!-- Right Column: Live Author Box Preview (5 cols) -->
      <div class="lg:col-span-5 space-y-4 lg:sticky lg:top-8">
        <div class="rounded-2xl border border-border bg-bg p-5 shadow-sm space-y-3">
          <div class="flex items-center gap-2 text-brand font-bold text-body-sm">
            <Icon name="eye" :size="18" />
            <span>ตัวอย่างกล่องผู้เขียน (Author Box Live Preview)</span>
          </div>
          <p class="text-caption text-muted leading-relaxed">
            นี่คือรูปแบบที่ผู้อ่านจะเห็นจริงที่ท้ายบทความบนหน้าเว็บไซต์สาธารณะ
          </p>

          <!-- Rendered Author Box (Exact replica of public article author box) -->
          <div class="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <div class="flex gap-4 items-start">
              <!-- Avatar Circle -->
              <div
                class="size-16 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xl border border-border shrink-0 overflow-hidden"
              >
                <img
                  v-if="avatarMediaId"
                  :src="`/api/admin/media/${avatarMediaId}/file`"
                  :alt="name || 'Author'"
                  class="size-full object-cover"
                />
                <span v-else>{{ (name || email || 'A').charAt(0).toUpperCase() }}</span>
              </div>

              <!-- Author Info -->
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-baseline gap-2">
                  <span class="text-body font-bold text-text truncate">
                    {{ name || 'ยังไม่ระบุชื่อ' }}
                  </span>
                </div>
                <p class="text-caption text-muted">
                  {{ jobTitle || 'ยังไม่ระบุตำแหน่งความเชี่ยวชาญ' }}
                </p>
                <p class="mt-2 text-body-sm text-text-secondary leading-relaxed line-clamp-3">
                  {{ bio || 'ยังไม่ได้ระบุประวัติย่อของผู้เขียน...' }}
                </p>

                <!-- SameAs Links -->
                <div v-if="sameAs.length > 0" class="mt-3 flex flex-wrap gap-2 text-caption">
                  <span
                    v-for="(link, idx) in sameAs"
                    :key="idx"
                    class="inline-flex items-center text-brand font-medium hover:underline text-xs"
                  >
                    ↗ {{ link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }}
                  </span>
                </div>

                <!-- KnowsAbout Chips in preview -->
                <div v-if="knowsAbout.length > 0" class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="(topic, idx) in knowsAbout"
                    :key="idx"
                    class="px-2 py-0.5 rounded-full bg-bg text-[0.7rem] text-muted border border-border"
                  >
                    #{{ topic }}
                  </span>
                </div>

                <div class="mt-3">
                  <span class="inline-flex items-center text-caption font-semibold text-brand">
                    บทความทั้งหมดของผู้เขียน →
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- E-E-A-T Checklist Card -->
          <div class="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-2 text-caption">
            <p class="font-bold text-text">เช็กลิสต์ความสมบูรณ์ E-E-A-T:</p>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span :class="name.trim() ? 'text-success' : 'text-danger font-bold'">
                  {{ name.trim() ? '✓' : '✗' }}
                </span>
                <span>ระบุชื่อ-นามสกุลจริง</span>
              </div>
              <div class="flex items-center gap-2">
                <span :class="slug.trim() && slugValid ? 'text-success' : 'text-danger font-bold'">
                  {{ slug.trim() && slugValid ? '✓' : '✗' }}
                </span>
                <span>ระบุ Slug ถูกต้องตามรูปแบบ</span>
              </div>
              <div class="flex items-center gap-2">
                <span :class="jobTitle.trim() ? 'text-success' : 'text-danger font-bold'">
                  {{ jobTitle.trim() ? '✓' : '✗' }}
                </span>
                <span>ระบุตำแหน่งหรือความเชี่ยวชาญ</span>
              </div>
              <div class="flex items-center gap-2">
                <span :class="bioEeatSatisfied ? 'text-success' : 'text-danger font-bold'">
                  {{ bioEeatSatisfied ? '✓' : '✗' }}
                </span>
                <span>ประวัติย่อมีความยาวอย่างน้อย 150 ตัวอักษร</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
