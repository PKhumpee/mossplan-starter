<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Icon from '../Icon.vue';
import type { NavItem, NavKey } from './nav';

defineProps<{
  items: NavItem[];
  active?: NavKey;
}>();

const collapsed = ref(false);

function toggleCollapse() {
  collapsed.value = !collapsed.value;
  if (typeof window !== 'undefined') {
    localStorage.setItem('moss-sidebar-collapsed', String(collapsed.value));
  }
}

function onGlobalToggle() {
  toggleCollapse();
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    collapsed.value = localStorage.getItem('moss-sidebar-collapsed') === 'true';
    window.addEventListener('toggle-sidebar', onGlobalToggle);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('toggle-sidebar', onGlobalToggle);
  }
});
</script>

<template>
  <aside
    :class="[
      'hidden lg:flex shrink-0 flex-col gap-1 border-r border-border bg-surface p-3 transition-all duration-200 ease-in-out',
      collapsed ? 'w-16 items-center' : 'w-60',
    ]"
  >
    <!-- Sidebar Header -->
    <div :class="['mb-3 flex items-center h-10', collapsed ? 'justify-center w-full' : 'px-2']">
      <a
        v-if="!collapsed"
        href="/admin/"
        class="text-lg font-bold text-text hover:text-brand transition-colors truncate"
      >
        Mossplan
      </a>
      <a
        v-else
        href="/admin/"
        class="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-contrast font-bold text-sm shadow-sm"
        title="Mossplan"
      >
        H
      </a>
    </div>

    <!-- Navigation Menu Items -->
    <nav aria-label="เมนูหลัก" class="flex flex-col gap-1 w-full">
      <a
        v-for="item in items"
        :key="item.key"
        :href="item.href"
        :title="collapsed ? item.label : undefined"
        :aria-current="item.key === active ? 'page' : undefined"
        :class="[
          'flex items-center rounded-lg transition-colors group',
          collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 border-l-4',
          item.key === active
            ? collapsed
              ? 'bg-bg text-brand shadow-sm border border-border'
              : 'border-brand bg-bg font-semibold text-text shadow-sm'
            : 'border-transparent text-muted hover:bg-bg hover:text-text',
        ]"
      >
        <Icon :name="item.icon" :size="20" class="shrink-0 group-hover:text-brand" />
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </a>
    </nav>

    <!-- Bottom Action: New Article -->
    <a
      href="/admin/articles/new/"
      :title="collapsed ? 'เขียนบทความใหม่' : undefined"
      :class="[
        'mt-auto flex items-center justify-center rounded-full bg-brand font-semibold text-brand-contrast shadow-sm hover:bg-brand-deep transition-all',
        collapsed ? 'size-10' : 'gap-2 px-4 py-2.5 text-body-sm w-full',
      ]"
    >
      <Icon name="plus" :size="18" />
      <span v-if="!collapsed">บทความใหม่</span>
    </a>
  </aside>
</template>
