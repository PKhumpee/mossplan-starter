<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '../../../admin-client/api';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';
import Skeleton from '../ui/Skeleton.vue';
import Tabs, { type TabItem } from '../ui/Tabs.vue';
import StatsChart, { type DailyStatPoint } from './StatsChart.vue';

interface StatsSummary {
  days: number;
  period: { start: string; end: string };
  totals: {
    views: number;
    visits: number;
  };
  series: DailyStatPoint[];
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    views: number;
    visits: number;
    percentage: number;
  }>;
  topArticles: Array<{
    id: string | null;
    slug: string;
    title: string;
    path: string;
    category: { id: string; name: string; slug: string } | null;
    views: number;
    visits: number;
    percentage: number;
  }>;
}

interface ArticleStatItem {
  id: string | null;
  slug: string;
  title: string;
  path: string;
  status: string | null;
  category: { id: string; name: string; slug: string } | null;
  views: number;
  visits: number;
  percentage: number;
}

interface ArticlesResponse {
  items: ArticleStatItem[];
  page: number;
  limit: number;
  total: number;
  totalViews: number;
}

const selectedDays = ref<string>('30');
const rangeTabs: TabItem[] = [
  { value: '7', label: '7 วันที่ผ่านมา' },
  { value: '30', label: '30 วันที่ผ่านมา' },
  { value: '90', label: '90 วันที่ผ่านมา' },
];

const loading = ref(true);
const error = ref<string | null>(null);

const summary = ref<StatsSummary | null>(null);
const articles = ref<ArticleStatItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);

async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const daysNum = parseInt(selectedDays.value, 10) || 30;

    const [summaryRes, articlesRes] = await Promise.all([
      api.get<StatsSummary>('/api/admin/stats/summary', { days: daysNum }),
      api.get<ArticlesResponse>('/api/admin/stats/articles', {
        days: daysNum,
        page: page.value,
        limit: limit.value,
      }),
    ]);

    summary.value = summaryRes;
    articles.value = articlesRes.items;
    total.value = articlesRes.total;
  } catch (err: unknown) {
    console.error('Failed to load stats:', err);
    error.value = err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลสถิติได้';
  } finally {
    loading.value = false;
  }
}

watch(selectedDays, () => {
  page.value = 1;
  loadData();
});

watch(page, () => {
  loadData();
});

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Range Selection Tabs & Period Label -->
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4"
    >
      <Tabs v-model="selectedDays" :tabs="rangeTabs" label="ช่วงเวลาของข้อมูลสถิติ" />

      <div v-if="summary?.period" class="text-xs text-muted">
        ช่วงข้อมูล: {{ summary.period.start }} ถึง {{ summary.period.end }} (UTC)
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="error"
      class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-center justify-between"
    >
      <div class="flex items-center gap-2">
        <Icon name="alert" :size="18" />
        <span>{{ error }}</span>
      </div>
      <Button size="sm" variant="ghost" @click="loadData">ลองใหม่</Button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading && !summary" class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton class="h-28 rounded-xl" />
        <Skeleton class="h-28 rounded-xl" />
      </div>
      <Skeleton class="h-64 rounded-xl" />
      <Skeleton class="h-72 rounded-xl" />
    </div>

    <template v-else>
      <!-- Summary Metric Cards (2 Totals per DESIGN §10.6) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Views Total -->
        <div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted">การเข้าชมทั้งหมด (Page Views)</span>
            <div class="size-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="chart" :size="18" />
            </div>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-3xl font-bold tracking-tight text-text">
              {{ (summary?.totals.views ?? 0).toLocaleString('th-TH') }}
            </span>
            <span class="text-xs text-muted">ครั้ง</span>
          </div>
          <p class="mt-1 text-xs text-muted">
            ยอดเปิดอ่านหน้าเว็บในช่วง {{ selectedDays }} วันที่ผ่านมา
          </p>
        </div>

        <!-- Visits Total -->
        <div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-muted">ผู้เข้าชมทั้งหมด (Unique Visits)</span>
            <div
              class="size-8 rounded-lg bg-emerald-600/10 text-emerald-600 flex items-center justify-center"
            >
              <Icon name="users" :size="18" />
            </div>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-3xl font-bold tracking-tight text-text">
              {{ (summary?.totals.visits ?? 0).toLocaleString('th-TH') }}
            </span>
            <span class="text-xs text-muted">ครั้ง</span>
          </div>
          <p class="mt-1 text-xs text-muted">
            จำนวนเซสชันผู้เข้าชมในช่วง {{ selectedDays }} วันที่ผ่านมา
          </p>
        </div>
      </div>

      <!-- Daily Chart as Inline SVG (DESIGN §10.6) -->
      <div class="space-y-2">
        <StatsChart :series="summary?.series ?? []" :loading="loading" />

        <!-- Thai note per DESIGN §10.6 and DESIGN §3 -->
        <div class="flex items-center gap-1.5 px-1 text-xs text-muted">
          <Icon name="info" :size="14" class="text-brand shrink-0" />
          <span>
            ตัวเลขเป็นค่าประมาณจาก Cloudflare Web Analytics อัปเดตวันละครั้ง
            (ตัวเลขเป็นค่าประมาณจากการสุ่มตัวอย่าง)
          </span>
        </div>
      </div>

      <!-- Categories & Top Articles Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Top Categories Breakdown -->
        <div class="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-text flex items-center gap-2">
              <Icon name="tags" :size="18" class="text-brand" />
              หมวดหมู่ยอดนิยม
            </h2>
            <span class="text-xs text-muted">{{ summary?.categories.length ?? 0 }} หมวดหมู่</span>
          </div>

          <div
            v-if="!summary?.categories || summary.categories.length === 0"
            class="py-8 text-center text-xs text-muted"
          >
            ยังไม่มีข้อมูลสถิติของหมวดหมู่
          </div>

          <div v-else class="space-y-3">
            <div v-for="cat in summary.categories" :key="cat.id" class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium text-text truncate">{{ cat.name }}</span>
                <span class="text-muted tabular-nums">
                  {{ cat.views.toLocaleString('th-TH') }} ครั้ง ({{ cat.percentage }}%)
                </span>
              </div>
              <!-- Mini progress bar -->
              <div class="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  class="h-full rounded-full bg-brand transition-all duration-300"
                  :style="{ width: `${Math.min(Math.max(cat.percentage, 2), 100)}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Articles Table (2 Columns Span) -->
        <div class="lg:col-span-2 rounded-xl border border-border bg-surface p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-text flex items-center gap-2">
              <Icon name="article" :size="18" class="text-brand" />
              บทความที่มีผู้อ่านมากที่สุด
            </h2>
            <span class="text-xs text-muted">{{ total }} บทความ</span>
          </div>

          <div v-if="articles.length === 0" class="py-12 text-center text-sm text-muted">
            ยังไม่มีข้อมูลการเปิดอ่านบทความในช่วงเวลานี้
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-border text-muted">
                  <th class="py-2.5 px-3 font-medium">ชื่อบทความ</th>
                  <th class="py-2.5 px-3 font-medium">หมวดหมู่</th>
                  <th class="py-2.5 px-3 font-medium text-right">การเข้าชม</th>
                  <th class="py-2.5 px-3 font-medium text-right">ผู้เข้าชม</th>
                  <th class="py-2.5 px-3 font-medium text-right">สัดส่วน</th>
                  <th class="py-2.5 px-3 font-medium text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="item in articles"
                  :key="item.slug"
                  class="hover:bg-bg/50 transition-colors"
                >
                  <td class="py-2.5 px-3">
                    <a
                      :href="item.path"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-text hover:text-brand transition-colors line-clamp-1"
                      :title="item.title"
                    >
                      {{ item.title }}
                    </a>
                    <span class="text-[11px] text-muted font-mono">{{ item.path }}</span>
                  </td>
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span
                      v-if="item.category"
                      class="inline-block rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand"
                    >
                      {{ item.category.name }}
                    </span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="py-2.5 px-3 text-right font-semibold tabular-nums text-text">
                    {{ item.views.toLocaleString('th-TH') }}
                  </td>
                  <td class="py-2.5 px-3 text-right tabular-nums text-muted">
                    {{ item.visits.toLocaleString('th-TH') }}
                  </td>
                  <td class="py-2.5 px-3 text-right tabular-nums text-muted whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                      <div class="h-1.5 w-12 rounded-full bg-border overflow-hidden">
                        <div
                          class="h-full rounded-full bg-brand"
                          :style="{ width: `${Math.min(Math.max(item.percentage, 2), 100)}%` }"
                        ></div>
                      </div>
                      <span>{{ item.percentage }}%</span>
                    </div>
                  </td>
                  <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <a
                      v-if="item.id"
                      :href="`/admin/articles/${item.id}`"
                      class="inline-flex items-center text-xs font-medium text-brand hover:underline"
                    >
                      แก้ไข
                    </a>
                    <span v-else class="text-muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div
            v-if="total > limit"
            class="flex items-center justify-between border-t border-border pt-3 text-xs"
          >
            <span class="text-muted">
              แสดง {{ (page - 1) * limit + 1 }}–{{ Math.min(page * limit, total) }} จาก
              {{ total }} รายการ
            </span>
            <div class="flex items-center gap-2">
              <Button size="sm" variant="ghost" :disabled="page <= 1" @click="page--">
                <Icon name="chevron-left" :size="14" />
                ก่อนหน้า
              </Button>
              <span class="text-text font-medium"
                >หน้า {{ page }} / {{ Math.ceil(total / limit) }}</span
              >
              <Button
                size="sm"
                variant="ghost"
                :disabled="page >= Math.ceil(total / limit)"
                @click="page++"
              >
                ถัดไป
                <Icon name="chevron-right" :size="14" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
