import assert from 'node:assert/strict';
import NameEngine from '../name-engine.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('extracts nested name objects from partial streamed JSON', () => {
  const chunk = '{"names":[{"name":"清越","score":94,"meaning":"清朗高远"},';
  const names = NameEngine.extractCompleteNameObjects(chunk);

  assert.equal(names.length, 1);
  assert.equal(names[0].name, '清越');
  assert.equal(names[0].score, 94);
});

test('keeps already emitted names out of progress batches', () => {
  const seen = new Set(['清越']);
  const names = [
    { name: '清越', score: 94 },
    { name: '知微', score: 91 },
  ];

  const fresh = NameEngine.takeFreshNames(names, seen);

  assert.deepEqual(fresh.map((item) => item.name), ['知微']);
  assert.equal(seen.has('知微'), true);
});

test('filters surname characters, discarded names, history, and duplicates', () => {
  const storage = {
    isDiscarded: (fullName) => fullName === '林知微',
    isInHistory: (fullName) => fullName === '林景和',
    isStrongSurname: (char) => char === '张',
    isInGivenNameHistory: (givenName) => givenName === '安澜',
  };
  const names = [
    { name: '知微', score: 91 },
    { name: '景和', score: 90 },
    { name: '林越', score: 93 },
    { name: '张远', score: 92 },
    { name: '安澜', score: 89 },
    { name: '清越', score: 94 },
    { name: '清越', score: 88 },
  ];

  const filtered = NameEngine.filterUniqueNames(names, {
    surname: '林',
    storage,
    limit: 12,
  });

  assert.deepEqual(filtered.map((item) => item.name), ['清越']);
});
