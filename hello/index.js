// 最小的 Worker：有人打開網址，就回一行字。
export default {
  async fetch() {
    return new Response('你好，這是我的第一個 Worker！', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
