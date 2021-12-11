import { handleRequest } from '../src/handler'
import makeServiceWorkerEnv from 'service-worker-mock'
import { makeCloudflareWorkerKVEnv } from 'cloudflare-worker-mock';

declare const global: any;
declare const SHAREABLE_URLS: any;
declare const CORS_ORIGIN: string;

describe('handle', () => {
  beforeEach(() => {
    Object.assign(global, makeServiceWorkerEnv({
      'CORS_ORIGIN': 'localhost',
    }));
    Object.assign(global, makeCloudflareWorkerKVEnv('SHAREABLE_URLS'));
    jest.resetModules();
  })

  test('index with GET should return method not allowed', async () => {
    const result = await handleRequest(new Request('/', { method: 'GET' }))
    expect(result.status).toEqual(405)
    const text = await result.json()
    expect(text).toStrictEqual({ "error": "Method not allowed." })
  })

  test('Created document should be accessible with GET', async () => {
    let calledWith: string = '';
    global.SHAREABLE_URLS.get = (key: string) => {
      calledWith = key;
    };
    await handleRequest(new Request('/d9208390-216d-4304-b00d-9b4a913ea087', {
      method: 'GET',
    }))
    expect(calledWith).toEqual('shareable_url:d9208390-216d-4304-b00d-9b4a913ea087')
  })

  test('index with POST should create a new shareable url', async () => {
    const result = await handleRequest(new Request('/', {
      method: 'POST',
      body: JSON.stringify({
        'key': 'd9208390-216d-4304-b00d-9b4a913ea087'
      })
    }))
    expect(result.status).toEqual(201)
    const text = await result.json()
    expect(text).toStrictEqual({ "created": true })
  })

  test('index with POST should accept only valid uuid v4 key', async () => {
    const result = await handleRequest(new Request('/', {
      method: 'POST',
      body: JSON.stringify({
        'key': 'not-a-uuid-v4-key'
      })
    }))
    expect(result.status).toEqual(400)
    const text = await result.json()
    expect(text).toStrictEqual({ "error": "Provide a valid uuid v4 key." })
  })
})
