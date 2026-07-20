import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { createTest, createTestSchema } from './tools/create-test.js';
import { listTests, listTestsSchema } from './tools/list-tests.js';
import { readTest, readTestSchema } from './tools/read-test.js';
import { updateTest, updateTestSchema } from './tools/update-test.js';
import { deleteTest, deleteTestSchema } from './tools/delete-test.js';
import { runTests, runTestsSchema } from './tools/run-tests.js';
import { runUntilPass, runUntilPassSchema } from './tools/run-until-pass.js';
import { getStatus, getStatusSchema } from './tools/get-status.js';
import { pauseTests, pauseTestsSchema } from './tools/pause-tests.js';
import { setWebhook, setWebhookSchema } from './tools/set-webhook.js';
import { createCredential, createCredentialSchema } from './tools/create-credential.js';
import { listCredentials } from './tools/list-credentials.js';
import { deleteCredential, deleteCredentialSchema } from './tools/delete-credential.js';

const server = new Server(
  { name: 'tuxedo-qa', version: '2.0.0' },
  { capabilities: { tools: {} } },
);

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>) {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = value as z.ZodTypeAny;
    const isOptional =
      field instanceof z.ZodOptional || field instanceof z.ZodDefault;
    const inner = isOptional
      ? (field as z.ZodOptional<z.ZodTypeAny>).unwrap?.() ?? field
      : field;

    const description =
      (field as { description?: string }).description ?? undefined;

    if (inner instanceof z.ZodEnum) {
      properties[key] = { type: 'string', enum: inner.options, description };
    } else if (inner instanceof z.ZodBoolean) {
      properties[key] = { type: 'boolean', description };
    } else if (inner instanceof z.ZodNumber) {
      properties[key] = { type: 'integer', description };
    } else if (inner instanceof z.ZodRecord) {
      properties[key] = {
        type: 'object',
        additionalProperties: { type: 'string' },
        description,
      };
    } else if (inner instanceof z.ZodArray) {
      properties[key] = { type: 'array', items: { type: 'string' }, description };
    } else {
      properties[key] = { type: 'string', description };
    }

    if (!isOptional) required.push(key);
  }

  return { type: 'object', properties, required };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_test',
      description: 'Create a new Playwright test file. Generate the full test code and pass it here.',
      inputSchema: zodToJsonSchema(createTestSchema),
    },
    {
      name: 'list_tests',
      description: 'List all test files with their last known status. Supports filtering by status and limit.',
      inputSchema: zodToJsonSchema(listTestsSchema),
    },
    {
      name: 'read_test',
      description: 'Read the contents of a test file.',
      inputSchema: zodToJsonSchema(readTestSchema),
    },
    {
      name: 'update_test',
      description: 'Update a test — script, display name, description, schedule, or enabled state.',
      inputSchema: zodToJsonSchema(updateTestSchema),
    },
    {
      name: 'delete_test',
      description: 'Permanently delete a test and its history. Irreversible — prefer update_test with enabled: false to deactivate.',
      inputSchema: zodToJsonSchema(deleteTestSchema),
    },
    {
      name: 'run_tests',
      description: 'Run all tests or a specific test file. Respects pause state. Sends Discord notification if webhook is configured.',
      inputSchema: zodToJsonSchema(runTestsSchema),
    },
    {
      name: 'run_until_pass',
      description: 'Run a test repeatedly, applying automatic fixes on each failure, until it passes or max attempts is reached.',
      inputSchema: zodToJsonSchema(runUntilPassSchema),
    },
    {
      name: 'get_status',
      description: 'Get overall suite status, or per-test status with failure details and fix suggestion when test_name is provided.',
      inputSchema: zodToJsonSchema(getStatusSchema),
    },
    {
      name: 'pause_tests',
      description: 'Pause all tests for up to 60 minutes. Tests resume automatically. Use before deploys to avoid false alerts.',
      inputSchema: zodToJsonSchema(pauseTestsSchema),
    },
    {
      name: 'set_webhook',
      description: 'Configure the Discord webhook URL for test notifications.',
      inputSchema: zodToJsonSchema(setWebhookSchema),
    },
    {
      name: 'create_credential',
      description: 'Create or update a named credential set (e.g. admin, user_comum). Fields are key-value pairs like { email, password, token }.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Credential set name (e.g. "admin", "user_comum")' },
          fields: { type: 'object', description: 'Key-value pairs of credential fields', additionalProperties: { type: 'string' } },
        },
        required: ['name', 'fields'],
      },
    },
    {
      name: 'list_credentials',
      description: 'List all saved credential sets with masked values.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'delete_credential',
      description: 'Delete a named credential set.',
      inputSchema: zodToJsonSchema(deleteCredentialSchema),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result: string;

    switch (name) {
      case 'create_test': {
        const input = createTestSchema.parse(args);
        result = await createTest(input);
        break;
      }
      case 'list_tests': {
        const input = listTestsSchema.parse(args);
        const tests = listTests(input);
        if (tests.length === 0) {
          result = 'No tests found. Use create_test to add one.';
        } else {
          result = tests
            .map((t) => {
              const status = t.enabled ? t.last_status.toUpperCase() : 'DISABLED';
              const schedule = t.schedule ? ` [${t.schedule}]` : '';
              const ran = t.last_run_at ? ` (last run: ${t.last_run_at})` : '';
              const label = t.name ? `${t.name} (${t.file})` : t.file;
              const desc = t.description ? `\n    ${t.description}` : '';
              return `[${status}]${schedule} ${label}${ran}${desc}`;
            })
            .join('\n');
        }
        break;
      }
      case 'read_test': {
        const input = readTestSchema.parse(args);
        result = readTest(input);
        break;
      }
      case 'update_test': {
        const input = updateTestSchema.parse(args);
        result = updateTest(input);
        break;
      }
      case 'delete_test': {
        const input = deleteTestSchema.parse(args);
        result = deleteTest(input);
        break;
      }
      case 'run_tests': {
        const input = runTestsSchema.parse(args);
        result = await runTests(input);
        break;
      }
      case 'run_until_pass': {
        const input = runUntilPassSchema.parse(args);
        result = await runUntilPass(input);
        break;
      }
      case 'get_status': {
        const input = getStatusSchema.parse(args);
        result = getStatus(input);
        break;
      }
      case 'pause_tests': {
        const input = pauseTestsSchema.parse(args);
        result = pauseTests(input);
        break;
      }
      case 'set_webhook': {
        const input = setWebhookSchema.parse(args);
        result = setWebhook(input);
        break;
      }
      case 'create_credential': {
        const input = createCredentialSchema.parse(args);
        result = createCredential(input);
        break;
      }
      case 'list_credentials': {
        result = listCredentials();
        break;
      }
      case 'delete_credential': {
        const input = deleteCredentialSchema.parse(args);
        result = deleteCredential(input);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
