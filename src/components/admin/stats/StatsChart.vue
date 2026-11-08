<script setup lang="ts">
import { computed, ref } from 'vue';

export interface DailyStatPoint {
  day: string;
  views: number;
  visits: number;
}

const props = defineProps<{
  series: DailyStatPoint[];
  loading?: boolean;
}>();

const hoverIndex = ref<number | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

const WIDTH = 800;
const HEIGHT = 240;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 36;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 20;

const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const baselineY = PADDING_TOP + plotHeight;

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

function formatShortThai(dayStr: string): string {
  const parts = dayStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[2] ?? '0', 10);
    const m = parseInt(parts[1] ?? '0', 10) - 1;
    return `${day} ${THAI_MONTHS[m] ?? ''}`;
  }
  return dayStr;
}

function formatFullThai(dayStr: string): string {
  const parts = dayStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0] ?? '0', 10) + 543;
    const day = parseInt(parts[2] ?? '0', 10);
    const m = parseInt(parts[1] ?? '0', 10) - 1;
    return `${day} ${THAI_MONTHS[m] ?? ''} ${year}`;
  }
  return dayStr;
}

// Compute nice max scale value
const maxVal = computed(() => {
  if (!props.series.length) return 10;
  let max = 0;
  for (const p of props.series) {
    if (p.views > max) max = p.views;
    if (p.visits > max) max = p.visits;
  }
  if (max === 0) return 10;
  // Round up to nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  let niceMultiplier = 1;
  if (normalized > 5) niceMultiplier = 10;
  else if (normalized > 2) niceMultiplier = 5;
  else if (normalized > 1) niceMultiplier = 2;
  return Math.max(5, Math.ceil(normalized) * magnitude);
});

// Y-axis grid ticks (3 horizontal levels)
const yTicks = computed(() => {
  const m = maxVal.value;
  return [
    { value: m, y: PADDING_TOP },
    { value: Math.round(m / 2), y: PADDING_TOP + plotHeight / 2 },
    { value: 0, y: baselineY },
  ];
});

// Calculate coordinates for points
const points = computed(() => {
  const len = props.series.length;
  if (len === 0) return [];
  const m = maxVal.value;

  return props.series.map((item, idx) => {
    const x =
      len === 1 ? PADDING_LEFT + plotWidth / 2 : PADDING_LEFT + (idx / (len - 1)) * plotWidth;
    const viewsY = baselineY - (item.views / m) * plotHeight;
    const visitsY = baselineY - (item.visits / m) * plotHeight;

    return {
      x,
      viewsY,
      visitsY,
      item,
      idx,
    };
  });
});

// SVG path strings
const viewsAreaPath = computed(() => {
  const pts = points.value;
  if (!pts.length) return '';
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const linePart = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.viewsY.toFixed(1)}`)
    .join(' ');
  return `${linePart} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
});

const viewsLinePath = computed(() => {
  const pts = points.value;
  if (!pts.length) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.viewsY.toFixed(1)}`)
    .join(' ');
});

const visitsLinePath = computed(() => {
  const pts = points.value;
  if (!pts.length) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.visitsY.toFixed(1)}`)
    .join(' ');
});

// X-axis label ticks (choose up to 6 evenly spaced labels)
const xLabels = computed(() => {
  const pts = points.value;
  if (pts.length <= 1) return pts;
  const count = Math.min(6, pts.length);
  const step = (pts.length - 1) / (count - 1);
  const result = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round(i * step);
    const pt = pts[idx];
    if (pt) result.push(pt);
  }
  return result;
});

const activePoint = computed(() => {
  if (hoverIndex.value === null) return null;
  return points.value[hoverIndex.value] ?? null;
});

function onMouseMove(event: MouseEvent) {
  if (!svgRef.value || points.value.length === 0) return;
  const rect = svgRef.value.getBoundingClientRect();
  const clientX = event.clientX - rect.left;
  const scaleX = WIDTH / rect.width;
  const svgX = clientX * scaleX;

  let nearestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < points.value.length; i++) {
    const pt = points.value[i]!;
    const diff = Math.abs(pt.x - svgX);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  }
  hoverIndex.value = nearestIdx;
}

function onMouseLeave() {
  hoverIndex.value = null;
}
</script>

<template>
  <div class="relative w-full rounded-xl border border-border bg-surface p-4 sm:p-5">
    <!-- Chart Header & Legend -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h2 class="text-base font-semibold text-text">แนวโน้มการเข้าชมรายวัน</h2>
      </div>

      <!-- Legend -->
      <div class="flex items-center gap-4 text-xs font-medium">
        <div class="flex items-center gap-1.5">
          <span class="inline-block h-2.5 w-5 rounded-full bg-brand"></span>
          <span class="text-text">การเข้าชม (Views)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="inline-block h-0.5 w-5 border-t-2 border-dashed border-emerald-600"></span>
          <span class="text-text">ผู้เข้าชม (Visits)</span>
        </div>
      </div>
    </div>

    <!-- SVG Container -->
    <div class="relative w-full overflow-hidden">
      <svg
        ref="svgRef"
        viewBox="0 0 800 240"
        class="w-full h-auto cursor-crosshair select-none"
        @mousemove="onMouseMove"
        @mouseleave="onMouseLeave"
      >
        <defs>
          <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--moss-primary)" stop-opacity="0.25" />
            <stop offset="100%" stop-color="var(--moss-primary)" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <!-- Horizontal grid lines and Y-axis labels -->
        <g class="grid-lines" stroke="currentColor" stroke-dasharray="3 3" opacity="0.15">
          <line
            v-for="tick in yTicks"
            :key="tick.value"
            :x1="PADDING_LEFT"
            :y1="tick.y"
            :x2="WIDTH - PADDING_RIGHT"
            :y2="tick.y"
            class="stroke-text"
          />
        </g>

        <!-- Y-axis numeric labels -->
        <g class="y-labels text-xs fill-muted" text-anchor="end" font-size="11">
          <text v-for="tick in yTicks" :key="tick.value" :x="PADDING_LEFT - 8" :y="tick.y + 4">
            {{ tick.value }}
          </text>
        </g>

        <!-- Views Area Fill -->
        <path v-if="viewsAreaPath" :d="viewsAreaPath" fill="url(#viewsGradient)" />

        <!-- Views Line (solid primary) -->
        <path
          v-if="viewsLinePath"
          :d="viewsLinePath"
          fill="none"
          stroke="var(--moss-primary)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Visits Line (dashed secondary) -->
        <path
          v-if="visitsLinePath"
          :d="visitsLinePath"
          fill="none"
          stroke="var(--moss-secondary)"
          stroke-width="2"
          stroke-dasharray="5 3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Interactive Crosshair & Highlight Points -->
        <g v-if="activePoint">
          <!-- Vertical cursor line -->
          <line
            :x1="activePoint.x"
            :y1="PADDING_TOP"
            :x2="activePoint.x"
            :y2="baselineY"
            stroke="currentColor"
            stroke-width="1"
            stroke-dasharray="2 2"
            class="stroke-muted opacity-60"
          />

          <!-- Views dot -->
          <circle
            :cx="activePoint.x"
            :cy="activePoint.viewsY"
            r="5"
            fill="var(--moss-primary)"
            stroke="var(--moss-surface)"
            stroke-width="2"
          />

          <!-- Visits dot -->
          <circle
            :cx="activePoint.x"
            :cy="activePoint.visitsY"
            r="4"
            fill="var(--moss-secondary)"
            stroke="var(--moss-surface)"
            stroke-width="2"
          />
        </g>

        <!-- X-axis Date Labels -->
        <g class="x-labels text-xs fill-muted" text-anchor="middle" font-size="11">
          <text v-for="pt in xLabels" :key="pt.item.day" :x="pt.x" :y="HEIGHT - 10">
            {{ formatShortThai(pt.item.day) }}
          </text>
        </g>
      </svg>

      <!-- Tooltip Box Overlay -->
      <div
        v-if="activePoint"
        class="pointer-events-none absolute top-4 z-20 rounded-lg border border-border bg-bg/95 p-2.5 text-xs shadow-card backdrop-blur-sm transition-all"
        :style="{
          left: `${Math.min(Math.max(activePoint.x * 0.125, 2), 85)}%`,
        }"
      >
        <div class="font-medium text-text mb-1">
          {{ formatFullThai(activePoint.item.day) }}
        </div>
        <div class="flex items-center justify-between gap-4 text-brand">
          <span>การเข้าชม:</span>
          <span class="font-bold">{{ activePoint.item.views.toLocaleString('th-TH') }} ครั้ง</span>
        </div>
        <div class="flex items-center justify-between gap-4 text-emerald-600">
          <span>ผู้เข้าชม:</span>
          <span class="font-bold">{{ activePoint.item.visits.toLocaleString('th-TH') }} ครั้ง</span>
        </div>
      </div>
    </div>
  </div>
</template>
