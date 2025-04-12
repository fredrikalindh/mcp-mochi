import axios, { AxiosError } from 'axios';

import { MochiClient } from './mochi-client.js';
import { config } from 'dotenv';

// Load environment variables
config();

const MOCHI_TOKEN = process.env.MOCHI_TOKEN;
if (!MOCHI_TOKEN) {
  throw new Error("MOCHI_TOKEN environment variable is required");
}

// After the check above, TypeScript knows MOCHI_TOKEN is defined
const token: string = MOCHI_TOKEN;

async function testMochiApi() {
  console.log("Testing Mochi API connection...");
  console.log("Using token:", token.slice(0, 5) + "..." + token.slice(-5));
  
  const client = new MochiClient(token);
  
  try {
    // Test getting stats (simplest operation)
    console.log("\nTesting getStats...");
    const stats = await client.getStats();
    console.log("Stats response:", stats);

    // Test getting flashcards
    console.log("\nTesting getFlashcards...");
    const cards = await client.getFlashcards();
    console.log("Flashcards response:", cards);

    // Test creating a flashcard
    console.log("\nTesting createFlashcard...");
    const newCard = await client.createFlashcard({
      front: "Test Front",
      back: "Test Back",
      tags: ["test"]
    });
    console.log("Created card:", newCard);

    // Test getting a specific flashcard
    console.log("\nTesting getFlashcard...");
    const card = await client.getFlashcard(newCard.id);
    console.log("Retrieved card:", card);

    // Test updating the flashcard
    console.log("\nTesting updateFlashcard...");
    const updatedCard = await client.updateFlashcard(newCard.id, {
      front: "Updated Front"
    });
    console.log("Updated card:", updatedCard);

    // Test deleting the flashcard
    console.log("\nTesting deleteFlashcard...");
    await client.deleteFlashcard(newCard.id);
    console.log("Card deleted successfully");

  } catch (error) {
    console.error("Error testing Mochi API:", error);
    
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        console.error("Response status:", axiosError.response.status);
        console.error("Response data:", axiosError.response.data);
        console.error("Response headers:", axiosError.response.headers);
        console.error("Request URL:", axiosError.config?.url);
        console.error("Request method:", axiosError.config?.method);
      } else if (axiosError.request) {
        console.error("No response received. Request details:", axiosError.request);
      } else {
        console.error("Error setting up request:", axiosError.message);
      }
    }
  }
}

// Run the test
testMochiApi().catch(console.error); 