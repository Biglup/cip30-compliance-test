import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as C from '@biglup/cometa';

test('mismatched Dijkstra markup does not prevent app initialization or existing wallet tests', async () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Cometa = C;
    window.cardano = { fixture: { name: 'Fixture wallet', apiVersion: '1', enable: async () => ({}) } };
    // Simulate an old HTML document that lacks a control required by the current script.
    document.getElementById('dijkstra-deposit-build').remove();
    await C.ready();
    const entry = document.querySelector('script[type="module"]').getAttribute('src');
    assert.ok(new URL(entry, 'http://localhost/').searchParams.has('v'));
    await import(new URL(`../${entry}`, import.meta.url));
    await new Promise(resolve => setTimeout(resolve, 20));
    const log = document.getElementById('log-output');
    assert.match(log.textContent, /Hard-refresh/);
    assert.match(log.textContent, /Cometa.js ready/);
    assert.ok([...document.querySelectorAll('#dijkstra-section button')].every(button => button.disabled));
    document.getElementById('test-getNetworkId').click();
    assert.match(log.textContent, /Please connect a wallet first/);
    document.getElementById('disconnect-btn').click();
    assert.match(log.textContent, /Wallet disconnected/);
});
