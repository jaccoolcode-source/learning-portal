<template>
  <a :href="link" class="category-card" :style="{ '--card-accent': accent }">
    <span class="category-card__icon">{{ icon }}</span>
    <div class="category-card__title">{{ title }}</div>
    <div class="category-card__desc">{{ description }}</div>
    <span class="category-card__accent"></span>
  </a>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String, default: '📚' },
  link: { type: String, required: true },
  accent: { type: String, default: '#3b82f6' },
})
</script>
