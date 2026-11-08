<script setup lang="ts">
import Badge from '../ui/Badge.vue';

interface Props {
  active: 'links' | 'merchants' | 'import' | 'report';
  userRole?: 'admin' | 'editor';
}

const props = withDefaults(defineProps<Props>(), {
  userRole: 'admin',
});

const navItems = [
  { id: 'links', label: 'ลิงก์ affiliate', href: '/admin/affiliate/' },
  { id: 'merchants', label: 'ร้านค้า', href: '/admin/affiliate/merchants/' },
  { id: 'import', label: 'นำเข้ายอดขาย', href: '/admin/affiliate/import/', adminOnly: true },
  { id: 'report', label: 'รายงาน', href: '/admin/affiliate/report/' },
];
</script>

<template>
  <nav class="mb-6 border-b border-border" aria-label="เมนูระบบ Affiliate">
    <ul class="flex flex-wrap gap-2 -mb-px">
      <template v-for="item in navItems" :key="item.id">
        <li v-if="!item.adminOnly || props.userRole === 'admin'">
          <a
            :href="item.href"
            :class="[
              'inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              active === item.id
                ? 'border-brand text-brand font-semibold'
                : 'border-transparent text-muted hover:text-text hover:border-border',
            ]"
            :aria-current="active === item.id ? 'page' : undefined"
          >
            {{ item.label }}
          </a>
        </li>
      </template>
    </ul>
  </nav>
</template>
