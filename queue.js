class Queue {
  constructor() {
    this.items = [];
  }

  enqueue(item) {
    // item should be an object containing socketId and timestamp
    this.items.push(item);
  }

  dequeue() {
    if (this.isEmpty()) return null;
    return this.items.shift();
  }

  peek() {
    if (this.isEmpty()) return null;
    return this.items[0];
  }

  isEmpty() {
    return this.items.length === 0;
  }

  size() {
    return this.items.length;
  }

  remove(predicate) {
    const index = this.items.findIndex(predicate);
    if (index !== -1) {
      return this.items.splice(index, 1)[0];
    }
    return null;
  }

  getWaitingTime(socketId) {
    const item = this.items.find((item) => item.socketId === socketId);
    if (item) {
      return Date.now() - item.timestamp;
    }
    return 0;
  }

  clear() {
    this.items = [];
  }

  getAll() {
    return [...this.items];
  }

  removeStale(maxWaitTime) {
    const currentTime = Date.now();
    this.items = this.items.filter(
      (item) => currentTime - item.timestamp <= maxWaitTime
    );
  }

  toString() {
    return this.items
      .map(
        (item) =>
          `${item.socketId}(${Math.floor(
            (Date.now() - item.timestamp) / 1000
          )}s)`
      )
      .join(" <- ");
  }

  // Find an item by socketId
  findBySocketId(socketId) {
    return this.items.find((item) => item.socketId === socketId);
  }

  // Get position in queue
  getPosition(socketId) {
    return this.items.findIndex((item) => item.socketId === socketId);
  }

  // Update an item's data
  updateItem(socketId, updateData) {
    const index = this.items.findIndex((item) => item.socketId === socketId);
    if (index !== -1) {
      this.items[index] = { ...this.items[index], ...updateData };
      return true;
    }
    return false;
  }
}

module.exports = Queue;
