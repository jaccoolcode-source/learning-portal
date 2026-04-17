---
title: Data Processing Tasks
description: 5 data processing tasks — CSV importer, log analyser, large-file word count, JSON streaming, and file diff — with suggested Java solutions
---

# Data Processing Tasks

Tasks 77–81. These tasks focus on processing large volumes of data efficiently — minimal memory footprint, streaming, and parallel processing.

---

### Task 77 — Chunked Parallel CSV Importer

**Difficulty:** Medium

**Problem:** Import a CSV file that may contain millions of rows. Process it in chunks of 1,000 rows in parallel. Each row is validated; invalid rows are written to an error file with a line number and reason. Report the total valid/invalid counts at the end.

**Suggested Solution**
```java
public class CsvImporter {
    private static final int CHUNK_SIZE = 1000;

    public ImportResult importFile(Path csvPath, Path errorPath, RowProcessor processor) throws Exception {
        AtomicLong valid   = new AtomicLong();
        AtomicLong invalid = new AtomicLong();

        try (BufferedWriter errorWriter = Files.newBufferedWriter(errorPath);
             Stream<String> lines       = Files.lines(csvPath)) {

            List<String> buffer = new ArrayList<>(CHUNK_SIZE);
            AtomicLong lineNo  = new AtomicLong(1); // skip header at line 0
            ExecutorService pool = Executors.newFixedThreadPool(
                Runtime.getRuntime().availableProcessors());

            List<Future<?>> futures = new ArrayList<>();
            Iterator<String> it = lines.skip(1).iterator(); // skip header

            while (it.hasNext()) {
                buffer.add(it.next());
                if (buffer.size() == CHUNK_SIZE || !it.hasNext()) {
                    List<String> chunk = new ArrayList<>(buffer);
                    long startLine = lineNo.getAndAdd(chunk.size());
                    buffer.clear();

                    futures.add(pool.submit(() -> {
                        for (int i = 0; i < chunk.size(); i++) {
                            try {
                                processor.process(chunk.get(i));
                                valid.incrementAndGet();
                            } catch (ValidationException e) {
                                invalid.incrementAndGet();
                                synchronized (errorWriter) {
                                    errorWriter.write("Line " + (startLine + i) + ": " + e.getMessage());
                                    errorWriter.newLine();
                                }
                            }
                        }
                    }));
                }
            }

            for (Future<?> f : futures) f.get(); // wait for all chunks
            pool.shutdown();
        }

        return new ImportResult(valid.get(), invalid.get());
    }
}

public record ImportResult(long valid, long invalid) {}
```

**Why this approach:** `Files.lines()` returns a lazy stream — only one line is in memory at a time, not the whole file. Chunking into batches of 1,000 gives parallelism without spawning a thread per row. `AtomicLong` counters are lock-free for the happy path; the error file uses a `synchronized` block since writes are rare.

---

### Task 78 — Log File Analyser

**Difficulty:** Medium

**Problem:** Given an application log file where each line follows the pattern `TIMESTAMP LEVEL MESSAGE`, aggregate: total lines by level (INFO/WARN/ERROR), the top-5 most frequent error messages (exact match after stripping timestamps), and the error rate per hour.

**Example log line:**
```
2024-03-15T14:23:11.452Z ERROR NullPointerException in OrderService.create
```

**Suggested Solution**
```java
public class LogAnalyser {

    private static final Pattern LOG_PATTERN =
        Pattern.compile("(\\S+)\\s+(INFO|WARN|ERROR)\\s+(.+)");

    public AnalysisReport analyse(Path logFile) throws IOException {
        Map<String, Long>  levelCounts = new HashMap<>();
        Map<String, Long>  errorMsgs   = new HashMap<>();
        Map<String, Long>  errorsPerHr = new TreeMap<>(); // sorted by hour

        try (BufferedReader reader = Files.newBufferedReader(logFile)) {
            String line;
            while ((line = reader.readLine()) != null) {
                Matcher m = LOG_PATTERN.matcher(line);
                if (!m.matches()) continue;

                String timestamp = m.group(1);
                String level     = m.group(2);
                String message   = m.group(3);

                levelCounts.merge(level, 1L, Long::sum);

                if ("ERROR".equals(level)) {
                    errorMsgs.merge(message, 1L, Long::sum);
                    String hour = timestamp.substring(0, 13); // "2024-03-15T14"
                    errorsPerHr.merge(hour, 1L, Long::sum);
                }
            }
        }

        List<Map.Entry<String, Long>> top5 = errorMsgs.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(5)
            .collect(Collectors.toList());

        return new AnalysisReport(levelCounts, top5, errorsPerHr);
    }
}

public record AnalysisReport(
    Map<String, Long>             levelCounts,
    List<Map.Entry<String, Long>> top5Errors,
    Map<String, Long>             errorsPerHour
) {}
```

**Why this approach:** Line-by-line `BufferedReader` keeps memory constant regardless of file size. Pre-compiled `Pattern` avoids recompiling the regex on every line. Extracting the hour by substring index is faster than a full `DateTimeFormatter` parse when you only need the hourly bucket.

---

### Task 79 — Word Count on a File Too Large to Fit in Memory

**Difficulty:** Medium

**Problem:** Count word frequencies in a text file that is larger than available RAM (e.g., 50 GB). Return the top-10 words. You cannot load the entire file into memory.

**Approach: Streaming + External Sort (or chunk-based merge)**

**Solution A — Streaming HashMap (fits in memory if vocabulary is small)**
```java
public Map<String, Long> countWords(Path file) throws IOException {
    Map<String, Long> counts = new HashMap<>();
    try (BufferedReader reader = Files.newBufferedReader(file)) {
        String line;
        while ((line = reader.readLine()) != null) {
            for (String word : line.toLowerCase().split("\\W+")) {
                if (!word.isEmpty()) counts.merge(word, 1L, Long::sum);
            }
        }
    }
    // Map may still be large but vocabulary (unique words) is typically bounded
    return counts;
}
```

**Solution B — Chunk + Merge (truly bounded memory)**
```java
public List<Map.Entry<String, Long>> top10LargeFile(Path file, Path tempDir) throws IOException {
    // Step 1: Split into chunks of 100MB, sort each, write to temp files
    List<Path> sortedChunks = splitAndSort(file, tempDir, 100_000);

    // Step 2: K-way merge of sorted chunk files
    Map<String, Long> merged = kWayMerge(sortedChunks);

    // Step 3: Top-10
    return merged.entrySet().stream()
        .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
        .limit(10)
        .collect(Collectors.toList());
}

private List<Path> splitAndSort(Path file, Path tempDir, int chunkLines) throws IOException {
    List<Path> chunks = new ArrayList<>();
    List<String> buffer = new ArrayList<>(chunkLines);
    int chunkIdx = 0;

    try (Stream<String> lines = Files.lines(file)) {
        Iterator<String> it = lines.iterator();
        while (it.hasNext()) {
            buffer.add(it.next());
            if (buffer.size() >= chunkLines || !it.hasNext()) {
                Map<String, Long> counts = new HashMap<>();
                for (String ln : buffer)
                    for (String w : ln.toLowerCase().split("\\W+"))
                        if (!w.isEmpty()) counts.merge(w, 1L, Long::sum);
                buffer.clear();
                Path chunk = tempDir.resolve("chunk-" + chunkIdx++ + ".txt");
                try (BufferedWriter w = Files.newBufferedWriter(chunk)) {
                    counts.entrySet().stream()
                        .sorted(Map.Entry.comparingByKey())
                        .forEach(e -> { try { w.write(e.getKey() + "\t" + e.getValue()); w.newLine(); }
                                        catch (IOException ex) { throw new UncheckedIOException(ex); } });
                }
                chunks.add(chunk);
            }
        }
    }
    return chunks;
}
```

**Why this approach:** Solution A is simpler and sufficient in most real-world cases — even a 50 GB English text has fewer than 500,000 unique words, so the frequency map fits in ~50 MB. Solution B (external sort + k-way merge) handles adversarial inputs with unbounded vocabulary (e.g., log lines with UUIDs as "words").

---

### Task 80 — JSON Stream Processor

**Difficulty:** Medium

**Problem:** Process a JSON array file containing millions of order objects. For each order, compute the total revenue by category. The file is too large to load with `objectMapper.readValue(file, List.class)`.

**Example structure:**
```json
[
  {"id": "o1", "category": "electronics", "amount": 299.99},
  {"id": "o2", "category": "books",       "amount": 14.99},
  ...
]
```

**Suggested Solution**
```java
public Map<String, BigDecimal> revenueByCategory(Path file) throws IOException {
    Map<String, BigDecimal> revenue = new HashMap<>();
    ObjectMapper mapper = new ObjectMapper();

    try (JsonParser parser = mapper.getFactory().createParser(file.toFile())) {
        // Advance to start of array
        if (parser.nextToken() != JsonToken.START_ARRAY)
            throw new IllegalArgumentException("Expected JSON array");

        while (parser.nextToken() != JsonToken.END_ARRAY) {
            OrderLine order = mapper.readValue(parser, OrderLine.class);
            revenue.merge(
                order.category(),
                order.amount(),
                BigDecimal::add
            );
        }
    }
    return revenue;
}

public record OrderLine(String id, String category, BigDecimal amount) {}
```

**Why this approach:** Jackson's streaming API (`JsonParser`) reads tokens lazily — only the current object is in memory at any time. `mapper.readValue(parser, Class)` deserialises one object from the current stream position without buffering the entire array. This is the standard pattern for processing large JSON arrays.

---

### Task 81 — Diff Two Large Sorted Files

**Difficulty:** Medium

**Problem:** Given two large sorted text files (File A and File B), produce three outputs: lines only in A, lines only in B, and lines in both. Process without loading either file entirely into memory.

**Example:**
```
File A: apple, banana, cherry, date
File B: banana, cherry, elderberry, fig
→ Only in A: apple, date
→ Only in B: elderberry, fig
→ In both:   banana, cherry
```

**Suggested Solution**
```java
public record DiffResult(List<String> onlyInA, List<String> onlyInB, List<String> inBoth) {}

public DiffResult diff(Path fileA, Path fileB) throws IOException {
    List<String> onlyInA = new ArrayList<>();
    List<String> onlyInB = new ArrayList<>();
    List<String> inBoth  = new ArrayList<>();

    try (BufferedReader readerA = Files.newBufferedReader(fileA);
         BufferedReader readerB = Files.newBufferedReader(fileB)) {

        String lineA = readerA.readLine();
        String lineB = readerB.readLine();

        while (lineA != null && lineB != null) {
            int cmp = lineA.compareTo(lineB);
            if (cmp == 0) {
                inBoth.add(lineA);
                lineA = readerA.readLine();
                lineB = readerB.readLine();
            } else if (cmp < 0) {
                onlyInA.add(lineA);
                lineA = readerA.readLine();
            } else {
                onlyInB.add(lineB);
                lineB = readerB.readLine();
            }
        }

        // Drain remaining lines
        while (lineA != null) { onlyInA.add(lineA); lineA = readerA.readLine(); }
        while (lineB != null) { onlyInB.add(lineB); lineB = readerB.readLine(); }
    }

    return new DiffResult(onlyInA, onlyInB, inBoth);
}
```

**Why this approach:** This is the classic merge step from merge sort, adapted for comparison. Both files are read sequentially (O(n + m) time), and only two lines are in memory at any given point. The algorithm relies on the files being pre-sorted — if they aren't, sort them first with `Files.lines(path).sorted().forEach(writer::println)`.

---

<RelatedTopics :topics="['/tasks/java-core', '/tasks/spring-boot', '/modern-java/']" />

[→ Back to Tasks Overview](/tasks/)
