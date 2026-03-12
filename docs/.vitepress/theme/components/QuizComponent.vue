<template>
  <div class="quiz-wrapper">
    <!-- Results screen -->
    <template v-if="showResults">
      <div class="quiz-results">
        <div class="quiz-score">{{ score }}/{{ questions.length }}</div>
        <div class="quiz-score-label">
          <span v-if="score === questions.length">🎉 Perfect score! Outstanding!</span>
          <span v-else-if="score >= questions.length * 0.8">✅ Great job! Keep it up!</span>
          <span v-else-if="score >= questions.length * 0.6">📚 Good effort — review the explanations.</span>
          <span v-else>🔄 Review the material and try again.</span>
        </div>
        <button class="quiz-btn quiz-btn--primary" @click="restart">Try Again</button>
      </div>
    </template>

    <!-- Question screen -->
    <template v-else>
      <div class="quiz-header">
        <h3>Question {{ currentIndex + 1 }} of {{ questions.length }}</h3>
        <div class="quiz-progress">
          <span>{{ score }} correct</span>
          <div class="quiz-progress-bar">
            <div
              class="quiz-progress-fill"
              :style="{ width: ((currentIndex) / questions.length * 100) + '%' }"
            ></div>
          </div>
        </div>
      </div>

      <div class="quiz-body">
        <p class="quiz-question">{{ current.question }}</p>

        <div class="quiz-options">
          <button
            v-for="(opt, i) in current.options"
            :key="i"
            class="quiz-option"
            :class="{
              'quiz-option--selected': selected === i && !answered,
              'quiz-option--correct': answered && i === current.answer,
              'quiz-option--wrong': answered && selected === i && i !== current.answer,
              'quiz-option--disabled': answered,
            }"
            @click="select(i)"
          >
            <span class="quiz-option__letter">{{ letters[i] }}</span>
            {{ opt }}
          </button>
        </div>

        <div v-if="answered && current.explanation" class="quiz-explanation">
          💡 {{ current.explanation }}
        </div>

        <div class="quiz-actions">
          <button
            v-if="!answered"
            class="quiz-btn quiz-btn--primary"
            :disabled="selected === null"
            @click="checkAnswer"
          >
            Check Answer
          </button>
          <button
            v-if="answered && currentIndex < questions.length - 1"
            class="quiz-btn quiz-btn--primary"
            @click="next"
          >
            Next Question →
          </button>
          <button
            v-if="answered && currentIndex === questions.length - 1"
            class="quiz-btn quiz-btn--primary"
            @click="finish"
          >
            See Results
          </button>
          <button v-if="answered" class="quiz-btn quiz-btn--secondary" @click="restart">
            Restart
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  questions: {
    type: Array,
    required: true,
  },
})

const letters = ['A', 'B', 'C', 'D', 'E']

const currentIndex = ref(0)
const selected = ref(null)
const answered = ref(false)
const score = ref(0)
const showResults = ref(false)

const current = computed(() => props.questions[currentIndex.value])

function select(i) {
  if (!answered.value) selected.value = i
}

function checkAnswer() {
  if (selected.value === null) return
  answered.value = true
  if (selected.value === current.value.answer) score.value++
}

function next() {
  currentIndex.value++
  selected.value = null
  answered.value = false
}

function finish() {
  showResults.value = true
}

function restart() {
  currentIndex.value = 0
  selected.value = null
  answered.value = false
  score.value = 0
  showResults.value = false
}
</script>
