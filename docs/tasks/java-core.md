---
title: Java Core Tasks
description: 20 practical Java coding tasks — string manipulation, data structures, algorithms, OOP — with suggested solutions
---

# Java Core Tasks

Tasks 1–20 covering strings, data structures, algorithms, and core OOP contracts.

---

### Task 1 — Parse Integer Without `parseInt`

**Difficulty:** Easy

**Problem:** Convert a decimal string like `"-12345"` to an `int` without using `Integer.parseInt`, `Integer.valueOf`, or any other library method.

**Example:**
```
"-12345" → -12345
"0"      → 0
"42"     → 42
```

**Hints**
- Handle the optional leading `'-'` sign separately.
- Iterate character by character; `'5' - '0'` gives digit `5`.
- Build the result with `result = result * 10 + digit`.

**Suggested Solution**
```java
public static int parseInt(String s) {
    if (s == null || s.isEmpty()) throw new IllegalArgumentException("Empty input");
    int i = 0;
    boolean negative = false;
    if (s.charAt(0) == '-') { negative = true; i = 1; }
    int result = 0;
    while (i < s.length()) {
        char c = s.charAt(i++);
        if (c < '0' || c > '9') throw new IllegalArgumentException("Non-digit: " + c);
        result = result * 10 + (c - '0');
    }
    return negative ? -result : result;
}
```

**Why this approach:** Single pass, O(n) time, O(1) space. Handling the sign flag upfront avoids branching inside the loop.

---

### Task 2 — Reverse Words in a Sentence

**Difficulty:** Easy

**Problem:** Given a string of words separated by spaces, return the words in reverse order. Leading/trailing spaces and multiple consecutive spaces should be collapsed.

**Example:**
```
"  Hello   World  " → "World Hello"
"one"               → "one"
```

**Hints**
- `String.trim()` + `split("\\s+")` handles irregular spacing.
- Iterate the word array backwards.

**Suggested Solution**
```java
public static String reverseWords(String s) {
    String[] words = s.trim().split("\\s+");
    StringBuilder sb = new StringBuilder();
    for (int i = words.length - 1; i >= 0; i--) {
        if (sb.length() > 0) sb.append(' ');
        sb.append(words[i]);
    }
    return sb.toString();
}
```

**Why this approach:** `split("\\s+")` is a single regex that handles both multiple spaces and tabs. Iterating backwards avoids reversing the array separately.

---

### Task 3 — Palindrome Check (Unicode-Safe)

**Difficulty:** Easy

**Problem:** Return `true` if a string is a palindrome, considering only alphanumeric characters and ignoring case. The string may contain Unicode characters.

**Example:**
```
"A man, a plan, a canal: Panama" → true
"race a car"                     → false
"Was it a car or a cat I saw?"   → true
```

**Hints**
- `Character.isLetterOrDigit(c)` works for Unicode.
- Two-pointer approach: left and right, skip non-alphanumeric.

**Suggested Solution**
```java
public static boolean isPalindrome(String s) {
    int left = 0, right = s.length() - 1;
    while (left < right) {
        while (left < right && !Character.isLetterOrDigit(s.charAt(left)))  left++;
        while (left < right && !Character.isLetterOrDigit(s.charAt(right))) right--;
        if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right)))
            return false;
        left++; right--;
    }
    return true;
}
```

**Why this approach:** Two-pointer is O(n) time, O(1) space — no need to build a filtered string. `Character.toLowerCase` handles Unicode case folding correctly.

---

### Task 4 — Find Duplicate Characters

**Difficulty:** Easy

**Problem:** Given a string, return a `Set<Character>` of all characters that appear more than once.

**Example:**
```
"programming" → {r, g, m}
"abcde"       → {}
```

**Hints**
- Use a `Map<Character, Integer>` for frequency counting.
- Or use a `Set` — add to a "seen" set; if already present, add to "duplicates" set.

**Suggested Solution**
```java
public static Set<Character> findDuplicates(String s) {
    Set<Character> seen = new HashSet<>();
    Set<Character> duplicates = new LinkedHashSet<>(); // preserves insertion order
    for (char c : s.toCharArray()) {
        if (!seen.add(c)) duplicates.add(c);
    }
    return duplicates;
}
```

**Why this approach:** Two-set approach is O(n) and avoids a second pass over the frequency map. `LinkedHashSet` preserves the order in which duplicates are first encountered, which is friendlier for testing.

---

### Task 5 — Parse Huge Numeric String

**Difficulty:** Medium

**Problem:** Given a numeric string that may be billions of digits long (too large for `long`), return its value as a `BigInteger`, parsing it digit-by-digit without using `new BigInteger(String)`.

**Example:**
```
"123456789012345678901234567890" → BigInteger equivalent
```

**Hints**
- `BigInteger.TEN` and `BigInteger.valueOf(digit)` are your friends.
- Read the string in chunks of 18 digits at a time for efficiency (a `long` holds 18 decimal digits safely).

**Suggested Solution**
```java
public static BigInteger parseHuge(String s) {
    if (s == null || s.isEmpty()) throw new IllegalArgumentException();
    int start = 0;
    boolean negative = s.charAt(0) == '-';
    if (negative) start = 1;

    BigInteger result = BigInteger.ZERO;
    BigInteger base = BigInteger.ONE;
    // Process in chunks of 18 for performance
    int chunkSize = 18;
    for (int i = s.length(); i > start; i -= chunkSize) {
        int from = Math.max(start, i - chunkSize);
        long chunk = Long.parseLong(s.substring(from, i));
        result = result.add(base.multiply(BigInteger.valueOf(chunk)));
        base = base.multiply(BigInteger.TEN.pow(i - from));
    }
    return negative ? result.negate() : result;
}
```

**Why this approach:** Parsing 18-digit chunks via `Long.parseLong` is far faster than single-digit `BigInteger` arithmetic. Each chunk costs one `long` parse and two `BigInteger` multiplications.

---

### Task 6 — Stack Using Two Queues

**Difficulty:** Easy

**Problem:** Implement a stack (`push`, `pop`, `peek`, `isEmpty`) using only two `Queue<Integer>` instances.

**Hints**
- On `push`, enqueue to the empty queue, then drain the non-empty queue into it. The new element is always at the front.
- `pop`/`peek` then just poll/peek from the main queue.

**Suggested Solution**
```java
public class StackUsingQueues {
    private Queue<Integer> main = new LinkedList<>();
    private Queue<Integer> temp = new LinkedList<>();

    public void push(int val) {
        temp.offer(val);
        while (!main.isEmpty()) temp.offer(main.poll());
        Queue<Integer> swap = main; main = temp; temp = swap;
    }

    public int pop()  { return main.poll(); }
    public int peek() { return main.peek(); }
    public boolean isEmpty() { return main.isEmpty(); }
}
```

**Why this approach:** Each `push` is O(n) but `pop`/`peek` are O(1). The swap trick avoids copying references unnecessarily.

---

### Task 7 — Queue Using Two Stacks

**Difficulty:** Easy

**Problem:** Implement a queue (`enqueue`, `dequeue`, `peek`, `isEmpty`) using only two `Deque<Integer>` instances (used as stacks).

**Hints**
- Use an "inbox" stack for enqueue and an "outbox" stack for dequeue.
- Transfer inbox → outbox only when outbox is empty.

**Suggested Solution**
```java
public class QueueUsingStacks {
    private final Deque<Integer> inbox  = new ArrayDeque<>();
    private final Deque<Integer> outbox = new ArrayDeque<>();

    public void enqueue(int val) { inbox.push(val); }

    private void refill() {
        if (outbox.isEmpty())
            while (!inbox.isEmpty()) outbox.push(inbox.pop());
    }

    public int dequeue() { refill(); return outbox.pop(); }
    public int peek()    { refill(); return outbox.peek(); }
    public boolean isEmpty() { return inbox.isEmpty() && outbox.isEmpty(); }
}
```

**Why this approach:** Amortised O(1) per operation — each element moves between stacks exactly once.

---

### Task 8 — LRU Cache

**Difficulty:** Medium

**Problem:** Implement an LRU (Least Recently Used) cache with `get(key)` and `put(key, value)` operations, both in O(1). When the cache is full, evict the least recently used entry.

**Hints**
- `LinkedHashMap(capacity, 0.75f, true)` maintains access order automatically.
- Override `removeEldestEntry` to auto-evict.

**Suggested Solution**
```java
public class LRUCache {
    private final int capacity;
    private final LinkedHashMap<Integer, Integer> map;

    public LRUCache(int capacity) {
        this.capacity = capacity;
        this.map = new LinkedHashMap<>(capacity, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
                return size() > capacity;
            }
        };
    }

    public int get(int key) { return map.getOrDefault(key, -1); }
    public void put(int key, int value) { map.put(key, value); }
}
```

**Why this approach:** `LinkedHashMap` with `accessOrder=true` reorders entries on every `get` and `put`, moving the accessed entry to the tail. `removeEldestEntry` then evicts the head (least recently used) automatically.

---

### Task 9 — Binary Search

**Difficulty:** Easy

**Problem:** Implement binary search on a sorted `int[]`. Return the index of the target, or `-1` if not found.

**Suggested Solution**
```java
public static int binarySearch(int[] arr, int target) {
    int lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2; // avoids integer overflow
        if      (arr[mid] == target) return mid;
        else if (arr[mid] <  target) lo = mid + 1;
        else                          hi = mid - 1;
    }
    return -1;
}
```

**Why this approach:** `mid = lo + (hi - lo) / 2` avoids the classic `(lo + hi) / 2` overflow when `lo + hi > Integer.MAX_VALUE`.

---

### Task 10 — Merge Two Sorted Arrays In-Place

**Difficulty:** Medium

**Problem:** You have two sorted arrays: `nums1` of size `m + n` (the last `n` slots are zeros) and `nums2` of size `n`. Merge `nums2` into `nums1` in-place in sorted order.

**Example:**
```
nums1 = [1,2,3,0,0,0], m=3
nums2 = [2,5,6],       n=3
result: [1,2,2,3,5,6]
```

**Hints**
- Fill from the back of `nums1` to avoid shifting.
- Three pointers: `p1 = m-1`, `p2 = n-1`, `p = m+n-1`.

**Suggested Solution**
```java
public static void merge(int[] nums1, int m, int[] nums2, int n) {
    int p1 = m - 1, p2 = n - 1, p = m + n - 1;
    while (p2 >= 0) {
        if (p1 >= 0 && nums1[p1] > nums2[p2])
            nums1[p--] = nums1[p1--];
        else
            nums1[p--] = nums2[p2--];
    }
}
```

**Why this approach:** Writing from right-to-left means we never overwrite unprocessed elements in `nums1`. Remaining `nums2` elements that weren't consumed are already in the right place.

---

### Task 11 — Detect Cycle in a Linked List

**Difficulty:** Easy

**Problem:** Given the head of a singly linked list, return `true` if there is a cycle.

**Hints**
- Floyd's tortoise and hare: slow pointer moves 1 step, fast moves 2. If they meet, there's a cycle.

**Suggested Solution**
```java
public static boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}
```

**Why this approach:** O(n) time, O(1) space. No `HashSet` needed — the two-pointer trick detects loops by the pointers eventually meeting.

---

### Task 12 — Reverse a Linked List

**Difficulty:** Easy

**Problem:** Reverse a singly linked list in-place and return the new head.

**Suggested Solution**
```java
public static ListNode reverse(ListNode head) {
    ListNode prev = null, curr = head;
    while (curr != null) {
        ListNode next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}
```

**Why this approach:** Iterative reversal is O(n) time, O(1) space. Storing `next` before rewiring prevents losing the rest of the list.

---

### Task 13 — Kth from End of Linked List

**Difficulty:** Easy

**Problem:** Return the value of the kth node from the end of a singly linked list in one pass.

**Hints**
- Two pointers, `k` apart. Advance the leader `k` steps first, then move both until leader reaches the end.

**Suggested Solution**
```java
public static int kthFromEnd(ListNode head, int k) {
    ListNode leader = head, follower = head;
    for (int i = 0; i < k; i++) leader = leader.next;
    while (leader != null) { leader = leader.next; follower = follower.next; }
    return follower.val;
}
```

**Why this approach:** Single pass (O(n)), O(1) space. The gap between pointers is always exactly `k`, so when the leader exits, the follower is at position `k` from the end.

---

### Task 14 — Valid Parentheses

**Difficulty:** Easy

**Problem:** Given a string containing only `()[]{}`, return `true` if the brackets are correctly nested and matched.

**Example:**
```
"()[]{}"  → true
"([)]"    → false
"{[]}"    → true
```

**Suggested Solution**
```java
public static boolean isValid(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
        if (c == '(' || c == '[' || c == '{') {
            stack.push(c);
        } else {
            if (stack.isEmpty()) return false;
            char top = stack.pop();
            if (c == ')' && top != '(') return false;
            if (c == ']' && top != '[') return false;
            if (c == '}' && top != '{') return false;
        }
    }
    return stack.isEmpty();
}
```

**Why this approach:** Stack naturally tracks the expected closing bracket. Empty-stack check on a closing bracket handles the `")("` case; final `isEmpty()` handles unclosed openers.

---

### Task 15 — Flatten a Nested List

**Difficulty:** Medium

**Problem:** Given a `List` where each element is either an `Integer` or a nested `List` of the same type, return a flat `List<Integer>`.

**Example:**
```
[1, [2, [3, 4], 5], 6] → [1, 2, 3, 4, 5, 6]
```

**Suggested Solution**
```java
@SuppressWarnings("unchecked")
public static List<Integer> flatten(List<?> list) {
    List<Integer> result = new ArrayList<>();
    for (Object item : list) {
        if (item instanceof Integer i) {
            result.add(i);
        } else if (item instanceof List<?> nested) {
            result.addAll(flatten(nested));
        }
    }
    return result;
}
```

**Why this approach:** Recursive DFS mirrors the nested structure. Java 16+ pattern-matching `instanceof` makes type checks clean. An iterative approach with a `Deque` avoids stack overflow on deeply nested inputs if needed.

---

### Task 16 — Implement `equals` and `hashCode`

**Difficulty:** Easy

**Problem:** Implement a `Money` value object with `amount` (BigDecimal) and `currency` (String). Two `Money` objects are equal if both fields are equal; `hashCode` must be consistent with `equals`.

**Suggested Solution**
```java
public final class Money {
    private final BigDecimal amount;
    private final String currency;

    public Money(BigDecimal amount, String currency) {
        this.amount = Objects.requireNonNull(amount);
        this.currency = Objects.requireNonNull(currency);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Money other)) return false;
        return amount.compareTo(other.amount) == 0  // BigDecimal: 1.0 == 1.00
            && currency.equals(other.currency);
    }

    @Override
    public int hashCode() {
        // Strip trailing zeros so 1.0 and 1.00 hash the same way
        return Objects.hash(amount.stripTrailingZeros(), currency);
    }
}
```

**Why this approach:** `BigDecimal.equals` considers scale (`1.0 ≠ 1.00`), but `compareTo` does not — so a monetary amount should use `compareTo`. `stripTrailingZeros()` normalises the value before hashing so the `equals`/`hashCode` contract holds.

---

### Task 17 — Generic `Pair<A, B>`

**Difficulty:** Easy

**Problem:** Write a generic `Pair<A, B>` class with `first`, `second`, proper `equals`, `hashCode`, and a static factory `of(a, b)`.

**Suggested Solution**
```java
public final class Pair<A, B> {
    public final A first;
    public final B second;

    private Pair(A first, B second) {
        this.first  = Objects.requireNonNull(first);
        this.second = Objects.requireNonNull(second);
    }

    public static <A, B> Pair<A, B> of(A first, B second) {
        return new Pair<>(first, second);
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Pair<?, ?> p)) return false;
        return first.equals(p.first) && second.equals(p.second);
    }

    @Override public int hashCode() { return Objects.hash(first, second); }
    @Override public String toString() { return "(" + first + ", " + second + ")"; }
}
```

**Why this approach:** Immutable value object — fields are `public final`, constructor validates non-null. Static factory is idiomatic Java (`Map.entry`, `Optional.of`).

---

### Task 18 — `Comparable` and `Comparator` for a Product

**Difficulty:** Easy

**Problem:** Create a `Product` class with `name` (String) and `price` (double). Implement `Comparable<Product>` to sort by price ascending. Also provide a static `Comparator` that sorts by name alphabetically.

**Suggested Solution**
```java
public class Product implements Comparable<Product> {
    private final String name;
    private final double price;

    public Product(String name, double price) {
        this.name  = name;
        this.price = price;
    }

    @Override
    public int compareTo(Product other) {
        return Double.compare(this.price, other.price);
    }

    public static final Comparator<Product> BY_NAME =
        Comparator.comparing(p -> p.name);

    public String getName()  { return name; }
    public double getPrice() { return price; }
}

// Usage
List<Product> products = new ArrayList<>(List.of(
    new Product("Banana", 0.50),
    new Product("Apple",  1.20),
    new Product("Cherry", 0.80)
));
Collections.sort(products);              // by price
products.sort(Product.BY_NAME);          // by name
```

**Why this approach:** `Double.compare` avoids NaN and -0.0 edge-cases of subtraction. Separating the "natural order" (`Comparable`) from alternative orderings (`Comparator`) follows the principle of least surprise.

---

### Task 19 — Custom Iterator Over a 2D Array

**Difficulty:** Medium

**Problem:** Implement `Iterator<Integer>` for a `int[][]` matrix that traverses row-by-row (left-to-right, top-to-bottom).

**Suggested Solution**
```java
public class Matrix2DIterator implements Iterator<Integer> {
    private final int[][] matrix;
    private int row = 0, col = 0;

    public Matrix2DIterator(int[][] matrix) { this.matrix = matrix; }

    @Override
    public boolean hasNext() {
        while (row < matrix.length && col >= matrix[row].length) {
            row++; col = 0; // skip empty rows
        }
        return row < matrix.length;
    }

    @Override
    public Integer next() {
        if (!hasNext()) throw new NoSuchElementException();
        return matrix[row][col++];
    }
}
```

**Why this approach:** Skipping empty rows inside `hasNext` means consumers don't need to know about the jagged structure. Calling `hasNext()` inside `next()` is safe and idempotent.

---

### Task 20 — Roman Numeral to Integer

**Difficulty:** Easy

**Problem:** Convert a valid Roman numeral string (I, V, X, L, C, D, M) to an integer. Subtraction rules apply (IV=4, IX=9, etc.).

**Example:**
```
"III"    → 3
"LVIII"  → 58
"MCMXCIV" → 1994
```

**Suggested Solution**
```java
public static int romanToInt(String s) {
    Map<Character, Integer> val = Map.of(
        'I', 1, 'V', 5, 'X', 10, 'L', 50,
        'C', 100, 'D', 500, 'M', 1000
    );
    int result = 0;
    for (int i = 0; i < s.length(); i++) {
        int curr = val.get(s.charAt(i));
        int next = (i + 1 < s.length()) ? val.get(s.charAt(i + 1)) : 0;
        result += (curr < next) ? -curr : curr;
    }
    return result;
}
```

**Why this approach:** If the current numeral is less than the next one, it's a subtraction case — subtract instead of add. Single-pass, O(n) time.

---

<RelatedTopics :topics="['/tasks/java-concurrency', '/tasks/modern-java', '/quizzes/java-core-quiz']" />

[→ Back to Tasks Overview](/tasks/)
