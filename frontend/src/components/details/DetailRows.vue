<script setup>
/* A two-column list of facts ("Wind · 19 km/h SW"), skipping empty ones. */
const props = defineProps({
  rows: {type: Array, default: () => []}, // [{label, value, tone?}]
});
</script>

<template>
  <dl class="divide-y divide-line-soft">
    <template v-for="row in props.rows" :key="row.label">
      <div v-if="row.value" class="flex items-baseline justify-between gap-6 py-2.5">
        <dt class="shrink-0 t-note">{{ row.label }}</dt>
        <dd class="min-w-0 text-right text-[0.875rem]" :class="row.tone || 'text-ink'">{{ row.value }}</dd>
      </div>
    </template>
  </dl>
</template>
