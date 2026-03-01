import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from '@/trpc/router';

const buildScalarHtml = (openApiUrl: string): string => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>S3 Manager API Docs</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${openApiUrl}"
      data-theme="default"
      data-layout="modern"
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
    ></script>
  </body>
</html>`;
};

export const getOpenApiDocument = (baseUrl: string): Record<string, unknown> => {
  const document = generateOpenApiDocument(appRouter, {
    title: 'S3 Manager API',
    description: 'Automated API docs generated from tRPC routers and schemas',
    version: '2.0.0',
    baseUrl,
    tags: ['health', 'auth', 's3'],
  });

  const mutableDocument = document as unknown as {
    components?: {
      securitySchemes?: Record<string, unknown>;
      [key: string]: unknown;
    };
    paths?: Record<string, unknown>;
    [key: string]: unknown;
  };

  mutableDocument.components = {
    ...(document.components ?? {}),
    securitySchemes: {
      ...(document.components?.securitySchemes ?? {}),
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 's3_access_token',
      },
    },
  };

  mutableDocument.paths = {
    ...(document.paths ?? {}),
    '/health': {
      get: {
        summary: 'HTTP liveness endpoint',
        tags: ['health'],
        responses: {
          '200': {
            description: 'Service healthy',
          },
        },
      },
    },
    '/health/ready': {
      get: {
        summary: 'HTTP readiness endpoint',
        tags: ['health'],
        responses: {
          '200': {
            description: 'Service ready',
          },
        },
      },
    },
    '/auth/login': {
      get: {
        summary: 'Start OIDC login flow',
        tags: ['auth'],
        parameters: [
          {
            in: 'query',
            name: 'returnTo',
            schema: { type: 'string' },
            required: false,
          },
        ],
        responses: {
          '302': { description: 'Redirect to OIDC provider' },
        },
      },
    },
    '/auth/callback': {
      get: {
        summary: 'OIDC callback endpoint',
        tags: ['auth'],
        responses: {
          '302': { description: 'Authenticated and redirected' },
          '400': { description: 'Invalid callback input' },
        },
      },
    },
    '/auth/logout': {
      get: {
        summary: 'Logout and clear auth cookies',
        tags: ['auth'],
        responses: {
          '302': { description: 'Redirect after logout' },
        },
      },
    },
    '/auth/user': {
      get: {
        summary: 'Current user via HTTP auth context',
        tags: ['auth'],
        responses: {
          '200': { description: 'Authenticated user' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Refresh auth session',
        tags: ['auth'],
        responses: {
          '200': { description: 'Session refreshed' },
          '401': { description: 'Refresh failed' },
        },
      },
    },
    '/auth/pim/elevate': {
      post: {
        summary: 'Request elevation (legacy alias)',
        tags: ['auth'],
        responses: {
          '200': { description: 'Elevation request submitted' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/auth/elevation/entitlements': {
      get: {
        summary: 'List available elevation entitlements',
        tags: ['auth'],
        responses: {
          '200': { description: 'Elevation entitlements' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/auth/elevation/request': {
      post: {
        summary: 'Request temporary elevated access',
        tags: ['auth'],
        responses: {
          '200': { description: 'Elevation request submitted' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Request not permitted' },
        },
      },
    },
    '/auth/elevation/status/{requestId}': {
      get: {
        summary: 'Get elevation request status',
        tags: ['auth'],
        responses: {
          '200': { description: 'Elevation request status' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Not allowed' },
          '404': { description: 'Request not found' },
        },
      },
    },
    '/s3/upload/presigned': {
      post: {
        summary: 'Create presigned upload URL',
        tags: ['s3'],
        responses: {
          '200': { description: 'Presigned upload URL generated' },
        },
      },
    },
    '/s3/upload/multipart/initiate': {
      post: {
        summary: 'Initiate multipart upload',
        tags: ['s3'],
        responses: {
          '200': { description: 'Multipart upload initiated' },
        },
      },
    },
    '/s3/upload/multipart/complete': {
      post: {
        summary: 'Complete multipart upload',
        tags: ['s3'],
        responses: {
          '200': { description: 'Multipart upload completed' },
        },
      },
    },
    '/s3/items': {
      delete: {
        summary: 'Delete multiple files/folders',
        tags: ['s3'],
        responses: {
          '200': { description: 'Batch delete result' },
        },
      },
    },
  };

  return mutableDocument;
};

export const getScalarHtml = (baseUrl: string): string => {
  return buildScalarHtml(`${baseUrl}/openapi.json`);
};
