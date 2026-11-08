<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '../../../admin-client/api';
import Icon from '../ui/Icon.vue';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
}

defineProps<{ label?: string }>();
const model = defineModel<string | null>({ default: null });

const categories = ref<CategoryItem[]>([]);
const loading = ref(true);

async function loadCategories() {
  loading.value = true;
  try {
    const res = await api<CategoryItem[]>('/api/admin/categories');
    categories.value = res || [];
  } catch (err) {
    console.error('[CategorySelect] failed to load categories:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCategories();
});
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span class="text-body-sm font-semibold text-text">{{ label ?? 'หมวดหมู่' }}</span>
    <div class="relative">
      <select
        v-model="model"
        class="w-full rounded-xl border border-border-input bg-bg px-3.5 py-2.5 text-body-sm text-text focus-visible:border-brand shadow-sm cursor-pointer appearance-none pr-10"
        :disabled="loading"
      >
        <option :value="null">-- เลือกหมวดหมู่บทความ --</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">
          {{ cat.name }} (/category/{{ cat.slug }}/)
        </option>
      </select>
      <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted">
        <Icon name="chevron-down" :size="16" />
      </div>
    </div>
  </label>
</template>
