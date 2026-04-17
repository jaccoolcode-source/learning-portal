---
title: Low-Level Design Tasks
description: 14 OOP design tasks — parking lot, elevator, ATM, chess, vending machine, and more — with suggested class models and Java implementations
---

# Low-Level Design Tasks

Tasks 45–58. These are open-ended OOP design problems. Focus on identifying entities, responsibilities, and relationships before writing code.

---

### Task 45 — Parking Lot

**Difficulty:** Medium

**Problem:** Design a multi-level parking lot that supports motorcycles, cars, and trucks. Spots have sizes (small/medium/large). A motorcycle fits any spot; a car fits medium or large; a truck fits only large. Implement `park(Vehicle)`, `leave(ticket)`, and `getAvailableSpots()`.

**Key Classes**
```java
public enum VehicleType { MOTORCYCLE, CAR, TRUCK }
public enum SpotSize    { SMALL, MEDIUM, LARGE }

public class Vehicle {
    private final String plate;
    private final VehicleType type;
}

public class ParkingSpot {
    private final int level;
    private final int number;
    private final SpotSize size;
    private Vehicle occupant;   // null = available

    public boolean canFit(Vehicle v) {
        return switch (v.getType()) {
            case MOTORCYCLE -> true;
            case CAR        -> size == SpotSize.MEDIUM || size == SpotSize.LARGE;
            case TRUCK      -> size == SpotSize.LARGE;
        };
    }
    public boolean isAvailable() { return occupant == null; }
}

public class ParkingTicket {
    private final String ticketId;
    private final ParkingSpot spot;
    private final Instant issuedAt;
}

public class ParkingLot {
    private final List<ParkingSpot> spots;

    public Optional<ParkingTicket> park(Vehicle vehicle) {
        return spots.stream()
            .filter(s -> s.isAvailable() && s.canFit(vehicle))
            .findFirst()
            .map(spot -> {
                spot.occupy(vehicle);
                return new ParkingTicket(UUID.randomUUID().toString(), spot, Instant.now());
            });
    }

    public void leave(ParkingTicket ticket) {
        ticket.getSpot().vacate();
    }

    public long getAvailableSpots(VehicleType type) {
        return spots.stream()
            .filter(s -> s.isAvailable() && s.canFit(new Vehicle("", type)))
            .count();
    }
}
```

**Why this approach:** Each class has a single responsibility. `canFit` logic lives on `ParkingSpot` rather than scattered in the lot — the spot knows its own constraints. `Optional<ParkingTicket>` communicates "lot full" without exceptions.

---

### Task 46 — Elevator System

**Difficulty:** Hard

**Problem:** Design an elevator system for a building with N floors and M elevators. Users press a floor button; the system dispatches the nearest idle (or same-direction) elevator. Implement `requestElevator(floor, direction)` and `step()` to simulate one time unit of movement.

**Key Classes**
```java
public enum Direction { UP, DOWN, IDLE }

public class Elevator {
    private int currentFloor;
    private Direction direction;
    private final Set<Integer> destinations = new TreeSet<>();

    public void addDestination(int floor) { destinations.add(floor); }

    public void step() {
        if (destinations.isEmpty()) { direction = Direction.IDLE; return; }
        int next = direction == Direction.UP
            ? destinations.first()
            : destinations.last();
        if (currentFloor < next)      { currentFloor++; direction = Direction.UP; }
        else if (currentFloor > next) { currentFloor--; direction = Direction.DOWN; }
        else {
            destinations.remove(currentFloor); // arrived
            if (destinations.isEmpty()) direction = Direction.IDLE;
        }
    }

    public int distanceTo(int floor) { return Math.abs(currentFloor - floor); }
    public boolean isIdle()          { return direction == Direction.IDLE; }
}

public class ElevatorController {
    private final List<Elevator> elevators;

    public void requestElevator(int floor, Direction dir) {
        Elevator best = elevators.stream()
            .min(Comparator.comparingInt(e -> score(e, floor, dir)))
            .orElseThrow();
        best.addDestination(floor);
    }

    private int score(Elevator e, int floor, Direction dir) {
        if (e.isIdle()) return e.distanceTo(floor);
        // same direction and on the way: low score (preferred)
        if (e.getDirection() == dir && isOnTheWay(e, floor)) return e.distanceTo(floor);
        // opposite direction or past the floor: penalise
        return e.distanceTo(floor) + 100;
    }
}
```

**Why this approach:** `TreeSet` keeps destinations sorted so finding the next floor in the current direction is O(log n). The scoring function favours elevators already moving in the same direction and on the way — a simplified SCAN/LOOK algorithm used in real elevator controllers.

---

### Task 47 — ATM Machine

**Difficulty:** Medium

**Problem:** Design an ATM that supports: insert card, verify PIN (3 attempts before lock), check balance, withdraw (denominations: 100, 50, 20), and eject card. Model with a state machine.

**Key Classes**
```java
public enum AtmState { IDLE, CARD_INSERTED, AUTHENTICATED, DISPENSING }

public class AtmMachine {
    private AtmState state = AtmState.IDLE;
    private Account  currentAccount;
    private int      pinAttempts;

    public void insertCard(Account account) {
        if (state != AtmState.IDLE) throw new IllegalStateException("Card already inserted");
        currentAccount = account;
        pinAttempts    = 0;
        state          = AtmState.CARD_INSERTED;
    }

    public boolean verifyPin(String pin) {
        if (state != AtmState.CARD_INSERTED) throw new IllegalStateException();
        if (currentAccount.checkPin(pin)) {
            state = AtmState.AUTHENTICATED;
            return true;
        }
        if (++pinAttempts >= 3) {
            currentAccount.lock();
            ejectCard();
        }
        return false;
    }

    public BigDecimal checkBalance() {
        requireAuthenticated();
        return currentAccount.getBalance();
    }

    public Map<Integer, Integer> withdraw(BigDecimal amount) {
        requireAuthenticated();
        if (amount.remainder(BigDecimal.TEN).compareTo(BigDecimal.ZERO) != 0)
            throw new IllegalArgumentException("Amount must be a multiple of 10");
        if (amount.compareTo(currentAccount.getBalance()) > 0)
            throw new IllegalStateException("Insufficient funds");
        currentAccount.debit(amount);
        return dispense(amount.intValue());
    }

    private Map<Integer, Integer> dispense(int amount) {
        Map<Integer, Integer> notes = new LinkedHashMap<>();
        for (int denom : new int[]{100, 50, 20}) {
            int count = amount / denom;
            if (count > 0) notes.put(denom, count);
            amount %= denom;
        }
        return notes;
    }

    public void ejectCard() { currentAccount = null; state = AtmState.IDLE; }
    private void requireAuthenticated() {
        if (state != AtmState.AUTHENTICATED) throw new IllegalStateException("Not authenticated");
    }
}
```

**Why this approach:** Explicit state enum prevents invalid operations (e.g., withdraw before PIN). Greedy denomination algorithm works for standard ATM denominations (100/50/20 cover all multiples of 10).

---

### Task 48 — Chess: Piece Movement Validation

**Difficulty:** Hard

**Problem:** Implement a `Board` with `isValidMove(piece, from, to)` for all 6 piece types (King, Queen, Rook, Bishop, Knight, Pawn). Include basic rules: movement pattern, capture, blocked path (for sliding pieces), and pawn direction. No need for check/checkmate.

**Key Structure**
```java
public record Position(int row, int col) {
    public boolean isValid() { return row >= 0 && row < 8 && col >= 0 && col < 8; }
    public int rowDiff(Position to) { return Math.abs(to.row - this.row); }
    public int colDiff(Position to) { return Math.abs(to.col - this.col); }
}

public interface Piece {
    Color getColor();
    boolean canMove(Position from, Position to, Board board);
}

public class Rook implements Piece {
    public boolean canMove(Position from, Position to, Board board) {
        if (from.row() != to.row() && from.col() != to.col()) return false; // must move in straight line
        return board.isPathClear(from, to) && !board.isFriendlyOccupied(to, getColor());
    }
}

public class Bishop implements Piece {
    public boolean canMove(Position from, Position to, Board board) {
        if (from.rowDiff(to) != from.colDiff(to)) return false; // must be diagonal
        return board.isPathClear(from, to) && !board.isFriendlyOccupied(to, getColor());
    }
}

public class Knight implements Piece {
    public boolean canMove(Position from, Position to, Board board) {
        int r = from.rowDiff(to), c = from.colDiff(to);
        return (r == 2 && c == 1 || r == 1 && c == 2)  // L-shape
            && !board.isFriendlyOccupied(to, getColor()); // knights jump, no path check
    }
}

public class Pawn implements Piece {
    public boolean canMove(Position from, Position to, Board board) {
        int direction = getColor() == Color.WHITE ? 1 : -1;
        int rowDiff   = (to.row() - from.row()) * direction; // must be positive (forward)
        int colDiff   = from.colDiff(to);

        if (colDiff == 0 && rowDiff == 1 && board.isEmpty(to)) return true;          // single step
        if (colDiff == 0 && rowDiff == 2 && isStartRow(from) && board.isEmpty(to))   // double step
            return board.isEmpty(new Position(from.row() + direction, from.col()));
        if (colDiff == 1 && rowDiff == 1 && board.isEnemyOccupied(to, getColor())) return true; // capture
        return false;
    }

    private boolean isStartRow(Position from) {
        return (getColor() == Color.WHITE && from.row() == 1)
            || (getColor() == Color.BLACK && from.row() == 6);
    }
}
```

**Why this approach:** Each piece encapsulates its own movement rules (Strategy pattern). Sliding pieces delegate path-clearing to `Board.isPathClear`, which walks between `from` and `to` in unit steps. Knights skip path checks entirely since they jump.

---

### Task 49 — Vending Machine

**Difficulty:** Medium

**Problem:** Design a vending machine. Users insert coins, select a product, and receive change. States: `IDLE → HAS_CREDIT → DISPENSING → CHANGE`. Products have a code, name, and price. Support `insertCoin`, `selectProduct`, `cancel`, and `dispense`.

**Key Classes**
```java
public class VendingMachine {
    private final Map<String, Product> inventory = new HashMap<>();
    private BigDecimal credit = BigDecimal.ZERO;
    private Product    selected;

    public void insertCoin(BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) throw new IllegalArgumentException();
        credit = credit.add(amount);
    }

    public void selectProduct(String code) {
        Product p = inventory.get(code);
        if (p == null)                              throw new IllegalArgumentException("Unknown product");
        if (p.getStock() == 0)                      throw new IllegalStateException("Out of stock");
        if (credit.compareTo(p.getPrice()) < 0)     throw new IllegalStateException("Insufficient credit");
        selected = p;
    }

    public DispenseResult dispense() {
        if (selected == null) throw new IllegalStateException("No product selected");
        BigDecimal change = credit.subtract(selected.getPrice());
        selected.decrementStock();
        Product dispensed = selected;
        credit   = BigDecimal.ZERO;
        selected = null;
        return new DispenseResult(dispensed, change);
    }

    public BigDecimal cancel() {
        BigDecimal refund = credit;
        credit   = BigDecimal.ZERO;
        selected = null;
        return refund;
    }
}

public record DispenseResult(Product product, BigDecimal change) {}
```

**Why this approach:** Simple stateful machine without an explicit enum — the combination of `credit > 0` and `selected != null` implicitly models state. This is fine for a small machine; an explicit state enum would be preferable for a larger system or if transitions become complex.

---

### Task 50 — Library Management System

**Difficulty:** Medium

**Problem:** Design a library where members can borrow books, return them, and be charged overdue fees. A book can have multiple copies. A member can borrow up to 3 books at once.

**Key Classes**
```java
public class BookCopy {
    private final String copyId;
    private final Book   book;
    private boolean      available = true;
}

public class Loan {
    private final Member   member;
    private final BookCopy copy;
    private final LocalDate borrowedOn;
    private LocalDate       returnedOn;

    public BigDecimal calculateFee(LocalDate today) {
        LocalDate due = borrowedOn.plusDays(14);
        long overdueDays = Math.max(0, ChronoUnit.DAYS.between(due, today));
        return BigDecimal.valueOf(overdueDays).multiply(new BigDecimal("0.25")); // $0.25/day
    }
}

public class Library {
    private final Map<String, BookCopy> copies   = new HashMap<>();
    private final List<Loan>            loans    = new ArrayList<>();
    private static final int MAX_LOANS = 3;

    public Loan borrow(Member member, String copyId) {
        long active = loans.stream()
            .filter(l -> l.getMember().equals(member) && l.getReturnedOn() == null)
            .count();
        if (active >= MAX_LOANS) throw new IllegalStateException("Borrow limit reached");

        BookCopy copy = copies.get(copyId);
        if (copy == null || !copy.isAvailable()) throw new IllegalStateException("Copy unavailable");
        copy.setAvailable(false);
        Loan loan = new Loan(member, copy, LocalDate.now());
        loans.add(loan);
        return loan;
    }

    public BigDecimal returnCopy(Loan loan) {
        loan.setReturnedOn(LocalDate.now());
        loan.getCopy().setAvailable(true);
        return loan.calculateFee(LocalDate.now());
    }
}
```

---

### Task 51 — Hotel Booking System

**Difficulty:** Medium

**Problem:** Design a hotel booking system. Rooms have a type (SINGLE, DOUBLE, SUITE) and a price per night. Users search available rooms for a date range, book a room, and cancel a booking.

**Key Classes**
```java
public class Booking {
    private final String    bookingId;
    private final Room      room;
    private final Guest     guest;
    private final LocalDate checkIn;
    private final LocalDate checkOut;

    public boolean overlaps(LocalDate from, LocalDate to) {
        return !checkOut.isBefore(from) && !checkIn.isAfter(to);
    }

    public BigDecimal totalPrice() {
        long nights = ChronoUnit.DAYS.between(checkIn, checkOut);
        return room.getPricePerNight().multiply(BigDecimal.valueOf(nights));
    }
}

public class Hotel {
    private final List<Room>    rooms    = new ArrayList<>();
    private final List<Booking> bookings = new ArrayList<>();

    public List<Room> findAvailable(RoomType type, LocalDate from, LocalDate to) {
        Set<Room> bookedRooms = bookings.stream()
            .filter(b -> b.overlaps(from, to) && !b.isCancelled())
            .map(Booking::getRoom)
            .collect(Collectors.toSet());

        return rooms.stream()
            .filter(r -> r.getType() == type && !bookedRooms.contains(r))
            .collect(Collectors.toList());
    }

    public Booking book(Room room, Guest guest, LocalDate from, LocalDate to) {
        if (findAvailable(room.getType(), from, to).stream().noneMatch(r -> r.equals(room)))
            throw new IllegalStateException("Room not available for those dates");
        Booking b = new Booking(UUID.randomUUID().toString(), room, guest, from, to);
        bookings.add(b);
        return b;
    }

    public void cancel(Booking booking) { booking.cancel(); }
}
```

---

### Task 52 — In-Memory Key-Value Store with TTL

**Difficulty:** Medium

**Problem:** Implement a thread-safe `KVStore<K, V>` with `put(key, value, ttlMs)`, `get(key)`, and `delete(key)`. Expired entries should be invisible to `get` (lazy expiry is fine; background cleanup is a bonus).

**Suggested Solution**
```java
public class KVStore<K, V> {
    private record Entry<V>(V value, long expiresAt) {
        boolean isExpired() { return System.currentTimeMillis() > expiresAt; }
    }

    private final ConcurrentHashMap<K, Entry<V>> store = new ConcurrentHashMap<>();

    public void put(K key, V value, long ttlMs) {
        store.put(key, new Entry<>(value, System.currentTimeMillis() + ttlMs));
    }

    public Optional<V> get(K key) {
        Entry<V> entry = store.get(key);
        if (entry == null || entry.isExpired()) {
            store.remove(key); // lazy cleanup
            return Optional.empty();
        }
        return Optional.of(entry.value());
    }

    public void delete(K key) { store.remove(key); }

    // Optional: background cleanup every 60s
    public void startCleanup(ScheduledExecutorService scheduler) {
        scheduler.scheduleAtFixedRate(
            () -> store.entrySet().removeIf(e -> e.getValue().isExpired()),
            60, 60, TimeUnit.SECONDS
        );
    }
}
```

**Why this approach:** `ConcurrentHashMap` handles concurrent access without a global lock. The nested `Entry` record bundles value + expiry cleanly. Lazy removal on `get` keeps the fast path simple; the optional background cleanup prevents memory leaks for keys that are never read again.

---

### Task 53 — Event Bus (Pub/Sub)

**Difficulty:** Medium

**Problem:** Implement a synchronous, type-safe event bus where components can `subscribe(EventType, handler)` and `publish(event)`. Each handler is invoked synchronously in subscription order.

**Suggested Solution**
```java
public class EventBus {
    private final Map<Class<?>, List<Consumer<Object>>> handlers = new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    public <T> void subscribe(Class<T> type, Consumer<T> handler) {
        handlers.computeIfAbsent(type, k -> new CopyOnWriteArrayList<>())
                .add((Consumer<Object>) handler);
    }

    public <T> void publish(T event) {
        handlers.getOrDefault(event.getClass(), List.of())
                .forEach(h -> h.accept(event));
    }

    public <T> void unsubscribe(Class<T> type, Consumer<T> handler) {
        handlers.getOrDefault(type, List.of()).remove(handler);
    }
}

// Usage
record OrderPlaced(String orderId) {}
record OrderCancelled(String orderId) {}

EventBus bus = new EventBus();
bus.subscribe(OrderPlaced.class,    e -> System.out.println("Order placed: "    + e.orderId()));
bus.subscribe(OrderCancelled.class, e -> System.out.println("Order cancelled: " + e.orderId()));
bus.publish(new OrderPlaced("o-123"));
```

**Why this approach:** `CopyOnWriteArrayList` is safe for concurrent subscribe/unsubscribe while iterating. `Class<?>` as map key gives type-safe dispatch without reflection or annotation scanning.

---

### Task 54 — File System (Directory Tree + Search)

**Difficulty:** Medium

**Problem:** Model an in-memory file system with `mkdir(path)`, `touch(path, content)`, `read(path)`, `delete(path)`, and `find(dir, namePattern)` using a tree structure.

**Key Classes**
```java
public abstract sealed class FsNode permits Directory, File {
    protected final String name;
    FsNode(String name) { this.name = name; }
    public String getName() { return name; }
}

public final class File extends FsNode {
    private String content;
    File(String name, String content) { super(name); this.content = content; }
    public String read()                    { return content; }
    public void   write(String content)     { this.content = content; }
}

public final class Directory extends FsNode {
    private final Map<String, FsNode> children = new LinkedHashMap<>();

    public Directory mkdir(String name) {
        return (Directory) children.computeIfAbsent(name, Directory::new);
    }
    public File touch(String name, String content) {
        File f = new File(name, content);
        children.put(name, f);
        return f;
    }
    public Optional<FsNode> get(String name) { return Optional.ofNullable(children.get(name)); }
    public void delete(String name)          { children.remove(name); }

    public List<File> find(String pattern) {
        List<File> results = new ArrayList<>();
        for (FsNode node : children.values()) {
            if (node instanceof File f && f.getName().matches(pattern)) results.add(f);
            if (node instanceof Directory d) results.addAll(d.find(pattern));
        }
        return results;
    }
}
```

---

### Task 55 — Task Scheduler (Priority Queue)

**Difficulty:** Medium

**Problem:** Design a task scheduler where tasks have a name, priority (1–10), and a `Runnable`. `schedule(task)` enqueues it; `runNext()` executes the highest-priority task. If priorities are equal, FIFO order applies.

**Suggested Solution**
```java
public class Task {
    private static final AtomicLong SEQ = new AtomicLong();
    private final String   name;
    private final int      priority;
    private final long     sequence = SEQ.incrementAndGet(); // tie-breaker
    private final Runnable work;

    public Task(String name, int priority, Runnable work) {
        this.name = name; this.priority = priority; this.work = work;
    }

    public static Comparator<Task> comparator() {
        return Comparator.comparingInt(Task::getPriority).reversed()  // higher = first
            .thenComparingLong(t -> t.sequence);                       // FIFO on tie
    }
}

public class TaskScheduler {
    private final PriorityQueue<Task> queue =
        new PriorityQueue<>(Task.comparator());

    public void schedule(Task task) { queue.offer(task); }

    public boolean runNext() {
        Task t = queue.poll();
        if (t == null) return false;
        t.getWork().run();
        return true;
    }

    public int pending() { return queue.size(); }
}
```

**Why this approach:** `PriorityQueue` gives O(log n) enqueue and O(log n) dequeue. The sequence counter breaks ties by insertion order — a global `AtomicLong` is thread-safe and gives a monotonically increasing value.

---

### Task 56 — Rate Limiter (Token Bucket)

**Difficulty:** Medium

**Problem:** Implement a `RateLimiter` that allows at most `capacity` requests per `refillPeriodMs`. Use the token bucket algorithm: tokens refill at a fixed rate; each request consumes one token. `tryAcquire()` returns `true` if a token is available.

**Suggested Solution**
```java
public class TokenBucketRateLimiter {
    private final long capacity;
    private final long refillPeriodMs;
    private long       tokens;
    private long       lastRefillTime;

    public TokenBucketRateLimiter(long capacity, long refillPeriodMs) {
        this.capacity       = capacity;
        this.refillPeriodMs = refillPeriodMs;
        this.tokens         = capacity;
        this.lastRefillTime = System.currentTimeMillis();
    }

    public synchronized boolean tryAcquire() {
        refill();
        if (tokens > 0) { tokens--; return true; }
        return false;
    }

    private void refill() {
        long now     = System.currentTimeMillis();
        long elapsed = now - lastRefillTime;
        long newTokens = (elapsed / refillPeriodMs) * capacity;
        if (newTokens > 0) {
            tokens         = Math.min(capacity, tokens + newTokens);
            lastRefillTime = now;
        }
    }
}
```

**Why this approach:** Token bucket allows burst traffic up to `capacity` while enforcing the long-term rate. `synchronized` keeps it thread-safe. For distributed systems, the same algorithm is implemented in Redis using a sorted set or Lua script.

---

### Task 57 — Circuit Breaker

**Difficulty:** Hard

**Problem:** Implement a circuit breaker with three states: `CLOSED` (normal), `OPEN` (failing — reject calls immediately), `HALF_OPEN` (probe — allow one call through). After `failureThreshold` failures, open. After `openDurationMs`, enter half-open. On success in half-open, close; on failure, re-open.

**Suggested Solution**
```java
public class CircuitBreaker {
    public enum State { CLOSED, OPEN, HALF_OPEN }

    private State state = State.CLOSED;
    private int   failureCount;
    private long  openedAt;

    private final int  failureThreshold;
    private final long openDurationMs;

    public CircuitBreaker(int failureThreshold, long openDurationMs) {
        this.failureThreshold = failureThreshold;
        this.openDurationMs   = openDurationMs;
    }

    public <T> T call(Supplier<T> action) {
        if (state == State.OPEN) {
            if (System.currentTimeMillis() - openedAt >= openDurationMs)
                state = State.HALF_OPEN;
            else
                throw new CircuitOpenException("Circuit is OPEN");
        }
        try {
            T result = action.get();
            onSuccess();
            return result;
        } catch (Exception e) {
            onFailure();
            throw e;
        }
    }

    private void onSuccess() {
        failureCount = 0;
        state = State.CLOSED;
    }

    private void onFailure() {
        failureCount++;
        if (failureCount >= failureThreshold || state == State.HALF_OPEN) {
            state    = State.OPEN;
            openedAt = System.currentTimeMillis();
        }
    }
}
```

**Why this approach:** State transitions mirror the standard circuit breaker pattern (Nygard). `HALF_OPEN` lets one probe through rather than immediately closing — this prevents a recovering service from being overwhelmed by a rush of requests.

---

### Task 58 — Observer: Stock Price Alerts

**Difficulty:** Easy

**Problem:** Implement an observable `Stock` that notifies registered `PriceObserver`s whenever its price changes. Observers can be added and removed at runtime.

**Suggested Solution**
```java
public interface PriceObserver {
    void onPriceChange(String symbol, double oldPrice, double newPrice);
}

public class Stock {
    private final String symbol;
    private double       price;
    private final List<PriceObserver> observers = new CopyOnWriteArrayList<>();

    public Stock(String symbol, double initialPrice) {
        this.symbol = symbol;
        this.price  = initialPrice;
    }

    public void addObserver(PriceObserver o)    { observers.add(o); }
    public void removeObserver(PriceObserver o) { observers.remove(o); }

    public void setPrice(double newPrice) {
        double old = this.price;
        this.price = newPrice;
        if (old != newPrice)
            observers.forEach(o -> o.onPriceChange(symbol, old, newPrice));
    }
}

// Usage
Stock apple = new Stock("AAPL", 180.0);
apple.addObserver((sym, old, curr) ->
    System.out.printf("%s: %.2f → %.2f%n", sym, old, curr));
apple.setPrice(185.50); // triggers notification
```

**Why this approach:** `CopyOnWriteArrayList` makes observer registration/removal safe during notification iteration (a common concurrency pitfall with plain `ArrayList`). Only notifying when price actually changes avoids spurious updates.

---

<RelatedTopics :topics="['/tasks/system-design', '/design-patterns/', '/tasks/spring-boot']" />

[→ Back to Tasks Overview](/tasks/)
