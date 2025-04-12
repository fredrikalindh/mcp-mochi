#!/usr/bin/env node

import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";

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
  archived: z.boolean().optional(),
  "review-reverse": z.boolean().optional(),
  pos: z.string().optional(),
  "manual-tags": z.array(z.string()).optional(),
  fields: z.record(z.string(), CreateCardFieldSchema).optional(),
});

const ListDecksParamsSchema = z.object({
  bookmark: z.string().optional(),
});

const ListCardsParamsSchema = z.object({
  "deck-id": z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  bookmark: z.string().optional(),
});

type ListCardsParams = z.infer<typeof ListCardsParamsSchema>;
type ListDecksParams = z.infer<typeof ListDecksParamsSchema>;
type CreateCardRequest = z.infer<typeof CreateCardRequestSchema>;

// Response Zod schemas
const CreateCardResponseSchema = z
  .object({
    status: z.string(),
    error_message: z.string().optional(),
  })
  .strip();

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

const CardSchema = z
  .object({
    id: z.string(),
    tags: z.array(z.string()),
    content: z.string(),
    name: z.string(),
    "deck-id": z.string(),
    fields: z.record(z.unknown()),
    pos: z.string(),
    references: z.array(z.unknown()),
    reviews: z.array(z.unknown()),
    "created-at": z.object({
      date: z.string(),
    }),
  })
  .strip();

const ListCardsResponseSchema = z
  .object({
    bookmark: z.string(),
    docs: z.array(CardSchema),
  })
  .strip();

type CreateCardResponse = z.infer<typeof CreateCardResponseSchema>;
type ListDecksResponse = z.infer<typeof ListDecksResponseSchema>;
type ListCardsResponse = z.infer<typeof ListCardsResponseSchema>;

function getApiKey(): string {
  const apiKey = process.env.MOCHI_API_KEY;
  if (!apiKey) {
    console.error("MOCHI_API_KEY environment variable is not set");
    process.exit(1);
  }
  return apiKey;
}

const MOCHI_API_KEY = getApiKey();

// Tool definitions
const CREATE_CARD_TOOL: Tool = {
  name: "mochi_create_card",
  description: "Create a new flashcard",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The markdown content of the card. Separate front from back with `\n---\n`",
      },
      "deck-id": {
        type: "string",
        description: "The deck ID that the card belongs too.",
      },
    },
    required: ["content", "deck-id"],
  },
};

const LIST_CARDS_TOOL: Tool = {
  name: "mochi_list_cards",
  description: "List cards in pages of 10 cards per page",
  inputSchema: {
    type: "object",
    properties: {
      "deck-id": {
        type: "string",
        description: "Only return cards for the specified deck ID",
      },
      limit: {
        type: "number",
        description: "Number of cards to return per page (1-100, default 10)",
      },
      bookmark: {
        type: "string",
        description: "Cursor for pagination from a previous list request",
      },
    },
  },
};

const LIST_DECKS_TOOL: Tool = {
  name: "mochi_list_decks",
  description: "List all decks",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const MOCHI_TOOLS = [
  CREATE_CARD_TOOL,
  LIST_CARDS_TOOL,
  LIST_DECKS_TOOL,
] as const;

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
    return ListDecksResponseSchema.parse(response.data);
  }

  async listCards(params?: ListCardsParams): Promise<ListCardsResponse> {
    const validatedParams = params
      ? ListCardsParamsSchema.parse(params)
      : undefined;
    const response = await this.api.get("/cards", { params: validatedParams });
    return ListCardsResponseSchema.parse(response.data);
  }
}

// Server setup
const server = new Server(
  {
    name: "mcp-server/mochi",
    version: "0.1.0",
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
  tools: MOCHI_TOOLS,
}));

// Add resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const decks = await mochiClient.listDecks();

  return {
    resources: decks.docs.map(
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
      case "mochi_create_card": {
        const validatedArgs = CreateCardRequestSchema.parse(
          request.params.arguments
        );
        return mochiClient.createCard(validatedArgs);
      }
      case "mochi_list_decks": {
        const validatedArgs = ListDecksParamsSchema.parse(
          request.params.arguments
        );
        return mochiClient.listDecks(validatedArgs);
      }
      case "mochi_list_cards": {
        const validatedArgs = ListCardsParamsSchema.parse(
          request.params.arguments
        );
        return mochiClient.listCards(validatedArgs);
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
      return {
        content: [
          {
            type: "text",
            text: `Validation error: ${error.errors
              .map((e) => e.message)
              .join(", ")}`,
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
