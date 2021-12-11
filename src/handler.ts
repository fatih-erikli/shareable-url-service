import { validate } from 'uuid';

declare const SHAREABLE_URLS: KVNamespace;

const HEADERS = {
  'content-type': 'text/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const createChecksum = (key: string, contentHash: string) => {
  return SHAREABLE_URLS.put(contentHash, key);
}

// todo: infer the Object type as ShareableURL
const createShareableURL = (key: string, payload: Object) => {
  return SHAREABLE_URLS.put(
    `shareable_url:${key}`,
    JSON.stringify({ key, ...payload})
  );
}

const updateShareableURL = (key: string, payload: Object) => {
  return SHAREABLE_URLS.put(
    `shareable_url:${key}`,
    JSON.stringify({
      key,
      ...payload,
      dateModification: (new Date()).toJSON()
    })
  );
}

const getShareableURL = async (key: string) => {
  let shareableUrl: any = await SHAREABLE_URLS.get(`shareable_url:${key}`, {'type': 'json'});
  if (shareableUrl) {
    shareableUrl = {
      ...shareableUrl,
      viewCount: await getViewCount(key),
    };
  }
  return shareableUrl;
}

const getViewCount = async (key: string) => {
  return SHAREABLE_URLS.get(`views:${key}`);
}

const incrementViewCount = async (key: string) => {
  const viewCount = await getViewCount(key);
  const viewCountIncremented: number = viewCount ? Number(viewCount) + 1 : 0;
  await SHAREABLE_URLS.put(`views:${key}`, String(viewCountIncremented));
  return viewCountIncremented;
}

const getContentByHash = (contentHash: string) => {
  return SHAREABLE_URLS.get(contentHash);
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  let response = {};
  let status = 200;
  switch (pathname) {
    case "/":
      if (request.method === 'GET') {
        response = {
          'error': 'Method not allowed.'
        }
        status = 405;
      } else if (request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          status = 400;
          response = {
            'error': 'Provied a valid JSON body.',
          };
        }
        if (body) {
          const { key, contentHash='', ...payload } = body as any;
          if (validate(key)) {
            const existingDocument = await getContentByHash(contentHash);
            if (existingDocument) {
              status = 400;
              response = {
                'error': `Document exists.`,
                'existing-document': existingDocument,
              };
            } else {
              await createShareableURL(key, {
                  ...payload,
                  contentHash,
                  dateCreation: (new Date()).toJSON(),
                });
                status = 201;
                response = {
                  'created': true,
                };
                await createChecksum(key, contentHash);
            }
          } else {
            status = 400;
            response = {
              'error': 'Provide a valid uuid v4 key.',
            };
          }
        }
      }
      break;
    case "/metadata":
      if (request.method === 'OPTIONS') {
        status = 200;
      } else if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          status = 400;
          response = {
            'error': 'Provide a valid JSON body.',
          };
        }
        if (body) {
          let {urlKeys} = body as any;
          if (Array.isArray(urlKeys) && urlKeys.every(validate)) {
            urlKeys = await Promise.all(urlKeys.map(getShareableURL))
            urlKeys = urlKeys.filter(Boolean)
            urlKeys = urlKeys.map(({
                key,
                contentHash,
                dateCreation,
                dateModification,
                viewCount
              }:{
                key: string;
                contentHash: string;
                dateCreation: string;
                dateModification: string;
                viewCount: number;
              }) => ({
                key,
                contentHash,
                dateCreation,
                dateModification,
                viewCount
              })
            )
            status = 200;
            response = {
              "urlKeys": urlKeys,
            };
          } else {
            status = 400;
            response = {
              'error': 'Provide an array with valid UUID link keys.',
            };
          }
        }
      } else {
        response = {
          'error': 'Method not allowed.'
        }
        status = 405;
      }
      break;
    default: {
      const key = pathname.slice(1);
      const document = await getShareableURL(key);

      if (request.method === 'OPTIONS') {
        status = 200;
      } else if (!document) {
        response = {
          'error': 'Document not found.'
        }
        status = 404;
      }
      else if (request.method === 'PUT') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          status = 400;
          response = {
            'error': 'Provide a valid JSON body.',
          };
        }

        if (body) {
          const document = await getShareableURL(key); // # refetch
          await updateShareableURL(key, body as Object);
          const viewCount = await getViewCount(key);
          response = { ...document as object, viewCount }; 
          status = 202;
        }
      } else if (request.method === 'GET') {
        const viewCount = await incrementViewCount(key);
        response = { ...document as object, viewCount }; 
        status = 200;
      } else {
        response = {
          'error': 'Method not allowed.'
        }
        status = 405;
      }
    }
  }

  return new Response(JSON.stringify(response), {
    status,
    headers: HEADERS,
  })
}
