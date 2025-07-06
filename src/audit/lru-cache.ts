/**
 * Node in the doubly-linked list for LRU tracking
 */
class LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null = null;
  next: LRUNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

/**
 * LRU (Least Recently Used) cache implementation
 * Provides O(1) access, insertion, and deletion
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, LRUNode<K, V>>;
  private head: LRUNode<K, V>;
  private tail: LRUNode<K, V>;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('LRU cache capacity must be positive');
    }
    
    this.capacity = capacity;
    this.cache = new Map();
    
    // Create dummy head and tail nodes for easier list manipulation
    this.head = new LRUNode<K, V>(null as any, null as any);
    this.tail = new LRUNode<K, V>(null as any, null as any);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get a value from the cache
   * @param key The key to look up
   * @returns The value if found, undefined otherwise
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }
    
    // Move to front (most recently used)
    this.removeNode(node);
    this.addToFront(node);
    
    return node.value;
  }

  /**
   * Add or update a value in the cache
   * @param key The key
   * @param value The value
   * @returns The evicted value if capacity was exceeded, undefined otherwise
   */
  set(key: K, value: V): V | undefined {
    let evictedValue: V | undefined;
    
    const existingNode = this.cache.get(key);
    if (existingNode) {
      // Update existing node
      existingNode.value = value;
      this.removeNode(existingNode);
      this.addToFront(existingNode);
    } else {
      // Add new node
      const newNode = new LRUNode(key, value);
      this.cache.set(key, newNode);
      this.addToFront(newNode);
      
      // Check capacity
      if (this.cache.size > this.capacity) {
        const lru = this.tail.prev!;
        evictedValue = lru.value;
        this.removeNode(lru);
        this.cache.delete(lru.key);
      }
    }
    
    return evictedValue;
  }

  /**
   * Remove a key from the cache
   * @param key The key to remove
   * @returns True if the key was found and removed, false otherwise
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }
    
    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Check if a key exists in the cache
   * @param key The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Get the current size of the cache
   * @returns The number of items in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get all keys in the cache, ordered from most to least recently used
   * @returns Array of keys
   */
  keys(): K[] {
    const keys: K[] = [];
    let current = this.head.next;
    while (current !== this.tail) {
      keys.push(current!.key);
      current = current!.next;
    }
    return keys;
  }

  /**
   * Get all values in the cache, ordered from most to least recently used
   * @returns Array of values
   */
  values(): V[] {
    const values: V[] = [];
    let current = this.head.next;
    while (current !== this.tail) {
      values.push(current!.value);
      current = current!.next;
    }
    return values;
  }

  /**
   * Get all entries in the cache, ordered from most to least recently used
   * @returns Array of [key, value] pairs
   */
  entries(): [K, V][] {
    const entries: [K, V][] = [];
    let current = this.head.next;
    while (current !== this.tail) {
      entries.push([current!.key, current!.value]);
      current = current!.next;
    }
    return entries;
  }

  /**
   * Remove a node from the linked list
   */
  private removeNode(node: LRUNode<K, V>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  /**
   * Add a node to the front of the linked list (most recently used)
   */
  private addToFront(node: LRUNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }
}