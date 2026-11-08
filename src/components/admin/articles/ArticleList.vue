<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import { formatThaiDate } from '../../../lib/format/date';
import Button from '../ui/Button.vue';
import Badge from '../ui/Badge.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import EmptyState from '../ui/EmptyState.vue';
import Spinner from '../ui/Spinner.vue';

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  status: 'draft' | 'scheduled' | 'published';
  publishedAt: number | null;
  contentModifiedAt: number | null;
  updatedAt: number;
  categoryId: string | null;
  categoryName: string | null;
  authorId: string;
  authorName: string | null;
}

interface ArticleResponse {
  items: ArticleItem[];
  page: number;
  limit: number;
  total: number;
  counts: {
    all: number;
    draft: number;
    scheduled: number;
    published: number;
  };
}

const currentTab = ref<'all' | 'draft' | 'scheduled' | 'published'>('all');
const searchQuery = ref('');
const loading = ref(true);
const articles = ref<ArticleItem[]>([]);
const totalCount = ref(0);
const counts = ref({ all: 0, draft: 0, scheduled: 0, published: 0 });

const deleteTarget = ref<ArticleItem | null>(null);
const deleteLoading = ref(false);

async function fetchArticles() {
  loading.value = true;
  try {
    const query: Record<string, string | number> = {
      page: 1,
      limit: 50,
    };
    if (currentTab.value !== 'all') {
      query.status = currentTab.value;
    }
    if (searchQuery.value.trim()) {
      query.q = searchQuery.value.trim();
    }

    const res = await api<ArticleResponse>('/api/admin/articles', { query });
    articles.value = res.items;
    totalCount.value = res.total;
    counts.value = res.counts;
  } catch (err: any) {
    toast.error(err.message || 'โหลดรายการบทความไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
}

watch(currentTab, () => {
  fetchArticles();
});

onMounted(() => {
  fetchArticles();
});

function confirmDelete(art: ArticleItem) {
  deleteTarget.value = art;
}

function onConfirmOpen(open: boolean) {
  if (!open) deleteTarget.value = null;
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  deleteLoading.value = true;
  try {
    await api.delete(`/api/admin/${deleteTarget.value.id}`);
    toast.success('ลบบทความเรียบร้อยแล้ว');
    deleteTarget.value = null;
    await fetchArticles();
  } catch (err: any) {
    toast.error(err.message || 'ลบบทความไม่สำเร็จ');
  } finally {
    deleteLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Action Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <!-- Tabs -->
      <div
        class="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-surface border border-border"
      >
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-lg text-body-sm font-semibold transition-all',
            currentTab === 'all'
              ? 'bg-bg text-text shadow-sm border border-border/80'
              : 'text-muted hover:text-text',
          ]"
          @click="currentTab = 'all'"
        >
          ทั้งหมด <span class="ml-1 text-caption tabular-nums opacity-75">({{ counts.all }})</span>
        </button>
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-lg text-body-sm font-semibold transition-all',
            currentTab === 'draft'
              ? 'bg-bg text-text shadow-sm border border-border/80'
              : 'text-muted hover:text-text',
          ]"
          @click="currentTab = 'draft'"
        >
          ฉบับร่าง
          <span class="ml-1 text-caption tabular-nums opacity-75">({{ counts.draft }})</span>
        </button>
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-lg text-body-sm font-semibold transition-all',
            currentTab === 'scheduled'
              ? 'bg-bg text-text shadow-sm border border-border/80'
              : 'text-muted hover:text-text',
          ]"
          @click="currentTab = 'scheduled'"
        >
          ตั้งเวลา
          <span class="ml-1 text-caption tabular-nums opacity-75">({{ counts.scheduled }})</span>
        </button>
        <button
          type="button"
          :class="[
            'px-3.5 py-1.5 rounded-lg text-body-sm font-semibold transition-all',
            currentTab === 'published'
              ? 'bg-bg text-text shadow-sm border border-border/80'
              : 'text-muted hover:text-text',
          ]"
          @click="currentTab = 'published'"
        >
          เผยแพร่แล้ว
          <span class="ml-1 text-caption tabular-nums opacity-75">({{ counts.published }})</span>
        </button>
      </div>

      <!-- Action Button -->
      <a
        href="/admin/articles/new/"
        class="inline-flex min-h-[40px] items-center justify-center rounded-full bg-brand px-5 py-2 text-body-sm font-semibold text-brand-contrast shadow-sm transition-all hover:bg-brand-deep hover:shadow-card"
      >
        + เขียนบทความใหม่
      </a>
    </div>

    <!-- Search Box -->
    <div class="flex items-center gap-3">
      <div class="relative flex-1 max-w-md">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="ค้นหาชื่อบทความ..."
          class="w-full rounded-xl border border-border-input bg-bg px-4 py-2 text-body-sm text-text placeholder:text-muted focus-visible:border-brand shadow-sm"
          @keydown.enter="fetchArticles"
        />
      </div>
      <button
        type="button"
        class="px-4 py-2 rounded-xl border border-border bg-surface text-body-sm font-semibold text-text hover:border-brand"
        @click="fetchArticles"
      >
        ค้นหา
      </button>
    </div>

    <!-- Table of Articles -->
    <div class="rounded-xl border border-border bg-bg shadow-sm overflow-hidden">
      <div v-if="loading" class="p-12 flex justify-center items-center">
        <Spinner :size="32" />
      </div>

      <div v-else-if="articles.length === 0" class="p-12">
        <EmptyState message="ยังไม่มีบทความในมุมมองนี้ คุณสามารถเริ่มต้นด้วยการเขียนบทความใหม่">
          <template #action>
            <a
              href="/admin/articles/new/"
              class="mt-4 inline-flex items-center rounded-full bg-brand px-5 py-2 text-body-sm font-semibold text-brand-contrast shadow-sm hover:bg-brand-deep"
            >
              เขียนบทความใหม่
            </a>
          </template>
        </EmptyState>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-body-sm border-collapse">
          <thead>
            <tr class="border-b border-border bg-surface/50 text-caption font-semibold text-muted">
              <th class="py-3.5 px-4 sm:px-6">ชื่อบทความ</th>
              <th class="py-3.5 px-4">สถานะ</th>
              <th class="py-3.5 px-4 hidden md:table-cell">หมวดหมู่</th>
              <th class="py-3.5 px-4 hidden lg:table-cell">ผู้เขียน</th>
              <th class="py-3.5 px-4 hidden sm:table-cell">อัปเดตล่าสุด</th>
              <th class="py-3.5 px-4 sm:px-6 text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/60">
            <tr
              v-for="art in articles"
              :key="art.id"
              class="hover:bg-surface/40 transition-colors group"
            >
              <td class="py-4 px-4 sm:px-6">
                <a
                  :href="`/admin/${art.id}/`"
                  class="font-semibold text-text group-hover:text-brand transition-colors block line-clamp-1"
                >
                  {{ art.title }}
                </a>
                <span class="text-caption text-muted font-mono opacity-80 block mt-0.5">
                  /articles/{{ art.slug }}/
                </span>
              </td>
              <td class="py-4 px-4 whitespace-nowrap">
                <Badge :status="art.status">
                  <template v-if="art.status === 'scheduled' && art.publishedAt">
                    ตั้งเวลา ({{ formatThaiDate(art.publishedAt) }})
                  </template>
                </Badge>
              </td>
              <td class="py-4 px-4 hidden md:table-cell text-muted">
                {{ art.categoryName || '—' }}
              </td>
              <td class="py-4 px-4 hidden lg:table-cell text-muted">
                {{ art.authorName || '—' }}
              </td>
              <td class="py-4 px-4 hidden sm:table-cell text-muted tabular-nums">
                {{ formatThaiDate(art.updatedAt) }}
              </td>
              <td class="py-4 px-4 sm:px-6 text-right space-x-2 whitespace-nowrap">
                <a
                  :href="`/admin/preview/${art.id}/`"
                  target="_blank"
                  class="text-caption font-semibold text-muted hover:text-brand transition-colors inline-block py-1"
                >
                  ดูตัวอย่าง
                </a>
                <span class="text-border">·</span>
                <a
                  :href="`/admin/${art.id}/`"
                  class="text-caption font-semibold text-brand hover:text-brand-deep transition-colors inline-block py-1"
                >
                  แก้ไข
                </a>
                <template v-if="art.status !== 'published'">
                  <span class="text-border">·</span>
                  <button
                    type="button"
                    class="text-caption font-semibold text-danger hover:underline inline-block py-1"
                    @click="confirmDelete(art)"
                  >
                    ลบ
                  </button>
                </template>
                <template v-else>
                  <span class="text-border">·</span>
                  <a
                    :href="`/${art.slug}/`"
                    target="_blank"
                    class="text-caption font-semibold text-text-secondary hover:text-brand transition-colors inline-block py-1"
                  >
                    เปิดหน้าเว็บ ↗
                  </a>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <ConfirmDialog
      :open="!!deleteTarget"
      title="ยืนยันการลบบทความ"
      :message="`คุณแน่ใจหรือไม่ว่าต้องการลบบทความ &quot;${deleteTarget?.title}&quot; การกระทำนี้ไม่สามารถย้อนกลับได้`"
      confirm-label="ลบบทความ"
      :danger="true"
      :loading="deleteLoading"
      @confirm="handleDelete"
      @update:open="onConfirmOpen"
    />
  </div>
</template>
