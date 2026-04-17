---
title: Kotlin Basics
description: Kotlin fundamentals — val/var, null safety, data classes, extension functions, when expression, and scope functions
category: kotlin
pageClass: layout-kotlin
difficulty: beginner
tags: [kotlin, null-safety, data-class, extension-functions, when, coroutines, scope-functions]
estimatedMinutes: 35
---

# Kotlin Basics

<DifficultyBadge level="beginner" />

A practical introduction to Kotlin for Java developers — each concept shown alongside its Java equivalent.

---

## Variables: val and var

```kotlin
val name: String = "Alice"   // immutable reference (like final in Java)
var age: Int = 30            // mutable reference
val inferred = "Bob"         // type inferred as String — no annotation needed

// val prevents reassignment, but mutable objects can still be modified
val list = mutableListOf(1, 2, 3)
list.add(4)        // OK — object is mutable
// list = mutableListOf() — compile error: val cannot be reassigned
```

---

## Null Safety

Kotlin's type system distinguishes nullable (`String?`) from non-nullable (`String`).

```kotlin
var name: String = "Alice"
// name = null              // compile error: String is non-nullable

var nullableName: String? = "Alice"
nullableName = null          // OK

// Safe call operator ?.
val length = nullableName?.length    // returns Int? — null if nullableName is null

// Elvis operator ?: (default when null)
val len = nullableName?.length ?: 0  // 0 if null

// Non-null assertion !! (throws NPE if null — use sparingly)
val forced = nullableName!!.length   // throws NullPointerException if null

// let — execute block only if non-null
nullableName?.let { name ->
    println("Name is $name, length is ${name.length}")
}

// Smart cast — after null check, compiler knows type is non-null
if (nullableName != null) {
    println(nullableName.length)  // no ?. needed — smart cast to String
}
```

---

## String Templates

```kotlin
val name = "Alice"
val age = 30

println("Hello, $name!")                        // simple variable
println("Name length: ${name.length}")          // expression in braces
println("Next year: ${age + 1}")
println("Is adult: ${if (age >= 18) "yes" else "no"}")

// Multiline strings (trimIndent removes leading whitespace)
val json = """
    {
        "name": "$name",
        "age": $age
    }
""".trimIndent()
```

---

## Functions

```kotlin
// Standard function
fun greet(name: String): String {
    return "Hello, $name!"
}

// Single-expression function
fun greet(name: String) = "Hello, $name!"

// Default parameters (reduces need for overloading)
fun createUser(name: String, role: String = "USER", active: Boolean = true): User =
    User(name, role, active)

createUser("Alice")                          // role="USER", active=true
createUser("Bob", role = "ADMIN")            // named argument
createUser("Carol", active = false)

// Extension function — adds a method to an existing class without inheritance
fun String.isPalindrome(): Boolean =
    this == this.reversed()

"racecar".isPalindrome()   // true
"hello".isPalindrome()     // false

// Higher-order functions
fun transform(list: List<Int>, fn: (Int) -> Int): List<Int> =
    list.map(fn)

transform(listOf(1, 2, 3)) { it * 2 }   // [2, 4, 6]
```

---

## Data Classes

```kotlin
data class Order(
    val id: String,
    val customerId: String,
    val amount: Double,
    val status: OrderStatus = OrderStatus.PENDING
)

// Auto-generated: equals, hashCode, toString, copy, componentN functions
val order = Order("ord-1", "cust-1", 99.99)
val updated = order.copy(status = OrderStatus.PAID)  // creates modified copy

println(order)  // Order(id=ord-1, customerId=cust-1, amount=99.99, status=PENDING)

// Destructuring
val (id, customerId, amount) = order
println("$id for $customerId: $amount")
```

---

## when Expression

`when` replaces `switch` but is far more powerful — it's an expression, not a statement.

```kotlin
// Replacing switch
val description = when (status) {
    OrderStatus.PENDING  -> "Awaiting payment"
    OrderStatus.PAID     -> "Payment received"
    OrderStatus.SHIPPED  -> "On the way"
    OrderStatus.DELIVERED -> "Delivered"
}   // exhaustive on sealed class / enum — no else needed

// Arbitrary conditions
val category = when {
    amount < 10    -> "small"
    amount < 100   -> "medium"
    amount < 1000  -> "large"
    else           -> "enterprise"
}

// Type checking with smart cast
fun describe(obj: Any): String = when (obj) {
    is String -> "String of length ${obj.length}"   // obj smart-cast to String
    is Int    -> "Integer: ${obj * 2}"
    is List<*> -> "List with ${obj.size} items"
    else      -> "Unknown: $obj"
}
```

---

## Collections

```kotlin
// Immutable (read-only) by default
val names = listOf("Alice", "Bob", "Carol")
val scores = mapOf("Alice" to 95, "Bob" to 87)

// Mutable
val mutableNames = mutableListOf("Alice", "Bob")
mutableNames.add("Carol")

// Kotlin collection operations (like Java Streams but on collections directly)
val orders = listOf(
    Order("1", "c1", 150.0, OrderStatus.PAID),
    Order("2", "c2", 30.0,  OrderStatus.PENDING),
    Order("3", "c1", 200.0, OrderStatus.PAID)
)

val paidTotal = orders
    .filter { it.status == OrderStatus.PAID }
    .sumOf { it.amount }                         // 350.0

val byCustomer = orders.groupBy { it.customerId }
// Map<String, List<Order>>

val orderIds = orders.map { it.id }              // ["1", "2", "3"]
val hasLarge  = orders.any { it.amount > 100 }   // true
val allPaid   = orders.all { it.status == OrderStatus.PAID } // false
```

---

## Scope Functions

Scope functions execute a block with an object as context — they reduce repetition and improve readability.

```kotlin
// let — transforms the object, uses 'it'
val length = "hello"?.let { it.length }  // null-safe transform

// apply — configures an object, returns the object itself (uses 'this')
val order = Order("1", "c1", 0.0).apply {
    // imagine mutable builder here
}

// also — side effect (logging), returns the object (uses 'it')
val user = createUser("Alice")
    .also { log.info("Created user: ${it.name}") }

// run — execute block, return result (uses 'this')
val message = order.run {
    "Order $id for $customerId: $$amount"
}

// with — like run but takes the object as argument (not extension function)
val summary = with(order) {
    "id=$id amount=$amount"
}
```

| Function | Object reference | Return value | Use case |
|----------|-----------------|-------------|---------|
| `let` | `it` | Lambda result | Null-safe transform, scoping |
| `apply` | `this` | The object | Object configuration/init |
| `also` | `it` | The object | Side effects (logging) |
| `run` | `this` | Lambda result | Compute result using object |
| `with` | `this` | Lambda result | Multiple operations on object |

---

## Object Declarations and Companion Objects

```kotlin
// Singleton — object declaration (thread-safe, lazy initialisation)
object AppConfig {
    val baseUrl = System.getenv("API_URL") ?: "http://localhost:8080"
    val timeout = 30
}

AppConfig.baseUrl   // access directly, no instance needed

// Companion object — static-like members attached to a class
class Order private constructor(val id: String) {

    companion object {
        private var counter = 0

        fun create(): Order {
            return Order("ord-${++counter}")
        }
    }
}

val order = Order.create()   // like a static factory method
```

---

## Sealed Classes and Interfaces

```kotlin
sealed interface PaymentResult
data class Success(val transactionId: String) : PaymentResult
data class Failure(val errorCode: String, val message: String) : PaymentResult
object Pending : PaymentResult

// Exhaustive when — no else needed
fun handle(result: PaymentResult) = when (result) {
    is Success -> "Charged: ${result.transactionId}"
    is Failure -> "Failed (${result.errorCode}): ${result.message}"
    Pending    -> "Processing..."
}
```

---

## Interview Quick-Fire

**Q: What is the difference between `val` and `const val`?**
`val` is a runtime immutable reference — its value is set at runtime. `const val` is a compile-time constant (only for primitives and String) — its value is inlined at every use site in the bytecode.

**Q: How does Kotlin eliminate NullPointerExceptions?**
The type system separates `String` (never null) from `String?` (nullable). The compiler enforces null checks before accessing nullable types. NPEs can only occur with `!!` (explicit assertion) or when interoperating with Java code that returns null without `@Nullable` annotation.

**Q: What is an extension function and can it access private members?**
An extension function adds a method to an existing class without modifying its source. It's syntactic sugar — it compiles to a static method taking the receiver as the first parameter. It can only access `public` and `internal` members, not `private` or `protected`.

<RelatedTopics :topics="['/kotlin/', '/kotlin/kotlin-vs-java', '/kotlin/coroutines']" />

[→ Back to Kotlin Overview](/kotlin/)
