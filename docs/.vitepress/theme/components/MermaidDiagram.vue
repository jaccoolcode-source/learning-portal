<template>
  <div class="mermaid-wrapper">
    <div v-if="error" style="color: var(--vp-c-danger-1); font-size: 0.875rem;">
      ⚠️ Failed to render diagram. Check Mermaid syntax.
    </div>
    <div v-else ref="container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  code: { type: String, required: true },
})

const container = ref(null)
const error = ref(false)

onMounted(async () => {
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
      securityLevel: 'loose',
    })
    const id = 'mermaid-' + Math.random().toString(36).slice(2)
    const { svg } = await mermaid.render(id, props.code)
    if (container.value) container.value.innerHTML = svg
  } catch (e) {
    error.value = true
    console.error('Mermaid render error:', e)
  }
})
</script>
