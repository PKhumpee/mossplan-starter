<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import Icon from '../ui/Icon.vue';
import Modal from '../ui/Modal.vue';

interface CategoryItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  articleCount: number;
  createdAt: number;
  updatedAt: number;
}

interface TagItem {
  id: string;
  slug: string;
  name: string;
  articleCount: number;
  createdAt: number;
}

const activeTab = ref<'categories' | 'tags'>('categories');
const loading = ref(true);

// Data lists
const categories = ref<CategoryItem[]>([]);
const tags = ref<TagItem[]>([]);
const tagSearch = ref('');

// Category Modal
const showCategoryModal = ref(false);
const editingCategory = ref<CategoryItem | null>(null);
const catName = ref('');
const catSlug = ref('');
const catDescription = ref('');
const savingCategory = ref(false);

// Tag Modal
const showTagModal = ref(false);
const editingTag = ref<TagItem | null>(null);
const tagName = ref('');
const tagSlug = ref('');
const savingTag = ref(false);

// Delete Confirmation
const showDeleteConfirm = ref(false);
const itemToDelete = ref<{ type: 'category' | 'tag'; id: string; name: string } | null>(null);
const deleting = ref(false);

// Thai word counter helper using Intl.Segmenter
const wordSegmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('th', { granularity: 'word' })
    : null;

function countWords(text: string): number {
  if (!text) return 0;
  if (!wordSegmenter) return text.trim().split(/\s+/).filter(Boolean).length;
  let count = 0;
  for (const seg of wordSegmenter.segment(text)) {
    if (seg.isWordLike) count++;
  }
  return count;
}

const catWordsCount = computed(() => countWords(catDescription.value));
const catWordsWarning = computed(() => catWordsCount.value < 100);

const slugValid = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

async function loadData() {
  loading.value = true;
  try {
    const [catsRes, tagsRes] = await Promise.all([
      api<CategoryItem[]>('/api/admin/categories'),
      api<TagItem[]>('/api/admin/tags'),
    ]);
    categories.value = catsRes || [];
    tags.value = tagsRes || [];
  } catch (err: any) {
    toast.error(err.message || 'โหลดข้อมูลไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
}

// -------------------------------- Category Actions
function openCreateCategory() {
  editingCategory.value = null;
  catName.value = '';
  catSlug.value = '';
  catDescription.value = '';
  showCategoryModal.value = true;
}

function openEditCategory(cat: CategoryItem) {
  editingCategory.value = cat;
  catName.value = cat.name;
  catSlug.value = cat.slug;
  catDescription.value = cat.description || '';
  showCategoryModal.value = true;
}

async function saveCategory() {
  if (!catName.value.trim()) {
    toast.error('กรุณาระบุชื่อหมวดหมู่');
    return;
  }
  if (!slugValid(catSlug.value.trim())) {
    toast.error('Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น');
    return;
  }

  savingCategory.value = true;
  try {
    const payload = {
      name: catName.value.trim(),
      slug: catSlug.value.trim(),
      description: catDescription.value.trim() || null,
    };

    if (editingCategory.value) {
      const updated = await api<CategoryItem>(`/api/admin/categories/${editingCategory.value.id}`, {
        method: 'PATCH',
        body: payload,
      });
      const idx = categories.value.findIndex((c) => c.id === updated.id);
      if (idx !== -1) {
        categories.value[idx] = { ...categories.value[idx], ...updated };
      }
      toast.success('อัปเดตหมวดหมู่เรียบร้อยแล้ว');
    } else {
      const created = await api<CategoryItem>('/api/admin/categories', {
        method: 'POST',
        body: payload,
      });
      categories.value.push(created);
      toast.success('สร้างหมวดหมู่ใหม่เรียบร้อยแล้ว');
    }
    showCategoryModal.value = false;
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'SLUG_TAKEN') {
      toast.error(`Slug "${catSlug.value}" ถูกใช้งานแล้ว`);
    } else {
      toast.error(err.message || 'บันทึกหมวดหมู่ไม่สำเร็จ');
    }
  } finally {
    savingCategory.value = false;
  }
}

async function moveCategory(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= categories.value.length) return;

  const current = categories.value[index]!;
  const target = categories.value[targetIndex]!;

  const tempOrder = current.sortOrder;
  current.sortOrder = target.sortOrder;
  target.sortOrder = tempOrder;

  // Swap in array
  categories.value[index] = target;
  categories.value[targetIndex] = current;

  try {
    await Promise.all([
      api(`/api/admin/categories/${current.id}`, {
        method: 'PATCH',
        body: { sortOrder: current.sortOrder },
      }),
      api(`/api/admin/categories/${target.id}`, {
        method: 'PATCH',
        body: { sortOrder: target.sortOrder },
      }),
    ]);
    toast.success('สลับลำดับหมวดหมู่เรียบร้อย');
  } catch (err: any) {
    toast.error('บันทึกลำดับไม่สำเร็จ');
    await loadData();
  }
}

// -------------------------------- Tag Actions
function openCreateTag() {
  editingTag.value = null;
  tagName.value = '';
  tagSlug.value = '';
  showTagModal.value = true;
}

function openEditTag(tag: TagItem) {
  editingTag.value = tag;
  tagName.value = tag.name;
  tagSlug.value = tag.slug;
  showTagModal.value = true;
}

async function saveTag() {
  if (!tagName.value.trim()) {
    toast.error('กรุณาระบุชื่อแท็ก');
    return;
  }
  if (!slugValid(tagSlug.value.trim())) {
    toast.error('Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น');
    return;
  }

  savingTag.value = true;
  try {
    const payload = {
      name: tagName.value.trim(),
      slug: tagSlug.value.trim(),
    };

    if (editingTag.value) {
      const updated = await api<TagItem>(`/api/admin/tags/${editingTag.value.id}`, {
        method: 'PATCH',
        body: payload,
      });
      const idx = tags.value.findIndex((t) => t.id === updated.id);
      if (idx !== -1) tags.value[idx] = { ...tags.value[idx], ...updated };
      toast.success('อัปเดตแท็กเรียบร้อยแล้ว');
    } else {
      const created = await api<TagItem>('/api/admin/tags', {
        method: 'POST',
        body: payload,
      });
      tags.value.push(created);
      toast.success('สร้างแท็กใหม่เรียบร้อยแล้ว');
    }
    showTagModal.value = false;
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'SLUG_TAKEN') {
      toast.error(`Slug "${tagSlug.value}" ถูกใช้งานแล้ว`);
    } else {
      toast.error(err.message || 'บันทึกแท็กไม่สำเร็จ');
    }
  } finally {
    savingTag.value = false;
  }
}

// -------------------------------- Delete
function promptDelete(type: 'category' | 'tag', item: { id: string; name: string }) {
  itemToDelete.value = { type, id: item.id, name: item.name };
  showDeleteConfirm.value = true;
}

async function confirmDelete() {
  if (!itemToDelete.value) return;
  const { type, id, name } = itemToDelete.value;
  deleting.value = true;

  try {
    if (type === 'category') {
      await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
      categories.value = categories.value.filter((c) => c.id !== id);
      toast.success(`ลบหมวดหมู่ "${name}" เรียบร้อย`);
    } else {
      await api(`/api/admin/tags/${id}`, { method: 'DELETE' });
      tags.value = tags.value.filter((t) => t.id !== id);
      toast.success(`ลบแท็ก "${name}" เรียบร้อย`);
    }
    showDeleteConfirm.value = false;
  } catch (err: any) {
    if (err instanceof ApiError && err.code === 'CATEGORY_IN_USE') {
      toast.error(`ไม่สามารถลบได้: มีบทความกำลังใช้งานหมวดหมู่นี้อยู่`);
    } else {
      toast.error(err.message || 'ลบไม่สำเร็จ');
    }
  } finally {
    deleting.value = false;
  }
}

const filteredTags = computed(() => {
  const q = tagSearch.value.toLowerCase().trim();
  if (!q) return tags.value;
  return tags.value.filter(
    (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
  );
});

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Tab Switcher -->
    <div class="flex items-center gap-3 border-b border-border pb-3">
      <button
        type="button"
        :class="[
          'px-4 py-2 rounded-xl text-body-sm font-bold transition-all',
          activeTab === 'categories'
            ? 'bg-brand text-brand-contrast shadow-sm'
            : 'bg-surface text-text hover:bg-border/60',
        ]"
        @click="activeTab = 'categories'"
      >
        หมวดหมู่หลัก ({{ categories.length }})
      </button>
      <button
        type="button"
        :class="[
          'px-4 py-2 rounded-xl text-body-sm font-bold transition-all',
          activeTab === 'tags'
            ? 'bg-brand text-brand-contrast shadow-sm'
            : 'bg-surface text-text hover:bg-border/60',
        ]"
        @click="activeTab = 'tags'"
      >
        แท็กบทความ ({{ tags.length }})
      </button>
    </div>

    <!-- 1. CATEGORIES TAB -->
    <div v-if="activeTab === 'categories'" class="space-y-6">
      <div class="flex justify-between items-center">
        <p class="text-caption text-muted">
          หมวดหมู่หลักจะปรากฏในแถบเมนูด้านบนของเว็บไซต์ และเป็นส่วนโครงสร้างหลักสำหรับ SEO
        </p>
        <Button variant="primary" size="md" type="button" @click="openCreateCategory">
          <Icon name="plus" />
          สร้างหมวดหมู่ใหม่
        </Button>
      </div>

      <!-- Categories Table (DESIGN §10.4) -->
      <div class="rounded-2xl border border-border bg-bg shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-body-sm border-collapse">
            <thead>
              <tr class="border-b border-border bg-surface text-caption text-muted">
                <th class="py-3 px-3 text-center w-16">ลำดับ</th>
                <th class="py-3 px-4 font-semibold">ชื่อหมวดหมู่</th>
                <th class="py-3 px-4 font-semibold">Slug (URL)</th>
                <th class="py-3 px-4 font-semibold">คำอธิบายหมวดหมู่ (SEO Intro)</th>
                <th class="py-3 px-4 text-center font-semibold">จำนวนบทความ</th>
                <th class="py-3 px-4 text-right font-semibold">การจัดการ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-if="categories.length === 0" class="text-center">
                <td colspan="6" class="py-12 text-muted">ยังไม่มีหมวดหมู่ในระบบ</td>
              </tr>
              <tr
                v-for="(cat, idx) in categories"
                v-else
                :key="cat.id"
                class="hover:bg-surface/50 transition-colors"
              >
                <!-- Reorder buttons -->
                <td class="py-3 px-3 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      class="p-1 rounded hover:bg-surface text-muted disabled:opacity-30"
                      :disabled="idx === 0"
                      title="เลื่อนขึ้น"
                      @click="moveCategory(idx, 'up')"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      class="p-1 rounded hover:bg-surface text-muted disabled:opacity-30"
                      :disabled="idx === categories.length - 1"
                      title="เลื่อนลง"
                      @click="moveCategory(idx, 'down')"
                    >
                      ▼
                    </button>
                  </div>
                </td>

                <!-- Category Name -->
                <td class="py-3.5 px-4 font-bold text-text">
                  {{ cat.name }}
                </td>

                <!-- Slug -->
                <td class="py-3.5 px-4 font-mono text-caption text-brand">
                  /category/{{ cat.slug }}/
                </td>

                <!-- Description with Warning if < 100 words (DESIGN §10.4) -->
                <td class="py-3.5 px-4 max-w-sm">
                  <div class="flex items-center gap-2">
                    <span
                      v-if="countWords(cat.description || '') < 100"
                      class="inline-flex items-center text-warning"
                      title="คำอธิบายหมวดหมู่สั้นกว่า 100 คำ มักไม่ติดอันดับการค้นหาของ Google"
                    >
                      ⚠️
                    </span>
                    <span class="text-caption text-text-secondary truncate">
                      {{ cat.description || '(ยังไม่มีคำอธิบายหมวดหมู่)' }}
                    </span>
                  </div>
                </td>

                <!-- Article Count -->
                <td class="py-3.5 px-4 text-center tabular-nums">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption bg-surface text-text border border-border"
                  >
                    {{ cat.articleCount }} เรื่อง
                  </span>
                </td>

                <!-- Actions -->
                <td class="py-3.5 px-4 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-text hover:border-brand transition-colors"
                      @click="openEditCategory(cat)"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-danger hover:bg-danger/10 transition-colors"
                      @click="promptDelete('category', cat)"
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
    </div>

    <!-- 2. TAGS TAB -->
    <div v-else class="space-y-6">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <!-- Search -->
        <div class="relative w-full sm:w-72">
          <input
            v-model="tagSearch"
            type="search"
            placeholder="ค้นหาแท็ก..."
            class="w-full rounded-xl border border-border-input bg-bg px-3.5 py-1.5 text-body-sm text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
          />
        </div>

        <Button variant="primary" size="md" type="button" @click="openCreateTag">
          <Icon name="plus" />
          สร้างแท็กใหม่
        </Button>
      </div>

      <!-- Tags Table (DESIGN §10.4) -->
      <div class="rounded-2xl border border-border bg-bg shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-body-sm border-collapse">
            <thead>
              <tr class="border-b border-border bg-surface text-caption text-muted">
                <th class="py-3 px-4 font-semibold">ชื่อแท็ก</th>
                <th class="py-3 px-4 font-semibold">Slug (URL)</th>
                <th class="py-3 px-4 text-center font-semibold">จำนวนบทความ</th>
                <th class="py-3 px-4 text-right font-semibold">การจัดการ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-if="filteredTags.length === 0" class="text-center">
                <td colspan="4" class="py-12 text-muted">ไม่พบแท็กที่ตรงกับการค้นหา</td>
              </tr>
              <tr
                v-for="tag in filteredTags"
                v-else
                :key="tag.id"
                class="hover:bg-surface/50 transition-colors"
              >
                <!-- Tag Name -->
                <td class="py-3.5 px-4 font-bold text-text">#{{ tag.name }}</td>

                <!-- Slug -->
                <td class="py-3.5 px-4 font-mono text-caption text-brand">/tag/{{ tag.slug }}/</td>

                <!-- Article Count -->
                <td class="py-3.5 px-4 text-center tabular-nums">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption bg-surface text-text border border-border"
                  >
                    {{ tag.articleCount }} เรื่อง
                  </span>
                </td>

                <!-- Actions -->
                <td class="py-3.5 px-4 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-text hover:border-brand transition-colors"
                      @click="openEditTag(tag)"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-lg border border-border bg-surface text-caption font-semibold text-danger hover:bg-danger/10 transition-colors"
                      @click="promptDelete('tag', tag)"
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
    </div>

    <!-- Category Modal -->
    <Modal
      :open="showCategoryModal"
      :title="editingCategory ? 'แก้ไขหมวดหมู่' : 'สร้างหมวดหมู่ใหม่'"
      @close="showCategoryModal = false"
    >
      <form class="space-y-4" @submit.prevent="saveCategory">
        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text">
            ชื่อหมวดหมู่ <span class="text-danger">*</span>
          </label>
          <input
            v-model="catName"
            type="text"
            placeholder="เช่น ไลฟ์สไตล์, เทคโนโลยี"
            required
            class="w-full rounded-xl border border-border-input bg-bg px-4 py-2.5 text-body text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text">
            Slug สำหรับ URL <span class="text-danger">*</span>
          </label>
          <div
            class="flex items-center rounded-xl border border-border-input bg-bg px-3 py-1.5 focus-within:border-brand focus-within:outline-1 focus-within:outline-brand focus-within:outline"
          >
            <span class="text-caption text-muted font-mono select-none">/category/</span>
            <input
              v-model="catSlug"
              type="text"
              placeholder="lifestyle"
              required
              class="w-full text-caption font-mono text-text bg-transparent border-0 p-1 focus:ring-0 focus:outline-none"
            />
            <span class="text-caption text-muted font-mono select-none">/</span>
          </div>
          <p
            v-if="
              editingCategory &&
              editingCategory.slug !== catSlug &&
              editingCategory.articleCount > 0
            "
            class="text-caption text-warning bg-warning/10 p-2.5 rounded-lg border border-warning/30"
          >
            ⚠️ การเปลี่ยน slug จะสร้างการส่งต่อ (301 redirect) จาก URL เดิมให้อัตโนมัติ
          </p>
        </div>

        <!-- Description with Thai Word Counter (DESIGN §10.4) -->
        <div class="space-y-1.5">
          <div class="flex justify-between items-center">
            <label class="block text-body-sm font-semibold text-text">
              คำอธิบายหมวดหมู่ (Public Category Intro)
            </label>
            <span
              :class="[
                'text-caption tabular-nums font-semibold',
                catWordsWarning ? 'text-warning' : 'text-success',
              ]"
            >
              {{ catWordsCount }} คำ
              <span v-if="catWordsWarning">(แนะนำอย่างน้อย 100 คำ)</span>
            </span>
          </div>
          <textarea
            v-model="catDescription"
            rows="5"
            placeholder="เขียนคำอธิบายหมวดหมู่อย่างละเอียด เพื่อเป็นบทนำของหน้าหมวดหมู่สาธารณะและส่งเสริม SEO..."
            class="w-full rounded-xl border border-border-input bg-bg p-3 text-body-sm text-text placeholder:text-muted focus-visible:border-brand resize-none leading-relaxed shadow-sm"
          ></textarea>
          <div
            v-if="catWordsWarning"
            class="text-caption text-warning bg-warning/10 p-2.5 rounded-lg border border-warning/30 flex items-start gap-2"
          >
            <span>⚠️</span>
            <span
              >คำอธิบายหมวดหมู่สั้นเกินไป หน้าหมวดหมู่ที่มีแต่รายการลิงก์มักไม่ติดอันดับการค้นหาของ
              Google</span
            >
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" @click="showCategoryModal = false">
            ยกเลิก
          </Button>
          <Button variant="primary" type="submit" :disabled="savingCategory">
            <Icon v-if="savingCategory" name="loader" class="animate-spin" />
            <Icon v-else name="check" />
            {{ savingCategory ? 'กำลังบันทึก...' : 'บันทึกหมวดหมู่' }}
          </Button>
        </div>
      </form>
    </Modal>

    <!-- Tag Modal -->
    <Modal
      :open="showTagModal"
      :title="editingTag ? 'แก้ไขแท็ก' : 'สร้างแท็กใหม่'"
      @close="showTagModal = false"
    >
      <form class="space-y-4" @submit.prevent="saveTag">
        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text">
            ชื่อแท็ก <span class="text-danger">*</span>
          </label>
          <input
            v-model="tagName"
            type="text"
            placeholder="เช่น ปัญญาประดิษฐ์, การเงิน"
            required
            class="w-full rounded-xl border border-border-input bg-bg px-4 py-2.5 text-body text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-body-sm font-semibold text-text">
            Slug สำหรับ URL <span class="text-danger">*</span>
          </label>
          <div
            class="flex items-center rounded-xl border border-border-input bg-bg px-3 py-1.5 focus-within:border-brand focus-within:outline-1 focus-within:outline-brand focus-within:outline"
          >
            <span class="text-caption text-muted font-mono select-none">/tag/</span>
            <input
              v-model="tagSlug"
              type="text"
              placeholder="ai"
              required
              class="w-full text-caption font-mono text-text bg-transparent border-0 p-1 focus:ring-0 focus:outline-none"
            />
            <span class="text-caption text-muted font-mono select-none">/</span>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" @click="showTagModal = false"> ยกเลิก </Button>
          <Button variant="primary" type="submit" :disabled="savingTag">
            <Icon v-if="savingTag" name="loader" class="animate-spin" />
            <Icon v-else name="check" />
            {{ savingTag ? 'กำลังบันทึก...' : 'บันทึกแท็ก' }}
          </Button>
        </div>
      </form>
    </Modal>

    <!-- Confirm Delete Dialog -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      :title="`ยืนยันการลบ${itemToDelete?.type === 'category' ? 'หมวดหมู่' : 'แท็ก'}`"
      :message="`คุณต้องการลบ ${itemToDelete?.type === 'category' ? 'หมวดหมู่' : 'แท็ก'} &quot;${itemToDelete?.name}&quot; ใช่หรือไม่?`"
      confirm-label="ลบรายการ"
      variant="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>
