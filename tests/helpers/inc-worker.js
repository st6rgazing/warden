const store = require('../../src/store');
store.update('counter.json', { n: 0 }, (v) => ({ n: v.n + 1 }));
