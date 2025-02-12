class Queue {
  constructor() {
    this.items = new Map(); // Use a Map for efficient lookup and deletion
  }

  enqueue(id) {
    this.items.set(id, Date.now()); // Store timestamp to track waiting time
  }

  dequeue() {
    if (this.isEmpty()) return null;
    const firstKey = this.front();
    this.items.delete(firstKey);
    return firstKey;
  }

  front() {
    return this.isEmpty() ? null : this.items.keys().next().value;
  }

  isEmpty() {
    return this.items.size === 0;
  }

  size() {
    return this.items.size;
  }

  remove(id) {
    this.items.delete(id);
  }

  print() {
    console.log([...this.items.keys()].join(" <- "));
  }
}

module.exports = Queue;
