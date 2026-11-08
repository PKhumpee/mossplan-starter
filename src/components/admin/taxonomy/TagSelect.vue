<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../../admin-client/api';
import { toast } from '../../../admin-client/toast';
import Icon from '../ui/Icon.vue';

interface TagItem {
  id: string;
  name: string;
  slug: string;
}

defineProps<{ label?: string }>();
const model = defineModel<string[]>({ default: () => [] });

const allTags = ref<TagItem[]>([]);
const searchInput = ref('');
const isDropdownOpen = ref(false);
const creatingTag = ref(false);

async function loadTags() {
  try {
    const res = await api<TagItem[]>('/api/admin/tags');
    allTags.value = res || [];
  } catch (err) {
    console.error('[TagSelect] failed to load tags:', err);
  }
}

const selectedTags = computed(() => {
  return model.value
    .map((id) => allTags.value.find((t) => t.id === id))
    .filter((t): t is TagItem => !!t);
});

const filteredSuggestions = computed(() => {
  const q = searchInput.value.toLowerCase().trim();
  return allTags.value.filter((t) => {
    if (model.value.includes(t.id)) return false;
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
  });
});

function toggleTag(tagId: string) {
  const index = model.value.indexOf(tagId);
  if (index === -1) {
    model.value = [...model.value, tagId];
  } else {
    model.value = model.value.filter((id) => id !== tagId);
  }
  searchInput.value = '';
}

function removeTag(tagId: string) {
  model.value = model.value.filter((id) => id !== tagId);
}

// Inline tag creation if not found
async function createNewTagInline() {
  const raw = searchInput.value.trim();
  if (!raw) return;

  // Simple slug generation
  const slug = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const finalSlug = slug || `tag-${Date.now().toString(36)}`;

  creatingTag.value = true;
  try {
    const newTag = await api<TagItem>('/api/admin/tags', {
      method: 'POST',
      body: { name: raw, slug: finalSlug },
    });
    allTags.value.push(newTag);
    model.value = [...model.value, newTag.id];
    searchInput.value = '';
    isDropdownOpen.value = false;
    toast.success(`สร้างแท็ก "${newTag.name}" เรียบร้อย`);
  } catch (err: any) {
    toast.error(err.message || 'สร้างแท็กไม่สำเร็จ');
  } finally {
    creatingTag.value = false;
  }
}

onMounted(() => {
  loadTags();
});
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span class="text-body-sm font-semibold text-text">{{ label ?? 'แท็กบทความ' }}</span>

    <!-- Selected Tags Chips -->
    <div v-if="selectedTags.length > 0" class="flex flex-wrap gap-1.5 mb-1">
      <span
        v-for="tag in selectedTags"
        :key="tag.id"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-caption font-medium text-text"
      >
        #{{ tag.name }}
        <button
          type="button"
          class="text-muted hover:text-danger rounded-full"
          @click="removeTag(tag.id)"
        >
          <Icon name="x" :size="14" />
        </button>
      </span>
    </div>

    <!-- Combobox Input -->
    <div class="relative">
      <div
        class="flex items-center rounded-xl border border-border-input bg-bg px-3 py-1.5 focus-within:border-brand shadow-sm"
      >
        <Icon name="search" :size="16" class="text-muted mr-2 shrink-0" />
        <input
          v-model="searchInput"
          type="text"
          placeholder="พิมพ์ค้นหา หรือสร้างแท็กใหม่..."
          class="w-full text-body-sm text-text bg-transparent border-0 p-1 focus:ring-0 focus:outline-none"
          @focus="isDropdownOpen = true"
          @keydown.enter.prevent="createNewTagInline"
        />
      </div>

      <!-- Suggestions Dropdown -->
      <div
        v-if="isDropdownOpen && (filteredSuggestions.length > 0 || searchInput.trim())"
        class="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-bg p-1 shadow-lg"
      >
        <button
          v-for="tag in filteredSuggestions"
          :key="tag.id"
          type="button"
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-body-sm hover:bg-surface text-text transition-colors"
          @click="toggleTag(tag.id)"
        >
          <span class="font-medium">#{{ tag.name }}</span>
          <span class="text-caption font-mono text-muted">/tag/{{ tag.slug }}/</span>
        </button>

        <!-- Create tag prompt -->
        <button
          v-if="
            searchInput.trim() &&
            !allTags.some((t) => t.name.toLowerCase() === searchInput.toLowerCase().trim())
          "
          type="button"
          class="flex w-full items-center gap-2 rounded-lg border-t border-border px-3 py-2 text-left text-body-sm text-brand hover:bg-brand/5 font-semibold mt-1"
          :disabled="creatingTag"
          @click="createNewTagInline"
        >
          <Icon name="plus" :size="16" />
          <span>สร้างแท็กใหม่ "#{{ searchInput.trim() }}"</span>
        </button>
      </div>
    </div>
  </div>
</template>
