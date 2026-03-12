<template>
  <span class="difficulty-badge" :class="`difficulty-badge--${level}`">
    <span>{{ icon }}</span>
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: {
    type: String,
    default: 'beginner',
    validator: (v) => ['beginner', 'intermediate', 'advanced'].includes(v),
  },
})

const icon = computed(() => {
  return { beginner: '🟢', intermediate: '🟡', advanced: '🔴' }[props.level]
})

const label = computed(() => {
  return props.level.charAt(0).toUpperCase() + props.level.slice(1)
})
</script>
