import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMainContent, fetchUrlContent } from './url-content';

describe('extractMainContent', () => {
  it('strips nav/footer and keeps main text', () => {
    const html = `
      <html><head><title>Shoe Spec</title></head>
      <body>
        <nav>Home About</nav>
        <main>
          <h1>Air Runner</h1>
          <p>Weight: 1.2kg</p>
        </main>
        <footer>Copyright</footer>
      </body></html>`;
    const { text, title } = extractMainContent(html);
    assert.equal(title, 'Shoe Spec');
    assert.match(text, /Air Runner/);
    assert.match(text, /Weight: 1\.2kg/);
    assert.doesNotMatch(text, /Copyright/);
    assert.doesNotMatch(text, /Home About/);
  });
});

describe('fetchUrlContent', () => {
  it('uses injectable fetch and extracts HTML', async () => {
    const html = `<html><body><article><p>Name: Trail Cap</p></article></body></html>`;
    const fakeFetch = async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    const result = await fetchUrlContent('https://example.com/p', fakeFetch as any);
    assert.match(result.text, /Name: Trail Cap/);
  });

  it('rejects non-http protocols', async () => {
    await assert.rejects(() => fetchUrlContent('file:///etc/passwd'), /http/);
  });
});
