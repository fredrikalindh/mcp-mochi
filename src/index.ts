import { FlashcardInput, MochiClient } from "./mochi-client.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create MCP server
const server = new McpServer({
  name: "Mochi Flashcards",
  version: "1.0.0"
},
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Please provide a Mochi Token as a command-line argument");
  process.exit(1);
}

const mochiToken = args[0];

// Create Mochi client
const mochiClient = new MochiClient(mochiToken);
// Tool to create a new flashcard
server.tool(
  "createFlashcard",
  {
    front: z.string(),
    back: z.string(),
    tags: z.array(z.string()).optional()
  },
  async ({ front, back, tags }) => {
    try {
      const input: FlashcardInput = { front, back, tags };
      const card = await mochiClient.createFlashcard(input);
      return {
        content: [{
          type: "text",
          text: `Created flashcard with ID: ${card.id}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating flashcard: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool to update an existing flashcard
server.tool(
  "updateFlashcard",
  {
    id: z.string(),
    front: z.string().optional(),
    back: z.string().optional(),
    tags: z.array(z.string()).optional()
  },
  async ({ id, ...updates }) => {
    try {
      const card = await mochiClient.updateFlashcard(id, updates);
      return {
        content: [{
          type: "text",
          text: `Updated flashcard ${card.id}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error updating flashcard: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool to delete a flashcard
server.tool(
  "deleteFlashcard",
  {
    id: z.string()
  },
  async ({ id }) => {
    try {
      await mochiClient.deleteFlashcard(id);
      return {
        content: [{
          type: "text",
          text: `Deleted flashcard ${id}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error deleting flashcard: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool to get flashcards due for review
server.tool(
  "listFlashcards",
  {},
  async () => {
    try {
      const cards = await mochiClient.getFlashcards();
      return {
        content: [{
          type: "text",
          text: `Due flashcards:\n${cards.docs.map(card => 
            `ID: ${card.id}\nFront: ${card.name}\nBack: ${card.content}\nTags: ${card.tags.join(", ")}\n---`
          ).join("\n")}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting due flashcards: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool to get study statistics
server.tool(
  "getStats",
  {},
  async () => {
    try {
      const stats = await mochiClient.getStats();
      return {
        content: [{
          type: "text",
          text: `Study Statistics:
Total Cards: ${stats.totalCards}
Due Cards: ${stats.dueCards}
Average Success Rate: ${stats.averageSuccessRate}%
Cards Reviewed Today: ${stats.cardsReviewedToday}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting statistics: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool to get a single template by ID
server.tool(
  "getTemplate",
  {
    id: z.string()
  },
  async ({ id }) => {
    try {
      const template = await mochiClient.getTemplate(id);
      return {
        content: [{
          type: "text",
          text: `Template ${template.id}:
Name: ${template.name}
Content: ${template.content}
Fields: ${Object.values(template.fields)
    .map(field => `\n  - ${field.name}${field.options?.['multi-line?'] ? ' (multi-line)' : ''}`)
    .join('')}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting template: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool to list all templates
server.tool(
  "listTemplates",
  {
    bookmark: z.string().optional()
  },
  async ({ bookmark }) => {
    try {
      const response = await mochiClient.listTemplates({ bookmark });
      return {
        content: [{
          type: "text",
          text: `Templates:${response.docs.map(template => `

Template ID: ${template.id}
Name: ${template.name}
Content: ${template.content}
Fields: ${Object.values(template.fields)
    .map(field => `\n  - ${field.name}${field.options?.['multi-line?'] ? ' (multi-line)' : ''}`)
    .join('')}`).join('\n---')}${
    response.bookmark ? `\n\nNext page bookmark: ${response.bookmark}` : ''
}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing templates: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport); 