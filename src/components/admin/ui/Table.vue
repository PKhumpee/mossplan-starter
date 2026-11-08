<script setup lang="ts" generic="Row extends Record<string, unknown>">
import { computed } from 'vue';
import Button from './Button.vue';
import Checkbox from './Checkbox.vue';
import EmptyState from './EmptyState.vue';
import Icon from './Icon.vue';
import Skeleton from './Skeleton.vue';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right';
}
export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
}

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: Row[];
    /** Property of each row that identifies it (selection and v-for keys). */
    rowKey: keyof Row & string;
    /** Accessible name of the table. */
    caption: string;
    loading?: boolean;
    selectable?: boolean;
    sort?: TableSort | null;
    page?: number;
    pageSize?: number;
    /** Total rows across all pages; defaults to `rows.length`. */
    total?: number;
    emptyMessage?: string;
  }>(),
  {
    loading: false,
    selectable: false,
    sort: null,
    page: 1,
    pageSize: 20,
    emptyMessage: 'ยังไม่มีข้อมูล',
  },
);
const selected = defineModel<string[]>('selected', { default: () => [] });
const emit = defineEmits<{ 'update:sort': [value: TableSort]; 'update:page': [value: number] }>();

const totalRows = computed(() => props.total ?? props.rows.length);
const pageCount = computed(() => Math.max(1, Math.ceil(totalRows.value / props.pageSize)));
const rangeStart = computed(() =>
  totalRows.value === 0 ? 0 : (props.page - 1) * props.pageSize + 1,
);
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, totalRows.value));
const idOf = (row: Row): string => String(row[props.rowKey]);
const allSelected = computed(
  () => props.rows.length > 0 && props.rows.every((r) => selected.value.includes(idOf(r))),
);

function ariaSort(col: TableColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!col.sortable) return undefined;
  if (props.sort?.key !== col.key) return 'none';
  return props.sort.dir === 'asc' ? 'ascending' : 'descending';
}
function toggleSort(col: TableColumn): void {
  const dir = props.sort?.key === col.key && props.sort.dir === 'asc' ? 'desc' : 'asc';
  emit('update:sort', { key: col.key, dir });
}
function toggleAll(value: boolean): void {
  selected.value = value ? props.rows.map(idOf) : [];
}
function toggleRow(id: string, value: boolean): void {
  selected.value = value ? [...selected.value, id] : selected.value.filter((s) => s !== id);
}
</script>

<template>
  <div class="rounded-lg border border-border">
    <Skeleton v-if="loading && rows.length === 0" class="p-3" />
    <template v-else>
      <div class="max-h-[70vh] overflow-auto">
        <table class="w-full border-collapse text-left">
          <caption class="sr-only">
            {{
              caption
            }}
          </caption>
          <thead class="sticky top-0 z-10 bg-surface">
            <tr>
              <th v-if="selectable" scope="col" class="w-10 px-3 py-2">
                <Checkbox
                  :model-value="allSelected"
                  label="เลือกทั้งหมด"
                  class="[&>span]:sr-only"
                  @update:model-value="toggleAll"
                />
              </th>
              <th
                v-for="col in columns"
                :key="col.key"
                scope="col"
                :aria-sort="ariaSort(col)"
                class="px-3 py-2 text-sm font-medium"
                :class="col.align === 'right' ? 'text-right' : ''"
              >
                <button
                  v-if="col.sortable"
                  type="button"
                  class="inline-flex items-center gap-1 hover:text-brand"
                  @click="toggleSort(col)"
                >
                  {{ col.label }}
                  <Icon
                    v-if="sort?.key === col.key"
                    :name="sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'"
                    :size="14"
                  />
                </button>
                <template v-else>{{ col.label }}</template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="idOf(row)" class="h-11 border-t border-border">
              <td v-if="selectable" class="px-3">
                <Checkbox
                  :model-value="selected.includes(idOf(row))"
                  :label="`เลือกแถว ${idOf(row)}`"
                  class="[&>span]:sr-only"
                  @update:model-value="toggleRow(idOf(row), $event)"
                />
              </td>
              <td
                v-for="col in columns"
                :key="col.key"
                class="px-3"
                :class="col.align === 'right' ? 'text-right' : ''"
              >
                <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">{{
                  row[col.key]
                }}</slot>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="rows.length === 0">
          <slot name="empty"><EmptyState :message="emptyMessage" /></slot>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm">
        <span class="text-muted">{{ rangeStart }}–{{ rangeEnd }} จาก {{ totalRows }}</span>
        <nav aria-label="แบ่งหน้า" class="flex items-center gap-2">
          <Button
            size="sm"
            :disabled="page <= 1"
            aria-label="หน้าก่อนหน้า"
            @click="emit('update:page', page - 1)"
          >
            <Icon name="chevron-left" :size="16" />
          </Button>
          <span>หน้า {{ page }} / {{ pageCount }}</span>
          <Button
            size="sm"
            :disabled="page >= pageCount"
            aria-label="หน้าถัดไป"
            @click="emit('update:page', page + 1)"
          >
            <Icon name="chevron-right" :size="16" />
          </Button>
        </nav>
      </div>
    </template>
  </div>
</template>
