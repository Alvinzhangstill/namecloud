import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = {
  Blob,
  CONFIG: {
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_API_URL: 'https://example.test/chat',
    DEEPSEEK_MODEL: 'deepseek-chat',
    NAMES_COUNT: 3,
  },
  console,
  Response,
  ReadableStream,
  Storage: {
    addToGivenNameHistory(names) {
      this.givenHistory.push(...names);
    },
    addToHistory(names) {
      this.history.push(...names);
    },
    discarded: { names: [], styles: [] },
    getCommonSurnames() {
      return new Set(['张', '王', '李']);
    },
    getDiscarded() {
      return this.discarded;
    },
    getGivenNameHistory() {
      return this.givenHistory;
    },
    getHistory() {
      return this.history;
    },
    givenHistory: [],
    history: [],
    isDiscarded() {
      return false;
    },
    isInGivenNameHistory() {
      return false;
    },
    isInHistory() {
      return false;
    },
    isStrongSurname() {
      return false;
    },
  },
  TextDecoder,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

function runScript(path) {
  vm.runInNewContext(readFileSync(path, 'utf8'), sandbox, { filename: path });
}

runScript('name-engine.js');
runScript('ai.js');

const names = [
  { name: '清越', charAnalysis: '清：清朗；越：超越', meaning: '清朗高远', gender: '通用', style: '清新', poem: '出自《楚辞》', score: 94 },
  { name: '知微', charAnalysis: '知：知晓；微：细微', meaning: '见微知著', gender: '女孩', style: '文雅', poem: '出自《易传》', score: 91 },
  { name: '景和', charAnalysis: '景：光景；和：温和', meaning: '景明和畅', gender: '男孩', style: '大气', poem: '出自《岳阳楼记》', score: 89 },
];

function encodeChunk(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

sandbox.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  assert.equal(body.stream, true);

  const chunks = [
    encodeChunk('{"names":['),
    encodeChunk(`${JSON.stringify(names[0])},`),
    encodeChunk(`${JSON.stringify(names[1])},`),
    encodeChunk(`${JSON.stringify(names[2])}]}`),
    'data: [DONE]\n\n',
  ];

  return new Response(new Blob(chunks, { type: 'text/event-stream' }), { status: 200 });
};

const progress = [];
const finalNames = await sandbox.AI.generateNames('', '通用', {
  onProgress(newNames, count) {
    progress.push({ count, names: newNames.map((item) => item.name) });
  },
});

const plain = (value) => JSON.parse(JSON.stringify(value));

assert.deepEqual(plain(finalNames.map((item) => item.name)), ['清越', '知微', '景和']);
assert.deepEqual(plain(progress), [
  { count: 1, names: ['清越'] },
  { count: 2, names: ['知微'] },
  { count: 3, names: ['景和'] },
]);
assert.deepEqual(plain(sandbox.Storage.history), ['清越', '知微', '景和']);
assert.deepEqual(plain(sandbox.Storage.givenHistory), ['清越', '知微', '景和']);

console.log('ok - streams names through progress callbacks');
