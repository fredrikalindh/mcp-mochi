import axios, { AxiosInstance } from 'axios';

export interface Flashcard {
  id: string;
  name: string;
  content: string;
  tags: string[];
  'deck-id': string;
  fields: Record<string, unknown>;
  pos: string;
  references: unknown[];
  reviews: unknown[];
  'created-at': {
    date: string;
  };
}

export interface FlashcardInput {
  front: string;
  back: string;
  tags?: string[];
}

export interface ReviewResult {
  success: boolean;
  timeSpentMs: number;
}

export interface ListFlashcardsParams {
  'deck-id'?: string;
  limit?: number;
  bookmark?: string;
}

export interface ListFlashcardsResponse {
  bookmark: string;
  docs: Flashcard[];
}

export interface TemplateField {
  id: string;
  name: string;
  pos: string;
  options?: {
    'multi-line?'?: boolean;
  };
}

export interface Template {
  id: string;
  name: string;
  content: string;
  pos: string;
  fields: Record<string, TemplateField>;
}

export interface ListTemplatesResponse {
  bookmark: string;
  docs: Template[];
}

export interface ListTemplatesParams {
  bookmark?: string;
}

export class MochiClient {
  private api: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.api = axios.create({
      baseURL: 'https://app.mochi.cards/api/',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.token}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getFlashcards(params?: ListFlashcardsParams): Promise<ListFlashcardsResponse> {
    try {
      const response = await this.api.get('/cards', { params });
      console.log(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching flashcards:', error);
      throw error;
    }
  }

  async getFlashcard(id: string): Promise<Flashcard> {
    const response = await this.api.get(`/cards/${id}`);
    return response.data;
  }

  async createFlashcard(input: FlashcardInput): Promise<Flashcard> {
    const response = await this.api.post('/cards', input);
    return response.data;
  }

  async updateFlashcard(id: string, input: Partial<FlashcardInput>): Promise<Flashcard> {
    const response = await this.api.patch(`/cards/${id}`, input);
    return response.data;
  }

  async deleteFlashcard(id: string): Promise<void> {
    await this.api.delete(`/cards/${id}`);
  }

  async getDueFlashcards(): Promise<Flashcard[]> {
    const response = await this.api.get('/cards');
    return response.data;
  }

  async reviewFlashcard(id: string, result: ReviewResult): Promise<Flashcard> {
    const response = await this.api.post(`/cards/${id}/review`, result);
    return response.data;
  }

  async getStats(): Promise<{
    totalCards: number;
    dueCards: number;
    averageSuccessRate: number;
    cardsReviewedToday: number;
  }> {
    const response = await this.api.get('/v1/stats');
    return response.data;
  }

  async getTemplate(id: string): Promise<Template> {
    const response = await this.api.get(`/templates/${id}`);
    return response.data;
  }

  async listTemplates(params?: ListTemplatesParams): Promise<ListTemplatesResponse> {
    try {
      const response = await this.api.get('/templates', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }
  }
} 