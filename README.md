# Mochi MCP Server

This MCP server provides integration with the Mochi flashcard system, allowing you to manage your flashcards through the Model Context Protocol.

## Features

- Create, update, and delete flashcards
- List flashcards, decks, and templates

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure your Mochi API token:
   - Copy `.env.example` to `.env`
   - Replace `your_mochi_api_token_here` with your actual Mochi API token

3. Build the project:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

## Available Tools

### `mochi_create_card`
Create a new flashcard in Mochi.
- Parameters:
  - `content`: string (Markdown content of the card. Separate front and back using a horizontal rule `---`)
  - `deck-id`: string (ID of the deck to create the card in)
  - `template-id`: string (optional, template to use for the card)
  - `manual-tags`: string[] (optional, tags to add to the card)
  - `fields`: object (map of field IDs to field values, required if using a template)

### `mochi_update_card`
Update or delete an existing flashcard in Mochi. To delete, set `trashed` to true.
- Parameters:
  - `card-id`: string (ID of the card to update)
  - Any updatable card fields (see code for all options)
  - To delete: set `trashed?` to `'true'` (string)

### `mochi_list_cards`
List cards (paginated).
- Parameters:
  - `deck-id`: string (optional, filter by deck)
  - `limit`: number (optional, 1-100)
  - `bookmark`: string (optional, for pagination)

### `mochi_list_decks`
List all decks.
- Parameters:
  - `bookmark`: string (optional, for pagination)

### `mochi_list_templates`
List all templates.
- Parameters:
  - `bookmark`: string (optional, for pagination)

## Example Usage

Here's how to use the MCP server with the MCP Inspector:

1. Start the server:
   ```bash
   npm start
   ```

2. In another terminal, use the MCP Inspector to interact with the server:
   ```bash
   mcp-inspector
   ```

3. Create a new flashcard:
   ```json
   {
     "tool": "mochi_create_card",
     "params": {
       "content": "What is MCP?\n---\nModel Context Protocol - a protocol for providing context to LLMs",
       "deck-id": "<YOUR_DECK_ID>"
     }
   }
   ```

4. List all decks:
   ```json
   {
     "tool": "mochi_list_decks",
     "params": {}
   }
   ```

5. Delete a flashcard (set `trashed` to true via update):
   ```json
   {
     "tool": "mochi_update_card",
     "params": {
       "card-id": "<CARD_ID>",
       "trashed?": "true"
     }
   }
   ```

## Usage with Claude Desktop
To use this with Claude Desktop, add the following to your `claude_desktop_config.json`:

### NPX

```json
{
  "mcpServers": {
    "mochi": {
      "command": "npx",
      "args": [
        "-y",
        "@fredrika/mcp-mochi"
      ],
      "env": {
        "MOCHI_API_KEY": "<YOUR_TOKEN>"
      }
    }
  }
}
```
