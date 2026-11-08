<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string;
    variant?: 'normal' | '404';
  }>(),
  {
    size: 64,
    variant: 'normal',
  },
);
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 8 8"
    :width="size"
    :height="size"
    shape-rendering="crispEdges"
    class="mossbit-mascot inline-block"
    aria-hidden="true"
  >
    <!-- Normal Mossbit -->
    <g v-if="variant === 'normal'">
      <rect class="mossbit-accent" x="2" y="0" width="1" height="1" />
      <rect class="mossbit-accent" x="3" y="0" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="1" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="0" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="7" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="0" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="4" width="1" height="1" />
      <rect class="mossbit-eye" x="2" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="4" width="1" height="1" />
      <rect class="mossbit-eye" x="5" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="7" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="0" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="7" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="6" width="1" height="1" />
      <rect class="mossbit-eye" x="2" y="6" width="1" height="1" />
      <rect class="mossbit-eye" x="3" y="6" width="1" height="1" />
      <rect class="mossbit-eye" x="4" y="6" width="1" height="1" />
      <rect class="mossbit-eye" x="5" y="6" width="1" height="1" />
      <rect class="mossbit-eye" x="6" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="7" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="7" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="7" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="7" width="1" height="1" />
    </g>

    <!-- 404 / Sad Mossbit -->
    <g v-else>
      <rect class="mossbit-body" x="2" y="1" width="1" height="1" />
      <rect class="mossbit-accent" x="3" y="1" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="2" width="1" height="1" />
      <rect class="mossbit-body" x="0" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="3" width="1" height="1" />
      <rect class="mossbit-accent" x="7" y="3" width="1" height="1" />
      <rect class="mossbit-body" x="0" y="4" width="1" height="1" />
      <rect class="mossbit-eye" x="1" y="4" width="1" height="1" />
      <rect class="mossbit-eye" x="2" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="4" width="1" height="1" />
      <rect class="mossbit-eye" x="5" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="7" y="4" width="1" height="1" />
      <rect class="mossbit-body" x="0" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="5" width="1" height="1" />
      <rect class="mossbit-eye" x="3" y="5" width="1" height="1" />
      <rect class="mossbit-eye" x="4" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="7" y="5" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="3" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="4" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="6" width="1" height="1" />
      <rect class="mossbit-body" x="1" y="7" width="1" height="1" />
      <rect class="mossbit-body" x="2" y="7" width="1" height="1" />
      <rect class="mossbit-body" x="5" y="7" width="1" height="1" />
      <rect class="mossbit-body" x="6" y="7" width="1" height="1" />
    </g>
  </svg>
</template>

<style scoped>
.mossbit-body {
  fill: var(--moss-primary);
}
.mossbit-accent {
  fill: var(--moss-secondary);
}
.mossbit-eye {
  fill: var(--moss-text);
}
</style>
