import DefaultTheme from 'vitepress/theme'
import './custom.css'
import QuizComponent from './components/QuizComponent.vue'
import CategoryCard from './components/CategoryCard.vue'
import DifficultyBadge from './components/DifficultyBadge.vue'
import RelatedTopics from './components/RelatedTopics.vue'
import MermaidDiagram from './components/MermaidDiagram.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Quiz', QuizComponent)
    app.component('CategoryCard', CategoryCard)
    app.component('DifficultyBadge', DifficultyBadge)
    app.component('RelatedTopics', RelatedTopics)
    app.component('MermaidDiagram', MermaidDiagram)
  },
}
