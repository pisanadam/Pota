const test = require('node:test');
const assert = require('node:assert/strict');
const { PotaRewards } = require('./load')('rewards.js');

test('base points and growing streak bonus', () => {
  let state = { streak: 0, best: 0 };
  const points = [];
  for (let i = 0; i < 4; i++) { const r = PotaRewards.calculate(state, 2, true); points.push(r.points); state = r; }
  assert.deepEqual(points, [2, 3, 4, 5]);
  assert.equal(PotaRewards.calculate({ streak: 0 }, 3, true).points, 3);
});

test('streak bonus is capped', () => {
  assert.equal(PotaRewards.MAX_STREAK_BONUS, 10);
  const r = PotaRewards.calculate({ streak: 49, best: 49 }, 2, true);
  assert.equal(r.streak, 50);
  assert.equal(r.bonus, 10);
  assert.equal(r.points, 12);
  let state = { streak: 0, best: 0 }, total = 0;
  for (let i = 0; i < 50; i++) { state = PotaRewards.calculate(state, 2, true); total += state.points; }
  assert.equal(total, 50 * 2 + 45 + 40 * 10); // 0+1+…+9, then +10 for the remaining 40
});

test('a miss resets the streak and multipliers stay limited to 2× and 3×', () => {
  const miss = PotaRewards.calculate({ streak: 7, best: 7 }, 3, false);
  assert.equal(miss.streak, 0);
  assert.equal(miss.best, 7);
  assert.equal(miss.points, 0);
  assert.equal(PotaRewards.calculate({ streak: 0 }, 2, true, 3).points, 6);
  assert.equal(PotaRewards.calculate({ streak: 0 }, 2, true, 5).points, 2);
});
