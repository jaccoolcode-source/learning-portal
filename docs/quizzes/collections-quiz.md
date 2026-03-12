---
title: Java Collections Quiz
---

<script setup>
const questions = [
  {
    question: "What is the default initial capacity of a HashMap in Java?",
    options: [
      "8",
      "16",
      "32",
      "64"
    ],
    answer: 1,
    explanation: "HashMap's default initial capacity is 16 (a power of two). Combined with the default load factor of 0.75, it will resize (rehash) when 12 entries are added."
  },
  {
    question: "What is the default load factor of a HashMap?",
    options: [
      "0.5",
      "0.6",
      "0.75",
      "1.0"
    ],
    answer: 2,
    explanation: "The default load factor is 0.75, balancing memory usage against lookup performance. When the number of entries exceeds capacity × load factor, the map is resized and rehashed."
  },
  {
    question: "In Java 8+, a HashMap bucket is converted from a linked list to a red-black tree when the bucket size exceeds what threshold?",
    options: [
      "4 nodes",
      "6 nodes",
      "8 nodes",
      "16 nodes"
    ],
    answer: 2,
    explanation: "When a single bucket chain grows beyond 8 nodes (TREEIFY_THRESHOLD = 8), HashMap converts that chain to a red-black tree, improving worst-case lookup from O(n) to O(log n). It converts back to a list if the count drops below 6 (UNTREEIFY_THRESHOLD)."
  },
  {
    question: "How does TreeMap order its entries by default?",
    options: [
      "Insertion order",
      "Access order (most recently used first)",
      "Natural ordering of keys via Comparable",
      "Hash code order"
    ],
    answer: 2,
    explanation: "TreeMap sorts entries by the natural ordering of keys (keys must implement Comparable), or by a Comparator provided at construction time. It uses a red-black tree internally, giving O(log n) for get, put, and remove."
  },
  {
    question: "What ordering does LinkedHashMap maintain?",
    options: [
      "Natural key ordering",
      "Insertion order (or optionally access order)",
      "No guaranteed order",
      "Reverse insertion order"
    ],
    answer: 1,
    explanation: "LinkedHashMap maintains insertion order by default by keeping a doubly-linked list through all its entries. It can optionally be constructed in access-order mode, which is useful for building LRU caches."
  },
  {
    question: "HashSet is internally backed by which data structure?",
    options: [
      "TreeMap",
      "LinkedList",
      "HashMap",
      "ArrayDeque"
    ],
    answer: 2,
    explanation: "HashSet is implemented as a HashMap where set elements become the map's keys, and a constant dummy value (PRESENT) is stored as the value. This is why HashSet has O(1) average add/contains/remove."
  },
  {
    question: "Which of the following List implementations are thread-safe? (Choose the best answer)",
    options: [
      "ArrayList and LinkedList",
      "Vector and CopyOnWriteArrayList",
      "ArrayList and CopyOnWriteArrayList",
      "Vector and LinkedList"
    ],
    answer: 1,
    explanation: "Vector synchronizes every method with intrinsic locks (legacy, low performance). CopyOnWriteArrayList (java.util.concurrent) takes a snapshot on every write, making reads lock-free and ideal for read-heavy workloads. ArrayList and LinkedList are not thread-safe."
  },
  {
    question: "If two objects are equal according to equals(), what must be true about their hashCode() values?",
    options: [
      "They must have different hashCode() values",
      "They must have the same hashCode() value",
      "hashCode() values are unrelated to equals()",
      "One hashCode() must be zero"
    ],
    answer: 1,
    explanation: "The equals/hashCode contract requires: if a.equals(b) == true, then a.hashCode() == b.hashCode(). The reverse is not required — two unequal objects may share the same hash code (a collision). Breaking this contract causes objects to be 'lost' in HashMaps and HashSets."
  },
  {
    question: "Which is the preferred data structure for stack and queue operations in Java, and why?",
    options: [
      "LinkedList, because it implements both Deque and List",
      "Stack, because it is specifically designed for LIFO operations",
      "ArrayDeque, because it is faster than LinkedList with no node allocation overhead",
      "PriorityQueue, because it provides O(1) access to the head element"
    ],
    answer: 2,
    explanation: "ArrayDeque is generally faster than LinkedList for stack/queue operations because it uses a resizable array (no per-element node objects), resulting in better cache locality and lower GC pressure. The Java docs themselves recommend ArrayDeque over Stack."
  },
  {
    question: "What is the default ordering behavior of PriorityQueue in Java?",
    options: [
      "Insertion order (FIFO)",
      "Reverse natural order (max-heap)",
      "Natural order of elements (min-heap)",
      "Random order"
    ],
    answer: 2,
    explanation: "PriorityQueue uses natural ordering by default (elements must implement Comparable), resulting in a min-heap where poll() always returns the smallest element. A custom Comparator can reverse this to create a max-heap: new PriorityQueue<>(Collections.reverseOrder())."
  }
]
</script>

# Java Collections Quiz

Test your knowledge of the Java Collections Framework, including internal implementations, ordering guarantees, and thread safety.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Collections study pages](/collections/).
