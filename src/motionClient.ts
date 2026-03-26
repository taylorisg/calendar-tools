/**
 * Shared Motion API client for TypeScript modules
 */

const CONFIG = {
  API_BASE_URL: 'https://api.usemotion.com/v1',
  RATE_LIMIT: 12, // requests per minute
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute in milliseconds
};

// Rate limiting class
class RateLimiter {
  private requests: number[] = [];

  constructor(private requestsPerMinute: number) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - CONFIG.RATE_LIMIT_WINDOW;
    
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => time > oneMinuteAgo);
    
    if (this.requests.length >= this.requestsPerMinute) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = CONFIG.RATE_LIMIT_WINDOW - (now - oldestRequest) + 1000; // Add 1 second buffer
      console.log(`⏳ Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot(); // Recursive call after waiting
    }
    
    this.requests.push(now);
  }
}

export interface MotionTaskInput {
  name: string;
  workspaceId: string;
  projectId: string;
  description?: string;
  dueDate?: string;
  duration?: number;
  priority?: string;
  labels?: string[];
  assigneeId?: string;
  autoScheduled?: {
    startDate?: string;
    deadlineType?: string;
    schedule?: string;
  };
}

export interface MotionTaskResponse {
  id: string;
  name: string;
  [key: string]: unknown;
}

export class MotionClient {
  private apiKey: string;
  private workspaceId: string;
  private rateLimiter: RateLimiter;

  constructor(apiKey: string, workspaceId: string) {
    this.apiKey = apiKey;
    this.workspaceId = workspaceId;
    this.rateLimiter = new RateLimiter(CONFIG.RATE_LIMIT);
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body: unknown = null
  ): Promise<T> {
    await this.rateLimiter.waitForSlot();
    
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ API request failed: ${errorMessage}`);
      throw error;
    }
  }

  async createTask(taskData: MotionTaskInput): Promise<MotionTaskResponse> {
    const body: MotionTaskInput = {
      name: taskData.name,
      workspaceId: this.workspaceId,
      projectId: taskData.projectId,
      ...(taskData.description && { description: taskData.description }),
      ...(taskData.dueDate && { dueDate: taskData.dueDate }),
      ...(taskData.duration && { duration: taskData.duration }),
      ...(taskData.priority && { priority: taskData.priority }),
      ...(taskData.labels && taskData.labels.length > 0 && { labels: taskData.labels }),
      ...(taskData.assigneeId && { assigneeId: taskData.assigneeId }),
      ...(taskData.autoScheduled && { autoScheduled: taskData.autoScheduled }),
    };

    return await this.makeRequest<MotionTaskResponse>('/tasks', 'POST', body);
  }

  async getAllProjects(): Promise<unknown[]> {
    const data = await this.makeRequest<unknown>(
      `/projects?workspaceId=${this.workspaceId}`,
      'GET'
    );

    // Handle different possible response formats
    if (Array.isArray(data)) {
      return data;
    } else if (data && typeof data === 'object' && 'projects' in data && Array.isArray(data.projects)) {
      return data.projects;
    } else if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
      return data.data;
    }

    return [];
  }

  async getTasksByProject(projectId: string): Promise<Array<{ id: string; name: string }>> {
    const data = await this.makeRequest<unknown>(
      `/tasks?workspaceId=${this.workspaceId}&projectId=${projectId}`,
      'GET'
    );

    const raw: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && 'tasks' in data && Array.isArray((data as { tasks: unknown[] }).tasks)
        ? (data as { tasks: unknown[] }).tasks
        : [];

    return raw
      .filter((t): t is { id: string; name: string } =>
        typeof t === 'object' && t !== null && 'id' in t && 'name' in t
      );
  }
}

