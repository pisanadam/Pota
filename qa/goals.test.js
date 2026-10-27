const test = require('node:test');
const assert = require('node:assert/strict');
const { PotaGoals } = require('./load')('goals.js');
const basket = extra => ({ made: true, pointsBlocked: false, value: 2, streak: 1, swish: false, bank: false, hoop: 0, ...extra });

test('catalog ids are unique and every metric is known', () => {
  const ids = PotaGoals.catalog.map(goal => goal.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const goal of PotaGoals.catalog) {
    assert.ok(PotaGoals.metrics.includes(goal.metric), goal.id);
    assert.ok(Number.isSafeInteger(goal.target) && goal.target > 0, goal.id);
    assert.ok(Number.isSafeInteger(goal.reward) && goal.reward > 0, goal.id);
  }
});

test('first basket completes once and pays once', () => {
  const first = PotaGoals.record(null, basket());
  assert.deepEqual(first.newlyCompleted.map(goal => goal.id), ['first-basket']);
  assert.equal(first.reward, 10);
  const second = PotaGoals.record(first.state, basket());
  assert.equal(second.reward, 0);
  assert.equal(second.state.progress.baskets, 2);
});

test('one basket can complete several goals', () => {
  const r = PotaGoals.record(null, basket({ value: 3, swish: true, hoop: 1 }));
  assert.deepEqual(r.newlyCompleted.map(goal => goal.id).sort(), ['far-hoop', 'first-basket', 'swish-1', 'three-1']);
  assert.equal(r.reward, 10 + 20 + 20 + 30);
});

test('misses and blocked automatic repeats never advance goals', () => {
  assert.equal(PotaGoals.record(null, { made: false }).state.progress.baskets, 0);
  const blocked = PotaGoals.record(null, basket({ pointsBlocked: true, streak: 20 }));
  assert.equal(blocked.reward, 0);
  assert.equal(blocked.state.progress.baskets, 0);
  assert.equal(blocked.state.progress.bestStreak, 0);
});

test('streak goals use the best streak', () => {
  let state = null, reward = 0;
  for (let streak = 1; streak <= 10; streak++) { const r = PotaGoals.record(state, basket({ streak })); state = r.state; reward += r.reward; }
  for (const id of ['streak-3', 'streak-5', 'streak-10']) assert.ok(state.completed.includes(id), id);
  assert.ok(!state.completed.includes('streak-20'));
  assert.equal(reward, 10 + 15 + 40 + 150);
});

test('normalize drops unknown and malformed saved data', () => {
  const state = PotaGoals.normalize({ completed: ['first-basket', 'bogus', 'first-basket'], progress: { baskets: -4, threes: 2.5, banks: 3 } });
  assert.deepEqual(state.completed, ['first-basket']);
  assert.equal(state.progress.baskets, 0);
  assert.equal(state.progress.threes, 0);
  assert.equal(state.progress.banks, 3);
  assert.deepEqual(PotaGoals.normalize('junk'), PotaGoals.normalize(null));
});

test('summary caps progress at each target', () => {
  const summary = PotaGoals.summary({ completed: ['first-basket'], progress: { baskets: 40 } });
  const first = summary.find(goal => goal.id === 'first-basket'), next = summary.find(goal => goal.id === 'baskets-25');
  assert.equal(first.done, true);
  assert.equal(first.current, 1);
  assert.equal(next.current, 25);
  assert.equal(next.done, false);
});
