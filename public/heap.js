class BinaryHeap {
    constructor(compare) {
        this.items = [];
        this.compare = compare;
    }

    size() {
        return this.items.length;
    }

    isEmpty() {
        return this.items.length === 0;
    }

    clear() {
        this.items.length = 0;
    }

    peek() {
        return this.items[0];
    }

    push(value) {
        this.items.push(value);
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        if (this.items.length === 0) return undefined;
        const top = this.items[0];
        const end = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = end;
            this.bubbleDown(0);
        }
        return top;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.compare(this.items[index], this.items[parent]) >= 0) break;
            [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
            index = parent;
        }
    }

    bubbleDown(index) {
        const len = this.items.length;
        while (true) {
            let best = index;
            const left = (index * 2) + 1;
            const right = left + 1;

            if (left < len && this.compare(this.items[left], this.items[best]) < 0) best = left;
            if (right < len && this.compare(this.items[right], this.items[best]) < 0) best = right;
            if (best === index) break;

            [this.items[index], this.items[best]] = [this.items[best], this.items[index]];
            index = best;
        }
    }
}

export class MinHeap extends BinaryHeap {
    constructor(compare = (a, b) => a - b) {
        super(compare);
    }
}

export class MaxHeap extends BinaryHeap {
    constructor(compare = (a, b) => a - b) {
        super((a, b) => compare(b, a));
    }
}
