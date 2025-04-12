# Mochi MCP Server

This MCP server provides integration with the Mochi flashcard system, allowing you to manage and review your flashcards through the Model Context Protocol.

## Features

- Create, update, and delete flashcards
- Get flashcards due for review
- Review flashcards and track progress
- View study statistics
- Tag-based organization

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

### `createFlashcard`
Create a new flashcard.
- Parameters:
  - `front`: string (front side content)
  - `back`: string (back side content)
  - `tags`: string[] (optional tags)

### `updateFlashcard`
Update an existing flashcard.
- Parameters:
  - `id`: string (flashcard ID)
  - `front`: string (optional)
  - `back`: string (optional)
  - `tags`: string[] (optional)

### `deleteFlashcard`
Delete a flashcard.
- Parameters:
  - `id`: string (flashcard ID)

### `getDueFlashcards`
Get a list of flashcards that are due for review.
- No parameters required

### `reviewFlashcard`
Submit a review for a flashcard.
- Parameters:
  - `id`: string (flashcard ID)
  - `success`: boolean (whether the review was successful)
  - `timeSpentMs`: number (time spent reviewing in milliseconds)

### `getStats`
Get study statistics.
- No parameters required

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
     "tool": "createFlashcard",
     "params": {
       "front": "What is MCP?",
       "back": "Model Context Protocol - a protocol for providing context to LLMs",
       "tags": ["tech", "protocols"]
     }
   }
   ```

4. Get flashcards due for review:
   ```json
   {
     "tool": "getDueFlashcards"
   }
   ```

## Development

To run in development mode with automatic reloading:
```bash
npm run dev
```

## License

MIT 