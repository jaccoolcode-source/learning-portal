<template>
  <div v-if="topics && topics.length" class="related-topics">
    <div class="related-topics__title">Related Topics</div>
    <div class="related-topics__list">
      <a
        v-for="topic in topics"
        :key="topic.link || topic"
        :href="resolveHref(topic)"
        class="related-topics__tag"
      >{{ resolveLabel(topic) }}</a>
    </div>
  </div>
</template>

<style scoped>
.related-topics {
  margin-top: 2rem;
  padding: 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.related-topics__title {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-2);
  margin-bottom: 0.75rem;
}

.related-topics__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.related-topics__tag {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  border: 1.5px solid var(--vp-c-brand-1);
  border-radius: 999px;
  font-size: 0.85rem;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  transition: background 0.15s;
  line-height: 1.4;
}

.related-topics__tag:hover {
  background: var(--vp-c-brand-soft);
}
</style>

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
