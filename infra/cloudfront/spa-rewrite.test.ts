import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A CloudFront Function is a script with a top-level handler, not a module,
// so it is loaded as text and evaluated.
const source = readFileSync(join(import.meta.dir, 'spa-rewrite.js'), 'utf8')
const handler = new Function(`${source}; return handler`)() as (event: {
  request: { uri: string; querystring: Record<string, unknown> }
}) => { uri: string; querystring: Record<string, unknown> }

const rewrite = (uri: string) => handler({ request: { uri, querystring: {} } }).uri

describe('spa-rewrite', () => {
  test.each([
    ['/'],
    ['/about'],
    ['/profile'],
    ['/create-item'],
    ['/edit-item/123'],
    ['/edit-item/123/'],
    ['/some.thing/page'],
  ])('%s is served by the app shell', (uri) => {
    expect(rewrite(uri)).toBe('/index.html')
  })

  test.each([
    ['/index.html'],
    ['/assets/index-abc123.js'],
    ['/assets/index-abc123.css'],
    ['/favicon.ico'],
    ['/nested/dir/file.min.js'],
  ])('%s is left alone', (uri) => {
    expect(rewrite(uri)).toBe(uri)
  })

  test('the query string is not touched', () => {
    const querystring = { tab: { value: 'x' } }
    const result = handler({ request: { uri: '/profile', querystring } })
    expect(result.uri).toBe('/index.html')
    expect(result.querystring).toBe(querystring)
  })

  test('the file is a script, not a module', () => {
    expect(source).not.toMatch(/^\s*(export|import)\s/m)
    expect(source).not.toContain('module.exports')
  })
})
