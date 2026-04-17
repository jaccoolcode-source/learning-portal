---
title: Spring Boot Tasks
description: 6 Spring Boot mini-project tasks — REST API, transactions, caching, batch, scheduling, and resilience — with suggested implementations
---

# Spring Boot Tasks

Tasks 71–76. Each task is a self-contained Spring Boot feature to implement.

---

### Task 71 — REST API with Pagination, Filtering, and Validation

**Difficulty:** Medium

**Problem:** Build a `GET /products` endpoint that accepts `page`, `size`, `minPrice`, `maxPrice`, and `category` query parameters. Validate input, return a paginated response with metadata.

**Suggested Solution**
```java
@RestController
@RequestMapping("/products")
@Validated
public class ProductController {

    private final ProductService productService;

    @GetMapping
    public ResponseEntity<PageResponse<ProductDto>> list(
        @RequestParam(defaultValue = "0")  @Min(0)            int page,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100)  int size,
        @RequestParam(required = false)    @DecimalMin("0")   BigDecimal minPrice,
        @RequestParam(required = false)    @DecimalMin("0")   BigDecimal maxPrice,
        @RequestParam(required = false)                        String category
    ) {
        ProductFilter filter = ProductFilter.builder()
            .minPrice(minPrice).maxPrice(maxPrice).category(category).build();
        Page<ProductDto> result = productService.findAll(filter, PageRequest.of(page, size));
        return ResponseEntity.ok(PageResponse.from(result));
    }
}

public record PageResponse<T>(
    List<T> content,
    int page,
    int size,
    long totalElements,
    int totalPages,
    boolean last
) {
    public static <T> PageResponse<T> from(Page<T> p) {
        return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(),
            p.getTotalElements(), p.getTotalPages(), p.isLast());
    }
}
```

```java
// Repository with dynamic filtering
public interface ProductRepository extends JpaRepository<Product, Long> {

    @Query("SELECT p FROM Product p WHERE " +
           "(:minPrice IS NULL OR p.price >= :minPrice) AND " +
           "(:maxPrice IS NULL OR p.price <= :maxPrice) AND " +
           "(:category IS NULL OR p.category = :category)")
    Page<Product> findByFilter(
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        @Param("category") String category,
        Pageable pageable
    );
}
```

**Why this approach:** Bean Validation on controller parameters gives automatic 400 responses with descriptive error messages. Nullable JPQL parameters (`IS NULL OR ...`) avoid building query strings dynamically — safer and easier to read.

---

### Task 72 — Transactional Account Transfer

**Difficulty:** Medium

**Problem:** Implement a `transfer(fromId, toId, amount)` service method that debits one account and credits another atomically. Handle: insufficient funds, account not found, and concurrent transfers (no dirty reads).

**Suggested Solution**
```java
@Service
@Transactional
public class TransferService {

    private final AccountRepository repo;

    public void transfer(Long fromId, Long toId, BigDecimal amount) {
        // Lock both accounts in consistent ID order to prevent deadlocks
        Long lowId  = Math.min(fromId, toId);
        Long highId = Math.max(fromId, toId);

        Account low  = repo.findByIdWithLock(lowId)
            .orElseThrow(() -> new AccountNotFoundException(lowId));
        Account high = repo.findByIdWithLock(highId)
            .orElseThrow(() -> new AccountNotFoundException(highId));

        Account from = fromId.equals(lowId) ? low : high;
        Account to   = fromId.equals(lowId) ? high : low;

        if (from.getBalance().compareTo(amount) < 0)
            throw new InsufficientFundsException(fromId, amount);

        from.debit(amount);
        to.credit(amount);
        // Both saves happen at end of transaction (dirty checking)
    }
}

// Repository
public interface AccountRepository extends JpaRepository<Account, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Account a WHERE a.id = :id")
    Optional<Account> findByIdWithLock(@Param("id") Long id);
}
```

**Why this approach:** Pessimistic locking (`PESSIMISTIC_WRITE`) prevents concurrent transfers from reading a stale balance. Acquiring locks in ascending ID order eliminates deadlocks — the same fix as in Task 24, applied at the database level.

---

### Task 73 — Cache-Aside with Spring Cache and Redis

**Difficulty:** Easy

**Problem:** Add a read-through cache to a `ProductService.findById(id)` method. Cache entries should expire after 10 minutes. Invalidate the cache entry when the product is updated or deleted.

**Suggested Solution**
```java
@Service
@CacheConfig(cacheNames = "products")
public class ProductService {

    private final ProductRepository repo;

    @Cacheable(key = "#id")
    public ProductDto findById(Long id) {
        return repo.findById(id)
            .map(ProductDto::from)
            .orElseThrow(() -> new ProductNotFoundException(id));
    }

    @CacheEvict(key = "#request.id")
    @Transactional
    public ProductDto update(UpdateProductRequest request) {
        Product p = repo.findById(request.getId()).orElseThrow(...);
        p.update(request);
        return ProductDto.from(repo.save(p));
    }

    @CacheEvict(key = "#id")
    @Transactional
    public void delete(Long id) { repo.deleteById(id); }
}
```

```yaml
# application.yml
spring:
  cache:
    type: redis
  data:
    redis:
      host: localhost
      port: 6379

spring.cache.redis.time-to-live: 10m
```

```java
// Build configuration
@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    public RedisCacheConfiguration defaultCacheConfig() {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair.fromSerializer(
                    new GenericJackson2JsonRedisSerializer()));
    }
}
```

**Why this approach:** `@Cacheable`/`@CacheEvict` keep cache logic out of the service body. JSON serialisation (`GenericJackson2JsonRedisSerializer`) means cached objects can be inspected with `redis-cli` — invaluable for debugging.

---

### Task 74 — Batch Job: Import CSV to Database

**Difficulty:** Medium

**Problem:** Build a Spring Batch job that reads a large CSV file of products (potentially millions of rows), validates each row, and inserts valid rows into the database in chunks of 500. Log invalid rows to a separate error file.

**Suggested Solution**
```java
@Configuration
public class ProductImportJob {

    @Bean
    public Job importProducts(JobRepository jobRepo, Step step1) {
        return new JobBuilder("importProducts", jobRepo)
            .start(step1)
            .build();
    }

    @Bean
    public Step importStep(JobRepository jobRepo, PlatformTransactionManager tm,
                           FlatFileItemReader<ProductCsvRow> reader,
                           ProductItemProcessor processor,
                           JdbcBatchItemWriter<Product> writer) {
        return new StepBuilder("importStep", jobRepo)
            .<ProductCsvRow, Product>chunk(500, tm)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .faultTolerant()
            .skip(ValidationException.class).skipLimit(1000) // skip bad rows
            .listener(new SkipLoggingListener())
            .build();
    }

    @Bean
    public FlatFileItemReader<ProductCsvRow> reader(@Value("${import.file}") Resource file) {
        return new FlatFileItemReaderBuilder<ProductCsvRow>()
            .name("productReader")
            .resource(file)
            .linesToSkip(1)              // header row
            .delimited().delimiter(",")
            .names("sku", "name", "price", "category")
            .targetType(ProductCsvRow.class)
            .build();
    }

    @Bean
    public JdbcBatchItemWriter<Product> writer(DataSource ds) {
        return new JdbcBatchItemWriterBuilder<Product>()
            .sql("INSERT INTO products (sku, name, price, category) VALUES (:sku, :name, :price, :category)")
            .dataSource(ds)
            .beanMapped()
            .build();
    }
}

@Component
public class ProductItemProcessor implements ItemProcessor<ProductCsvRow, Product> {
    public Product process(ProductCsvRow row) {
        if (row.sku() == null || row.sku().isBlank()) throw new ValidationException("Blank SKU");
        if (row.price() == null || row.price().compareTo(BigDecimal.ZERO) <= 0)
            throw new ValidationException("Invalid price");
        return new Product(row.sku(), row.name(), row.price(), row.category());
    }
}
```

**Why this approach:** Spring Batch's chunk-oriented processing reads, transforms, and writes in batches of 500 — each chunk is a single transaction. `faultTolerant().skip()` lets the job continue past bad rows without failing the whole import.

---

### Task 75 — Scheduled Report Generation

**Difficulty:** Easy

**Problem:** Build a scheduled service that generates a daily sales report at 02:00, calculates the top-10 products sold in the last 24 hours, and sends it to a list of email addresses. Support dynamic enable/disable of scheduling.

**Suggested Solution**
```java
@Service
@Slf4j
public class SalesReportScheduler {

    private final OrderRepository    orderRepo;
    private final ReportEmailService emailService;

    @Scheduled(cron = "0 0 2 * * *", zone = "UTC")  // every day at 02:00 UTC
    @ConditionalOnProperty(name = "reports.daily.enabled", havingValue = "true", matchIfMissing = true)
    public void generateDailyReport() {
        log.info("Starting daily sales report generation");
        LocalDateTime since = LocalDateTime.now().minusHours(24);

        List<ProductSalesSummary> top10 = orderRepo.findTopSellingProducts(since, PageRequest.of(0, 10));

        if (top10.isEmpty()) {
            log.info("No sales in the last 24 hours — skipping report");
            return;
        }

        SalesReport report = SalesReport.builder()
            .generatedAt(LocalDateTime.now())
            .topProducts(top10)
            .build();

        emailService.sendDailyReport(report);
        log.info("Daily sales report sent with {} products", top10.size());
    }
}

// Enable/disable without restart:
// application.yml: reports.daily.enabled: false
```

```java
// Repository query
@Query("SELECT new com.example.ProductSalesSummary(oi.product.id, oi.product.name, SUM(oi.quantity)) " +
       "FROM OrderItem oi WHERE oi.order.createdAt >= :since " +
       "GROUP BY oi.product.id, oi.product.name ORDER BY SUM(oi.quantity) DESC")
List<ProductSalesSummary> findTopSellingProducts(@Param("since") LocalDateTime since, Pageable p);
```

**Why this approach:** `@Scheduled(cron = ...)` with `zone = "UTC"` avoids DST surprises. `@ConditionalOnProperty` allows disabling the scheduler via config without code changes. Constructor projection in JPQL avoids loading full entities for a read-only aggregation query.

---

### Task 76 — Retry and Fallback with Resilience4j

**Difficulty:** Medium

**Problem:** Add resilience to an external payment API call. Requirements: retry up to 3 times with exponential backoff on `HttpServerErrorException`; if all retries fail, call a fallback that queues the payment for async processing.

**Suggested Solution**

```yaml
# application.yml
resilience4j:
  retry:
    instances:
      paymentService:
        max-attempts: 3
        wait-duration: 500ms
        exponential-backoff-multiplier: 2.0
        retry-exceptions:
          - org.springframework.web.client.HttpServerErrorException
  circuitbreaker:
    instances:
      paymentService:
        sliding-window-size: 10
        failure-rate-threshold: 50
        wait-duration-in-open-state: 30s
```

```java
@Service
public class PaymentService {

    private final PaymentGatewayClient gateway;
    private final PaymentQueue          queue;

    @Retry(name = "paymentService", fallbackMethod = "queuePayment")
    @CircuitBreaker(name = "paymentService")
    public PaymentResult charge(PaymentRequest request) {
        return gateway.charge(request);
    }

    // Fallback: same signature + exception parameter
    public PaymentResult queuePayment(PaymentRequest request, Exception ex) {
        log.warn("Payment gateway unavailable after retries ({}), queuing: {}", 
            ex.getMessage(), request.getOrderId());
        queue.enqueue(request);
        return PaymentResult.queued(request.getOrderId());
    }
}
```

```java
// Test the retry behaviour
@SpringBootTest
class PaymentServiceTest {

    @MockBean PaymentGatewayClient gateway;

    @Autowired PaymentService paymentService;

    @Test
    void shouldRetryAndFallbackOnServerError() {
        when(gateway.charge(any()))
            .thenThrow(new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE))
            .thenThrow(new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE))
            .thenThrow(new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE));

        PaymentResult result = paymentService.charge(new PaymentRequest("o1", BigDecimal.TEN));

        assertThat(result.status()).isEqualTo(PaymentStatus.QUEUED);
        verify(gateway, times(3)).charge(any()); // retried 3 times before fallback
    }
}
```

**Why this approach:** Resilience4j annotations compose cleanly with Spring — `@Retry` wraps `@CircuitBreaker`. Config in `application.yml` keeps the business logic uncluttered and lets ops teams tune retry settings without redeploying. The fallback queues the payment so no money is lost during an outage.

---

<RelatedTopics :topics="['/tasks/system-design', '/spring/', '/tasks/data-processing']" />

[→ Back to Tasks Overview](/tasks/)
