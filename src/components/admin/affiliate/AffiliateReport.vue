<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../../admin-client/api';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import EmptyState from '../ui/EmptyState.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';
import AffiliateSubNav from './AffiliateSubNav.vue';

interface ReportDailyItem {
  day: string;
  clicks: number;
  conversions: number;
  commissionSatang: number;
}

interface ReportItem {
  id: string;
  slug: string;
  label?: string;
  title?: string;
  status?: string;
  merchantName?: string;
  merchantDomain?: string;
  clicks: number;
  uniqueClicks: number;
  conversions: number;
  commissionSatang: number;
  amountSatang?: number;
  pageViews?: number;
  epcSatang: number;
  rpmSatang: number;
}

interface ReportResponse {
  summary: {
    totalClicks: number;
    totalUniqueClicks: number;
    totalConversions: number;
    totalCommissionSatang: number;
    totalPageViews: number;
    avgEpcSatang: number;
    avgRpmSatang: number;
  };
  items: ReportItem[];
  daily: ReportDailyItem[];
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
}

interface Props {
  userRole?: 'owner' | 'admin' | 'editor';
}

const props = withDefaults(defineProps<Props>(), {
  userRole: 'admin',
});

const days = ref<7 | 30 | 90>(30);
const by = ref<'link' | 'article'>('link');

const loading = ref(true);
const error = ref<string | null>(null);
const reportData = ref<ReportResponse | null>(null);

async function loadReport() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api<ReportResponse>('/api/admin/affiliate/report', {
      query: {
        days: days.value,
        by: by.value,
      },
    });
    reportData.value = res;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      error.value = err.message;
    } else {
      error.value = 'เกิดข้อผิดพลาดในการโหลดรายงาน';
    }
  } finally {
    loading.value = false;
  }
}

function handleDaysChange(d: 7 | 30 | 90) {
  if (days.value === d) return;
  days.value = d;
  loadReport();
}

function handleByChange(mode: 'link' | 'article') {
  if (by.value === mode) return;
  by.value = mode;
  loadReport();
}

function satangToBaht(satang: number | null | undefined): string {
  if (satang === null || satang === undefined) return '0.00';
  return (satang / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// SVG Chart computations
const chartData = computed(() => {
  if (!reportData.value?.daily || reportData.value.daily.length === 0) return null;
  const list = reportData.value.daily;

  const maxClicks = Math.max(...list.map((d) => d.clicks), 1);
  const maxCommission = Math.max(...list.map((d) => d.commissionSatang / 100), 10);

  const width = 800;
  const height = 220;
  const padding = { top: 20, right: 30, bottom: 30, left: 40 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const stepX = list.length > 1 ? innerWidth / (list.length - 1) : innerWidth;

  // Clicks line coordinates
  const clickPoints = list.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerHeight - (d.clicks / maxClicks) * innerHeight;
    return { x, y, day: d.day, val: d.clicks };
  });

  const clickPathD = clickPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  // Commission line coordinates
  const commPoints = list.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerHeight - (d.commissionSatang / 100 / maxCommission) * innerHeight;
    return { x, y, day: d.day, val: d.commissionSatang / 100 };
  });

  const commPathD = commPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  return {
    width,
    height,
    padding,
    innerHeight,
    innerWidth,
    list,
    maxClicks,
    maxCommission,
    clickPoints,
    clickPathD,
    commPoints,
    commPathD,
  };
});

onMounted(() => {
  loadReport();
});
</script>

<template>
  <div class="space-y-6">
    <AffiliateSubNav active="report" :user-role="userRole" />

    <!-- Top Bar Controls -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-text">รายงานผลตอบแทน affiliate</h2>
        <p class="text-sm text-muted mt-1">
          วิเคราะห์สถิติจำนวนคลิก อัตราการซื้อสำเร็จ (Conversions), ค่าคอมมิชชัน, EPC และ RPM
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <!-- By Selector -->
        <div class="inline-flex rounded-lg border border-border bg-surface p-1 text-xs">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="
              by === 'link' ? 'bg-brand text-white font-semibold' : 'text-muted hover:text-text'
            "
            @click="handleByChange('link')"
          >
            ตามลิงก์ (by Link)
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="
              by === 'article' ? 'bg-brand text-white font-semibold' : 'text-muted hover:text-text'
            "
            @click="handleByChange('article')"
          >
            ตามบทความ (by Article)
          </button>
        </div>

        <!-- Days Selector -->
        <div class="inline-flex rounded-lg border border-border bg-surface p-1 text-xs">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="
              days === 7
                ? 'bg-surface-elevated text-brand font-semibold shadow-sm'
                : 'text-muted hover:text-text'
            "
            @click="handleDaysChange(7)"
          >
            7 วัน
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="
              days === 30
                ? 'bg-surface-elevated text-brand font-semibold shadow-sm'
                : 'text-muted hover:text-text'
            "
            @click="handleDaysChange(30)"
          >
            30 วัน
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="
              days === 90
                ? 'bg-surface-elevated text-brand font-semibold shadow-sm'
                : 'text-muted hover:text-text'
            "
            @click="handleDaysChange(90)"
          >
            90 วัน
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center p-12 bg-surface rounded-xl border border-border"
    >
      <Spinner size="lg" />
      <p class="mt-4 text-sm text-muted">กำลังคำนวณสถิติและสร้างรายงาน...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-8 text-center bg-surface rounded-xl border border-danger/30">
      <div
        class="inline-flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger mb-4"
      >
        <Icon name="alert" :size="24" />
      </div>
      <h3 class="text-base font-semibold text-text mb-2">ไม่สามารถโหลดรายงานได้</h3>
      <p class="text-sm text-muted mb-4">{{ error }}</p>
      <Button variant="secondary" @click="loadReport">ลองใหม่อีกครั้ง</Button>
    </div>

    <!-- Report Body -->
    <div v-else-if="reportData" class="space-y-6">
      <!-- Metric Cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="p-4 rounded-xl border border-border bg-surface shadow-sm">
          <div class="text-xs font-semibold text-muted mb-1">คลิกทั้งหมด (Clicks)</div>
          <div class="text-2xl font-bold text-text">
            {{ reportData.summary.totalClicks.toLocaleString() }}
          </div>
          <div class="text-[11px] text-muted mt-1 font-mono">
            ไม่ซ้ำ: {{ reportData.summary.totalUniqueClicks.toLocaleString() }}
          </div>
        </div>

        <div class="p-4 rounded-xl border border-border bg-surface shadow-sm">
          <div class="text-xs font-semibold text-muted mb-1">ยอดขาย (Conversions)</div>
          <div class="text-2xl font-bold text-brand">
            {{ reportData.summary.totalConversions.toLocaleString() }}
          </div>
          <div class="text-[11px] text-muted mt-1">
            CR:
            {{
              reportData.summary.totalClicks > 0
                ? (
                    (reportData.summary.totalConversions / reportData.summary.totalClicks) *
                    100
                  ).toFixed(1)
                : 0
            }}%
          </div>
        </div>

        <div class="p-4 rounded-xl border border-border bg-surface shadow-sm">
          <div class="text-xs font-semibold text-muted mb-1">คอมมิชชันรวม (THB)</div>
          <div class="text-2xl font-bold text-success font-mono">
            ฿{{ satangToBaht(reportData.summary.totalCommissionSatang) }}
          </div>
          <div class="text-[11px] text-muted mt-1">รายได้สะสมช่วงเวลา</div>
        </div>

        <div class="p-4 rounded-xl border border-border bg-surface shadow-sm">
          <div class="text-xs font-semibold text-muted mb-1">EPC เฉลี่ย (ต่อคลิก)</div>
          <div class="text-2xl font-bold text-text font-mono">
            ฿{{ satangToBaht(reportData.summary.avgEpcSatang) }}
          </div>
          <div class="text-[11px] text-muted mt-1">คอมมิชชัน ÷ จำนวนคลิก</div>
        </div>

        <div
          class="p-4 rounded-xl border border-border bg-surface shadow-sm col-span-2 md:col-span-1"
        >
          <div class="text-xs font-semibold text-muted mb-1">RPM เฉลี่ย (ต่อ 1,000 วิว)</div>
          <div class="text-2xl font-bold text-text font-mono">
            ฿{{ satangToBaht(reportData.summary.avgRpmSatang) }}
          </div>
          <div class="text-[11px] text-muted mt-1">คอมมิชชัน ÷ วิว × 1,000</div>
        </div>
      </div>

      <!-- Inline SVG Chart -->
      <div
        v-if="chartData"
        class="rounded-xl border border-border bg-surface p-6 space-y-4 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-text flex items-center gap-2">
            <Icon name="chart" :size="16" class="text-brand" />
            <span>แนวโน้มคลิกและคอมมิชชันรายวัน</span>
          </h3>

          <div class="flex items-center gap-4 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-full bg-brand"></span>
              <span class="text-muted">จำนวนคลิก (Clicks)</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-full bg-success"></span>
              <span class="text-muted">คอมมิชชัน (บาท)</span>
            </div>
          </div>
        </div>

        <!-- Pure Inline SVG (Zero Chart Libraries) -->
        <div class="w-full overflow-x-auto">
          <svg
            :viewBox="`0 0 ${chartData.width} ${chartData.height}`"
            class="w-full h-48 select-none"
            preserveAspectRatio="none"
          >
            <!-- Background grid lines -->
            <line
              :x1="chartData.padding.left"
              :y1="chartData.padding.top"
              :x2="chartData.width - chartData.padding.right"
              :y2="chartData.padding.top"
              stroke="var(--color-border)"
              stroke-dasharray="3 3"
              stroke-width="1"
            />
            <line
              :x1="chartData.padding.left"
              :y1="chartData.padding.top + chartData.innerHeight / 2"
              :x2="chartData.width - chartData.padding.right"
              :y2="chartData.padding.top + chartData.innerHeight / 2"
              stroke="var(--color-border)"
              stroke-dasharray="3 3"
              stroke-width="1"
            />
            <line
              :x1="chartData.padding.left"
              :y1="chartData.padding.top + chartData.innerHeight"
              :x2="chartData.width - chartData.padding.right"
              :y2="chartData.padding.top + chartData.innerHeight"
              stroke="var(--color-border)"
              stroke-width="1"
            />

            <!-- Clicks line -->
            <path
              :d="chartData.clickPathD"
              fill="none"
              stroke="var(--color-brand)"
              stroke-width="2.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />

            <!-- Commission line -->
            <path
              :d="chartData.commPathD"
              fill="none"
              stroke="var(--color-success)"
              stroke-width="2.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />

            <!-- Click points -->
            <circle
              v-for="(p, i) in chartData.clickPoints"
              :key="'c-' + i"
              :cx="p.x"
              :cy="p.y"
              r="3"
              fill="var(--color-brand)"
            >
              <title>{{ p.day }}: {{ p.val }} คลิก</title>
            </circle>

            <!-- Commission points -->
            <circle
              v-for="(p, i) in chartData.commPoints"
              :key="'m-' + i"
              :cx="p.x"
              :cy="p.y"
              r="3"
              fill="var(--color-success)"
            >
              <title>{{ p.day }}: ฿{{ p.val.toFixed(2) }}</title>
            </circle>

            <!-- Start / End date labels -->
            <text
              :x="chartData.padding.left"
              :y="chartData.height - 8"
              font-size="10"
              fill="var(--color-muted)"
              text-anchor="start"
            >
              {{ chartData.list[0]?.day }}
            </text>
            <text
              :x="chartData.width - chartData.padding.right"
              :y="chartData.height - 8"
              font-size="10"
              fill="var(--color-muted)"
              text-anchor="end"
            >
              {{ chartData.list[chartData.list.length - 1]?.day }}
            </text>
          </svg>
        </div>
      </div>

      <!-- Table Section -->
      <div class="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
        <div class="p-4 border-b border-border bg-surface-elevated font-semibold text-sm">
          {{
            by === 'link'
              ? 'ผลตอบแทนรายลิงก์ (Link Performance)'
              : 'ผลตอบแทนรายบทความ (Article Performance)'
          }}
        </div>

        <div v-if="reportData.items.length === 0" class="p-8 text-center text-sm text-muted">
          ไม่มีข้อมูลสถิติในช่วงเวลาที่เลือก
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm text-text border-collapse">
            <thead class="bg-surface-elevated text-xs uppercase tracking-wider text-muted">
              <tr>
                <th class="px-4 py-3 font-semibold">
                  {{ by === 'link' ? 'ลิงก์และร้านค้า' : 'ชื่อบทความ' }}
                </th>
                <th v-if="by === 'article'" class="px-4 py-3 font-semibold text-right">
                  ยอดเข้าชม (Views)
                </th>
                <th class="px-4 py-3 font-semibold text-right">คลิก (Clicks)</th>
                <th class="px-4 py-3 font-semibold text-right">ยอดซื้อ (Conv)</th>
                <th class="px-4 py-3 font-semibold text-right">คอมมิชชัน (THB)</th>
                <th class="px-4 py-3 font-semibold text-right">EPC (ต่อคลิก)</th>
                <th class="px-4 py-3 font-semibold text-right">RPM (ต่อ 1k วิว)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="item in reportData.items"
                :key="item.id"
                class="hover:bg-surface-elevated/50 transition-colors"
              >
                <!-- Title / Link -->
                <td class="px-4 py-3.5">
                  <div class="font-medium text-text">
                    {{ by === 'link' ? item.label : item.title }}
                  </div>
                  <div class="text-xs text-muted font-mono mt-0.5">
                    {{
                      by === 'link' ? `/go/${item.slug}/ (${item.merchantName})` : `/${item.slug}/`
                    }}
                  </div>
                </td>

                <!-- Page Views (if by article) -->
                <td v-if="by === 'article'" class="px-4 py-3.5 text-right font-mono text-xs">
                  {{ item.pageViews ? item.pageViews.toLocaleString() : '-' }}
                </td>

                <!-- Clicks -->
                <td class="px-4 py-3.5 text-right font-mono text-xs">
                  <span class="font-bold text-text">{{ item.clicks.toLocaleString() }}</span>
                  <span class="text-muted text-[10px] block">({{ item.uniqueClicks }} ไม่ซ้ำ)</span>
                </td>

                <!-- Conversions -->
                <td class="px-4 py-3.5 text-right font-mono text-xs font-semibold text-brand">
                  {{ item.conversions.toLocaleString() }}
                </td>

                <!-- Commission -->
                <td class="px-4 py-3.5 text-right font-mono text-xs font-bold text-success">
                  ฿{{ satangToBaht(item.commissionSatang) }}
                </td>

                <!-- EPC -->
                <td class="px-4 py-3.5 text-right font-mono text-xs font-semibold">
                  ฿{{ satangToBaht(item.epcSatang) }}
                </td>

                <!-- RPM -->
                <td class="px-4 py-3.5 text-right font-mono text-xs font-semibold">
                  ฿{{ satangToBaht(item.rpmSatang) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
