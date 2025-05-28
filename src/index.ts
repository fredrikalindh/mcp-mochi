#!/usr/bin/env node

import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
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
  id: z.string().describe("Unique identifier for the field"),
  value: z.string().describe("Value of the field"),
});

const CreateCardRequestSchema = z.object({
  content: z
    .string()
    .min(1)
    .describe(
      "Markdown content of the card. Separate front and back using a horizontal rule (---)"
    ),
  "deck-id": z.string().min(1).describe("ID of the deck to create the card in"),
  "template-id": z
    .string()
    .optional()
    .nullable()
    .default(null)
    .describe(
      "Optional template ID to use for the card. Defaults to null if not set."
    ),
  "manual-tags": z
    .array(z.string())
    .optional()
    .describe("Optional array of tags to add to the card"),
  fields: z
    .record(z.string(), CreateCardFieldSchema)
    .optional()
    .describe(
      "Map of field IDs to field values. Required only when using a template"
    ),
});

const UpdateCardRequestSchema = z.object({
  content: z
    .string()
    .optional()
    .describe("Updated markdown content of the card"),
  "deck-id": z
    .string()
    .optional()
    .describe("ID of the deck to move the card to"),
  "template-id": z
    .string()
    .optional()
    .describe("Template ID to use for the card"),
  "archived?": z.boolean().optional().describe("Whether the card is archived"),
  "trashed?": z.string().optional().describe("Whether the card is trashed"),
  fields: z
    .record(z.string(), CreateCardFieldSchema)
    .optional()
    .describe("Updated map of field IDs to field values"),
});

const ListDecksParamsSchema = z.object({
  bookmark: z
    .string()
    .optional()
    .describe("Pagination bookmark for fetching next page of results"),
});

const ListCardsParamsSchema = z.object({
  "deck-id": z.string().optional().describe("Get cards from deck ID"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of cards to return per page (1-100)"),
  bookmark: z
    .string()
    .optional()
    .describe("Pagination bookmark for fetching next page of results"),
});

const ListTemplatesParamsSchema = z.object({
  bookmark: z
    .string()
    .optional()
    .describe("Pagination bookmark for fetching next page of results"),
});

const TemplateFieldSchema = z.object({
  id: z.string().describe("Unique identifier for the template field"),
  name: z.string().describe("Display name of the field"),
  pos: z.string().describe("Position of the field in the template"),
  options: z
    .object({
      "multi-line?": z
        .boolean()
        .optional()
        .describe("Whether the field supports multiple lines of text"),
    })
    .optional()
    .describe("Additional options for the field"),
});

const TemplateSchema = z
  .object({
    id: z.string().describe("Unique identifier for the template"),
    name: z.string().describe("Display name of the template"),
    content: z.string().describe("Template content in markdown format"),
    pos: z.string().describe("Position of the template in the list"),
    fields: z
      .record(z.string(), TemplateFieldSchema)
      .describe("Map of field IDs to field definitions"),
  })
  .strip();

const ListTemplatesResponseSchema = z
  .object({
    bookmark: z.string().describe("Pagination bookmark for fetching next page"),
    docs: z.array(TemplateSchema).describe("Array of templates"),
  })
  .strip();

type ListTemplatesParams = z.infer<typeof ListTemplatesParamsSchema>;
type ListTemplatesResponse = z.infer<typeof ListTemplatesResponseSchema>;
type ListCardsParams = z.infer<typeof ListCardsParamsSchema>;
type ListDecksParams = z.infer<typeof ListDecksParamsSchema>;
type CreateCardRequest = z.infer<typeof CreateCardRequestSchema>;
type UpdateCardRequest = z.infer<typeof UpdateCardRequestSchema>;

// Response Zod schemas
const CardSchema = z
  .object({
    id: z.string().describe("Unique identifier for the card"),
    tags: z
      .array(z.string())
      .describe("Array of tags associated with the card"),
    content: z
      .string()
      .describe(
        'Markdown content of the card. Separate front and back of card with "---"'
      ),
    name: z.string().describe("Display name of the card"),
    "deck-id": z.string().describe("ID of the deck containing the card"),
    fields: z
      .record(z.unknown())
      .optional()
      .describe(
        "Map of field IDs to field values. Need to match the field IDs in the template"
      ),
  })
  .strip();

const CreateCardResponseSchema = CardSchema.strip();

const ListCardsResponseSchema = z
  .object({
    bookmark: z.string().describe("Pagination bookmark for fetching next page"),
    docs: z.array(CardSchema).describe("Array of cards"),
  })
  .strip();

type CreateCardResponse = z.infer<typeof CreateCardResponseSchema>;
type ListDecksResponse = z.infer<typeof ListDecksResponseSchema>["docs"];
type ListCardsResponse = z.infer<typeof ListCardsResponseSchema>;

const DeckSchema = z
  .object({
    id: z.string().describe("Unique identifier for the deck"),
    sort: z.number().describe("Sort order of the deck"),
    name: z.string().describe("Display name of the deck"),
    archived: z.boolean().optional().describe("Whether the deck is archived"),
  })
  .strip();

const ListDecksResponseSchema = z
  .object({
    bookmark: z.string().describe("Pagination bookmark for fetching next page"),
    docs: z.array(DeckSchema).describe("Array of decks"),
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

  async updateCard(
    cardId: string,
    request: UpdateCardRequest
  ): Promise<CreateCardResponse> {
    const response = await this.api.post(`/cards/${cardId}`, request);
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
    version: "1.0.3",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mochi_create_card",
      description: `Create a new flashcard in Mochi. Use this whenever I ask questions about something that is interesting to remember. E.g. if I ask "What is the capital of France?", you should create a new flashcard with the content "What is the capital of France?\n---\nParis".

## Parameters

### deck-id (required)
ALWAYS look up deck-id with the mochi_list_decks tool.

### content (required)
The markdown content of the card. Separate front and back using a horizontal rule (---).

### template-id (optional)
When using a template, the field ids MUST match the template ones. If not using a template, omit this field.

### fields (optional)
A map of field IDs (keyword) to field values. Only required when using a template. The field IDs must correspond to the fields defined on the template.

## Example without template
{
  "content": "What is the capital of France?\n---\nParis",
  "deck-id": "btmZUXWM"
}

## Example with template
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
    }
  }
}

## Properties of good flashcards:
- **focused:** A question or answer involving too much detail will dull your concentration and stimulate incomplete retrievals, leaving some bulbs unlit.
- **precise** about what they're asking for. Vague questions will elicit vague answers, which won't reliably light the bulbs you're targeting.
- **consistent** answers, lighting the same bulbs each time you perform the task.
- **tractable**: Write prompts which you can almost always answer correctly. This often means breaking the task down, or adding cues
- **effortful**: You shouldn't be able to trivially infer the answer.
`,
      inputSchema: zodToJsonSchema(CreateCardRequestSchema),
      annotations: {
        title: "Create flashcard on Mochi",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    {
      name: "mochi_update_card",
      description: `Update or delete an existing flashcard in Mochi. To delete set trashed to true.`,
      inputSchema: zodToJsonSchema(
        z.object({
          "card-id": z.string(),
          ...UpdateCardRequestSchema.shape,
        })
      ),
      annotations: {
        title: "Update flashcard on Mochi",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    {
      name: "mochi_list_cards",
      description: "List cards in pages of 10 cards per page",
      inputSchema: zodToJsonSchema(ListCardsParamsSchema),
      annotations: {
        title: "List flashcards on Mochi",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "mochi_list_decks",
      description: "List all decks",
      inputSchema: zodToJsonSchema(ListDecksParamsSchema),
      annotations: {
        title: "List decks on Mochi",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "mochi_list_templates",
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
}`,
      inputSchema: zodToJsonSchema(ListTemplatesParamsSchema),
      annotations: {
        title: "List templates on Mochi",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ],
}));

// Create Mochi client
const mochiClient = new MochiClient(MOCHI_API_KEY);

// Add resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: `mochi://decks`,
        name: "All Mochi Decks",
        description: `List of all decks in Mochi.`,
        mimeType: "application/json",
      },
      {
        uri: `mochi://templates`,
        name: "All Mochi Templates",
        description: `List of all templates in Mochi.`,
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  switch (uri) {
    case "mochi://decks": {
      const decks = await mochiClient.listDecks();

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              decks.map((deck) => ({
                id: deck.id,
                name: deck.name,
                archived: deck.archived,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
    case "mochi://templates": {
      const templates = await mochiClient.listTemplates();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(templates, null, 2),
          },
        ],
      };
    }
    default: {
      throw new Error("Invalid resource URI");
    }
  }
});

const CreateFlashcardPromptSchema = z.object({
  input: z
    .string()
    .describe("The information to base the flashcard on.")
    .optional(),
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "write-flashcard",
        description: "Write a flashcard based on user-provided information.",
        arguments: [
          {
            name: "input",
            description: "The information to base the flashcard on.",
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const params = CreateFlashcardPromptSchema.parse(request.params.arguments);
  const { input } = params;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create a flashcard using the info below while adhering to these principles: 
- Keep questions and answers atomic.
- Utilize cloze prompts when applicable, like "This is a text with {{hidden}} part. Then don't use '---' separator.".
- Focus on effective retrieval practice by being concise and clear.
- Make it just challenging enough to reinforce specific facts.
Input: ${input}
`,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "mochi_create_card": {
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
      case "mochi_update_card": {
        const { "card-id": cardId, ...updateArgs } = z
          .object({
            "card-id": z.string(),
            ...UpdateCardRequestSchema.shape,
          })
          .parse(request.params.arguments);
        const response = await mochiClient.updateCard(cardId, updateArgs);
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
      case "mochi_list_decks": {
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
      case "mochi_list_cards": {
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
      case "mochi_list_templates": {
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
