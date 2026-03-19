/**
 * Fetch Motion projects dynamically from the API
 */

import { MotionClient } from './motionClient.js';

export type MotionProject = {
  id: string;
  name: string;
  description?: string;
  status?: string | { name?: string };
};

// In-memory cache for a single run
// Note: Cache is cleared on each process run, so filtering will be applied fresh
let cachedProjects: MotionProject[] | null = null;

/**
 * Fetch all projects from Motion API
 * Caches results in memory for the duration of the process
 */
export async function fetchMotionProjects(
  apiKey: string,
  workspaceId: string
): Promise<MotionProject[]> {
  // Return cached projects if available
  if (cachedProjects !== null) {
    return cachedProjects;
  }

  const client = new MotionClient(apiKey, workspaceId);
  const rawProjects = await client.getAllProjects();

  /**
   * Extract status name from various status formats
   */
  const getStatusName = (status: unknown): string | null => {
    if (!status) return null;
    if (typeof status === 'string') {
      return status.toLowerCase();
    }
    if (typeof status === 'object' && status !== null && 'name' in status) {
      const statusObj = status as { name?: unknown };
      if (typeof statusObj.name === 'string') {
        return statusObj.name.toLowerCase();
      }
    }
    return null;
  };

  /**
   * Check if a project should be excluded (completed or backlog)
   */
  const isExcludedStatus = (statusName: string | null): boolean => {
    if (!statusName) return false;
    const normalized = statusName.toLowerCase().trim();
    return normalized === 'completed' || 
           normalized === 'done' || 
           normalized === 'backlog' ||
           normalized === 'archived' ||
           normalized === 'cancelled' ||  // British spelling
           normalized === 'canceled' ||    // American spelling
           normalized === 'closed';
  };

  // Normalize project data and filter out excluded statuses
  const projects: MotionProject[] = rawProjects
    .map((project: unknown): MotionProject | null => {
      if (!project || typeof project !== 'object') {
        return null;
      }

      const p = project as Record<string, unknown>;
      const id = typeof p.id === 'string' ? p.id : null;
      const name = typeof p.name === 'string' 
        ? p.name 
        : (typeof p.title === 'string' ? p.title : null);

      if (!id || !name) {
        return null;
      }

      const status = p.status;
      const statusName = getStatusName(status);

      // Filter out completed, backlog, archived, or cancelled projects
      if (isExcludedStatus(statusName)) {
        // Debug: log excluded projects (can be removed later)
        if (process.env.DEBUG === 'true') {
          console.log(`   ⚠️  Excluding project "${name}" (status: ${statusName || 'unknown'})`);
        }
        return null;
      }

      const description = typeof p.description === 'string' ? p.description : undefined;
      const typedStatus: MotionProject['status'] =
        typeof status === 'string'
          ? status
          : (typeof status === 'object' && status !== null && 'name' in status
              ? (status as { name?: string })
              : undefined);

      return {
        id,
        name,
        status: typedStatus,
        ...(description ? { description } : {}),
      };
    })
    .filter((p): p is MotionProject => p !== null);

  // Cache for future calls in this process
  cachedProjects = projects;

  console.log(`📋 Filtered to ${projects.length} active project(s) (excluded completed/backlog/archived)`);

  return projects;
}

