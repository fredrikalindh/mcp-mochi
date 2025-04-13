#!/usr/bin/env node

import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Resource,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

dotenv.config();

/**
 * Custom error class for Mochi API errors
 *
 * Handles both array and object error responses from the API:
 * - Array: ["Error message 1", "Error message 2"]
 * - Object: { "field": "Error message" }
 */
class MochiError extends Error {
  errors: string[] | Record<string, string>;
  statusCode: number;

  constructor(errors: string[] | Record<string, string>, statusCode: number) {
    super(
      Array.isArray(errors)
        ? errors.join(", ")
        : Object.values(errors).join(", ")
    );
    this.errors = errors;
    this.statusCode = statusCode;
    this.name = "MochiError";
  }
}

// Zod schemas for request validation
const CreateCardFieldSchema = z.object({
  id: z.string(),
  value: z.string(),
});

const CreateCardRequestSchema = z.object({
  content: z.string().min(1),
  "deck-id": z.string().min(1),
  "template-id": z.string().optional(),
  "manual-tags": z.array(z.string()).optional(),
  fields: z.record(z.string(), CreateCardFieldSchema),
});

const ListDecksParamsSchema = z.object({
  bookmark: z.string().optional(),
});

const ListCardsParamsSchema = z.object({
  "deck-id": z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  bookmark: z.string().optional(),
});

const ListTemplatesParamsSchema = z.object({
  bookmark: z.string().optional(),
});

const TemplateFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  pos: z.string(),
  options: z
    .object({
      "multi-line?": z.boolean().optional(),
    })
    .optional(),
});

const TemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    content: z.string(),
    pos: z.string(),
    fields: z.record(z.string(), TemplateFieldSchema),
  })
  .strip();

const ListTemplatesResponseSchema = z
  .object({
    bookmark: z.string(),
    docs: z.array(TemplateSchema),
  })
  .strip();

type ListTemplatesParams = z.infer<typeof ListTemplatesParamsSchema>;
type ListTemplatesResponse = z.infer<typeof ListTemplatesResponseSchema>;
type ListCardsParams = z.infer<typeof ListCardsParamsSchema>;
type ListDecksParams = z.infer<typeof ListDecksParamsSchema>;
type CreateCardRequest = z.infer<typeof CreateCardRequestSchema>;

// Response Zod schemas
const CardSchema = z
  .object({
    id: z.string(),
    tags: z.array(z.string()),
    content: z.string(),
    name: z.string(),
    "deck-id": z.string(),
    fields: z.record(z.unknown()).optional(),
  })
  .strip();

const CreateCardResponseSchema = CardSchema.strip();

const ListCardsResponseSchema = z
  .object({
    bookmark: z.string(),
    docs: z.array(CardSchema),
  })
  .strip();

type CreateCardResponse = z.infer<typeof CreateCardResponseSchema>;
type ListDecksResponse = z.infer<typeof ListDecksResponseSchema>["docs"];
type ListCardsResponse = z.infer<typeof ListCardsResponseSchema>;

const DeckSchema = z
  .object({
    id: z.string(),
    sort: z.number(),
    name: z.string(),
    archived: z.boolean().optional(),
  })
  .strip();

const ListDecksResponseSchema = z
  .object({
    bookmark: z.string(),
    docs: z.array(DeckSchema),
  })
  .strip();

function getApiKey(): string {
  const apiKey = process.env.MOCHI_API_KEY;
  if (!apiKey) {
    console.error("MOCHI_API_KEY environment variable is not set");
    process.exit(1);
  }
  return apiKey;
}

const MOCHI_API_KEY = getApiKey();

export class MochiClient {
  private api: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.api = axios.create({
      baseURL: "https://app.mochi.cards/api/",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.token}:`).toString(
          "base64"
        )}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createCard(request: CreateCardRequest): Promise<CreateCardResponse> {
    const response = await this.api.post("/cards", request);
    return CreateCardResponseSchema.parse(response.data);
  }

  async listDecks(params?: ListDecksParams): Promise<ListDecksResponse> {
    const validatedParams = params
      ? ListDecksParamsSchema.parse(params)
      : undefined;
    const response = await this.api.get("/decks", { params: validatedParams });
    return ListDecksResponseSchema.parse(response.data).docs.filter(
      (deck) => !deck.archived
    );
  }

  async listCards(params?: ListCardsParams): Promise<ListCardsResponse> {
    const validatedParams = params
      ? ListCardsParamsSchema.parse(params)
      : undefined;
    const response = await this.api.get("/cards", { params: validatedParams });
    return ListCardsResponseSchema.parse(response.data);
  }

  async listTemplates(
    params?: ListTemplatesParams
  ): Promise<ListTemplatesResponse> {
    const validatedParams = params
      ? ListTemplatesParamsSchema.parse(params)
      : undefined;
    const response = await this.api.get("/templates", {
      params: validatedParams,
    });
    return ListTemplatesResponseSchema.parse(response.data);
  }
}

// Server setup
const server = new Server(
  {
    name: "mcp-server/mochi",
    version: "1.0.2",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_card",
      description: `Create a new flashcard.

## Parameters

### content (required)
The markdown content of the card. Separate front and back using a horizontal rule (---).

### fields (optional)
A map of field IDs (keyword) to field values. The field IDs should correspond to the fields defined on the template used by the card. Fields can be displayed within a template using the following syntax: << Field name >>.

## Example
{
  "content": "New card from API. ![](@media/foobar03.png)",
  "deck-id": "btmZUXWM",
  "template-id": "8BtaEAXe",
  "fields": {
    "name": {
      "id": "name",
      "value": "Hello,"
    },
    "JNEnw1e7": {
      "id": "JNEnw1e7",
      "value": "World!"
    },
  },
  "manual-tags": ["philosophy", "philosophy/aristotle"]
}`,
      inputSchema: zodToJsonSchema(CreateCardRequestSchema),
      // annotations: {
      //   // Optional hints about tool behavior
      //   title: "", // Human-readable title for the tool
      //   readOnlyHint: false, // If true, the tool does not modify its environment
      //   destructiveHint: false, // If true, the tool may perform destructive updates
      //   idempotentHint: false, // If true, repeated calls with same args have no additional effect
      //   openWorldHint: true, // If true, tool interacts with external entities
      // },
    },
    {
      name: "list_cards",
      description: "List cards in pages of 10 cards per page",
      inputSchema: zodToJsonSchema(ListCardsParamsSchema),
      // annotations: {
      //   title: "",
      //   readOnlyHint: true,
      //   destructiveHint: false,
      //   idempotentHint: true,
      //   openWorldHint: false,
      // },
    },
    {
      name: "list_decks",
      description: "List all decks",
      inputSchema: zodToJsonSchema(ListDecksParamsSchema),
      // annotations: {
      //   title: "",
      //   readOnlyHint: true,
      //   destructiveHint: false,
      //   idempotentHint: true,
      //   openWorldHint: false,
      // },
    },
    {
      name: "list_templates",
      description: `Templates can be used to create cards with pre-defined fields using the template_id field. 

Example response:
{
  "bookmark": "g1AAAABAeJzLYWBgYMpgSmHgKy5JLCrJTq2MT8lPzkzJBYpzVBn4JgaaVZiC5Dlg8igyWQAxwRHd",
  "docs": [
    {
      "id": "YDELNZSu",
      "name": "Simple flashcard",
      "content": "# << Front >>\n---\n<< Back >>",
      "pos": "s",
      "fields": {
        "name": {
          "id": "name",
          "name": "Front",
          "pos": "a"
        },
        "Ysrde7Lj": {
          "id": "Ysrde7Lj",
          "name": "Back",
          "pos": "m",
          "options": {
            "multi-line?": true
          }
        }
      }
    },
    ...
  ]
}
`,
      inputSchema: zodToJsonSchema(ListTemplatesParamsSchema),
      // annotations: {
      //   title: "",
      //   readOnlyHint: true,
      //   destructiveHint: false,
      //   idempotentHint: true,
      //   openWorldHint: false,
      // },
    },
  ],
}));

// Add resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const decks = await mochiClient.listDecks();

  return {
    resources: decks.map(
      (deck): Resource => ({
        uri: `mochi://decks/${deck.id}`,
        name: deck.name + ` (Deck ID: ${deck.id})`,
        description: `Deck ID: ${deck.id}`,
        mimeType: "application/json",
      })
    ),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const match = uri.match(/^mochi:\/\/decks\/(.+)$/);

  if (!match) {
    throw new Error("Invalid resource URI");
  }

  const deckId = match[1];
  const deck = await mochiClient.listCards({ "deck-id": deckId });

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          deck.docs.map((card) => ({
            id: card.id,
            name: card.name,
            content: card.content,
            fields: card.fields,
          })),
          null,
          2
        ),
      },
    ],
  };
});

// Create Mochi client
const mochiClient = new MochiClient(MOCHI_API_KEY);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "create_card": {
        const validatedArgs = CreateCardRequestSchema.parse(
          request.params.arguments
        );
        const response = await mochiClient.createCard(validatedArgs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: false,
        };
      }
      case "list_decks": {
        const validatedArgs = ListDecksParamsSchema.parse(
          request.params.arguments
        );
        const response = await mochiClient.listDecks(validatedArgs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: false,
        };
      }
      case "list_cards": {
        const validatedArgs = ListCardsParamsSchema.parse(
          request.params.arguments
        );
        const response = await mochiClient.listCards(validatedArgs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: false,
        };
      }
      case "list_templates": {
        const validatedArgs = ListTemplatesParamsSchema.parse(
          request.params.arguments
        );
        const response = await mochiClient.listTemplates(validatedArgs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: false,
        };
      }
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map((err) => {
        const path = err.path.join(".");
        const message =
          err.code === "invalid_type" && err.message.includes("Required")
            ? `Required field '${path}' is missing`
            : err.message;
        return `${path ? `${path}: ` : ""}${message}`;
      });
      return {
        content: [
          {
            type: "text",
            text: `Validation error:\n${formattedErrors.join("\n")}`,
          },
        ],
        isError: true,
      };
    }
    if (error instanceof MochiError) {
      return {
        content: [
          {
            type: "text",
            text: `Mochi API error (${error.statusCode}): ${error.message}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
