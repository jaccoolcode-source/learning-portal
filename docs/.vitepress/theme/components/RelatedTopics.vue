<template>
  <div v-if="topics && topics.length" class="related-topics">
    <div class="related-topics__title">Related Topics</div>
    <ul class="related-topics__list">
      <li v-for="topic in topics" :key="topic.link || topic" class="related-topics__item">
        <a :href="resolveHref(topic)">{{ resolveLabel(topic) }}</a>
      </li>
    </ul>
  </div>
</template>

<script setup>
const props = defineProps({
  topics: {
    type: Array,
    default: () => [],
  },
})

function resolveHref(topic) {
  if (typeof topic === 'string') return topic
  return topic.link || topic
}

function resolveLabel(topic) {
  if (typeof topic === 'object' && topic.text) return topic.text
  // Convert path like /collections/interfaces → Collections / Interfaces
  const path = typeof topic === 'string' ? topic : topic.link
  return path
    .replace(/^\//, '')
    .split('/')
    .map((s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(' › ')
}
</script>
