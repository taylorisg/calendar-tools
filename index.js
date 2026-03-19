#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  API_BASE_URL: 'https://api.usemotion.com/v1',
  RATE_LIMIT: 12, // requests per minute
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute in milliseconds
  RETRY_DELAY: 5000, // 5 seconds
  MAX_RETRIES: 3
};

// Rate limiting class
class RateLimiter {
  constructor(requestsPerMinute) {
    this.requestsPerMinute = requestsPerMinute;
    this.requests = [];
  }

  async waitForSlot() {
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

// API client class
class MotionAPI {
  constructor(apiKey, workspaceId) {
    this.apiKey = apiKey;
    this.workspaceId = workspaceId;
    this.rateLimiter = new RateLimiter(CONFIG.RATE_LIMIT);
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    await this.rateLimiter.waitForSlot();
    
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log(`🔄 Making ${method} request to ${endpoint}`);
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`❌ API request failed: ${error.message}`);
      throw error;
    }
  }

  async createProject(projectData) {
    const body = {
      name: projectData.name,
      workspaceId: this.workspaceId,
      ...(projectData.description && { description: projectData.description }),
      ...(projectData.dueDate && { dueDate: projectData.dueDate }),
      ...(projectData.priority && { priority: projectData.priority }),
      ...(projectData.labels && projectData.labels.length > 0 && { labels: projectData.labels })
    };

    return await this.makeRequest('/projects', 'POST', body);
  }

  async createTask(taskData, projectId) {
    const body = {
      name: taskData.name,
      workspaceId: this.workspaceId,
      projectId: projectId,
      ...(taskData.description && { description: taskData.description }),
      ...(taskData.dueDate && { dueDate: taskData.dueDate }),
      ...(taskData.duration && { duration: taskData.duration }),
      ...(taskData.priority && { priority: taskData.priority }),
      ...(taskData.labels && taskData.labels.length > 0 && { labels: taskData.labels }),
      ...(taskData.assigneeId && { assigneeId: taskData.assigneeId }),
      ...(taskData.autoScheduled && { autoScheduled: taskData.autoScheduled })
    };

    return await this.makeRequest('/tasks', 'POST', body);
  }

  async getProject(projectId) {
    return await this.makeRequest(`/projects/${projectId}`, 'GET');
  }

  async getAllProjects() {
    const data = await this.makeRequest(`/projects?workspaceId=${this.workspaceId}`, 'GET');
    
    // Handle different possible response formats
    if (Array.isArray(data)) {
      return data;
    } else if (data.projects && Array.isArray(data.projects)) {
      return data.projects;
    } else if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    
    return [];
  }
}

// Utility functions
function loadEnvironmentVariables() {
  try {
    const envContent = readFileSync(join(__dirname, '.env'), 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('❌ Error loading .env file:', error.message);
    console.log('💡 Make sure you have a .env file with MOTION_API_KEY and MOTION_WORKSPACE_ID');
    process.exit(1);
  }
}

function loadTasksData() {
  try {
    const tasksPath = join(__dirname, 'tasks.json');
    const tasksContent = readFileSync(tasksPath, 'utf8');
    return JSON.parse(tasksContent);
  } catch (error) {
    console.error('❌ Error loading tasks.json:', error.message);
    console.log('💡 Make sure you have a tasks.json file with your project and task data');
    process.exit(1);
  }
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Project matching functions
function calculateMatchScore(topic, projectName) {
  const topicLower = topic.toLowerCase().trim();
  const projectLower = (projectName || '').toLowerCase().trim();
  
  if (!projectLower) return 0;
  
  // Exact match (case-insensitive)
  if (projectLower === topicLower) return 100;
  
  // Project name contains the full topic
  if (projectLower.includes(topicLower)) return 80;
  
  // Topic contains the project name (partial match)
  if (topicLower.includes(projectLower)) return 70;
  
  // Split into words and check for keyword matches
  const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2); // Ignore short words
  const projectWords = projectLower.split(/\s+/);
  
  let matchingWords = 0;
  let totalTopicWords = topicWords.length;
  
  if (totalTopicWords === 0) return 0;
  
  topicWords.forEach(topicWord => {
    if (projectWords.some(projectWord => 
      projectWord.includes(topicWord) || topicWord.includes(projectWord)
    )) {
      matchingWords++;
    }
  });
  
  // Calculate score based on percentage of matching words
  const wordMatchScore = (matchingWords / totalTopicWords) * 60;
  
  // Check for character sequence matches (fuzzy matching)
  let charMatches = 0;
  let topicIndex = 0;
  for (let i = 0; i < projectLower.length && topicIndex < topicLower.length; i++) {
    if (projectLower[i] === topicLower[topicIndex]) {
      charMatches++;
      topicIndex++;
    }
  }
  const fuzzyScore = (charMatches / topicLower.length) * 40;
  
  return Math.max(wordMatchScore, fuzzyScore);
}

async function findProjectByTopic(api, topic) {
  if (!topic || !topic.trim()) {
    return null;
  }
  
  console.log(`🔍 Searching for project matching topic: "${topic}"...`);
  
  try {
    const allProjects = await api.getAllProjects();
    
    if (!allProjects || allProjects.length === 0) {
      console.log('❌ No projects found in workspace');
      return null;
    }
    
    // Filter to only active projects for matching
    const projects = filterActiveProjects(allProjects);
    
    if (projects.length === 0) {
      console.log('❌ No active projects found in workspace');
      return null;
    }
    
    // Calculate match scores for active projects only
    const scoredProjects = projects.map(project => ({
      project,
      score: calculateMatchScore(topic, project.name || project.title || '')
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    
    if (scoredProjects.length === 0) {
      console.log(`❌ No active projects found matching topic: "${topic}"`);
      console.log('\n💡 Available active projects:');
      projects.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name || p.title || 'Unnamed'} (ID: ${p.id})`);
      });
      if (projects.length > 5) {
        console.log(`   ... and ${projects.length - 5} more active projects`);
      }
      return null;
    }
    
    const bestMatch = scoredProjects[0];
    const matchThreshold = 50; // Minimum score to consider a match
    
    if (bestMatch.score < matchThreshold) {
      console.log(`⚠️  Best match has low confidence (score: ${bestMatch.score.toFixed(1)}/100)`);
      console.log(`   Best match: ${bestMatch.project.name || bestMatch.project.title}`);
      console.log('\n💡 Consider using a more specific topic or providing projectId directly');
      
      if (scoredProjects.length > 1) {
        console.log('\n💡 Top matches:');
        scoredProjects.slice(0, 3).forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.project.name || item.project.title} (score: ${item.score.toFixed(1)})`);
        });
      }
      
      return null;
    }
    
    console.log(`✅ Found matching project: ${bestMatch.project.name || bestMatch.project.title}`);
    console.log(`   Match confidence: ${bestMatch.score.toFixed(1)}/100`);
    console.log(`   Project ID: ${bestMatch.project.id}\n`);
    
    return bestMatch.project;
    
  } catch (error) {
    console.error(`❌ Error finding project: ${error.message}`);
    return null;
  }
}

function saveProjectsCache(projects) {
  try {
    const cachePath = join(__dirname, 'projects-cache.json');
    const cacheData = {
      timestamp: Date.now(),
      projects: projects.map(p => ({
        id: p.id,
        name: p.name || p.title || 'Unnamed',
        description: p.description,
        status: p.status
      }))
    };
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
  } catch (error) {
    // Silently fail - caching is optional
    console.log('⚠️  Could not save projects cache');
  }
}

function loadProjectsCache() {
  try {
    const cachePath = join(__dirname, 'projects-cache.json');
    if (!existsSync(cachePath)) {
      return null;
    }
    
    const cacheContent = readFileSync(cachePath, 'utf8');
    const cacheData = JSON.parse(cacheContent);
    
    // Cache is valid for 1 hour
    const cacheAge = Date.now() - cacheData.timestamp;
    const oneHour = 60 * 60 * 1000;
    
    if (cacheAge > oneHour) {
      return null; // Cache expired
    }
    
    return cacheData.projects;
  } catch (error) {
    return null;
  }
}

/**
 * Prompt user to select a project from a list interactively
 * Returns the selected project or null if cancelled
 * Only shows active projects (excludes completed, backlog, archived, etc.)
 */
function promptProjectSelection(projects) {
  return new Promise((resolve) => {
    // Filter to only active projects
    const activeProjects = filterActiveProjects(projects);
    
    if (!activeProjects || activeProjects.length === 0) {
      console.error('❌ No active projects available to select from');
      if (projects && projects.length > 0) {
        console.log(`   (Found ${projects.length} total project(s), but all are completed/archived)`);
      }
      resolve(null);
      return;
    }

    console.log('\n📋 Available Active Projects:');
    if (projects && projects.length > activeProjects.length) {
      console.log(`   (Showing ${activeProjects.length} active project(s), ${projects.length - activeProjects.length} completed/archived hidden)`);
    }
    console.log('='.repeat(70));
    activeProjects.forEach((project, index) => {
      const name = project.name || project.title || 'Unnamed';
      const id = project.id || 'N/A';
      console.log(`   ${index + 1}. ${name}`);
      console.log(`      ID: ${id}`);
    });
    console.log('='.repeat(70));
    console.log(`   0. Cancel and exit\n`);

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Select a project (enter number): ', (answer) => {
      rl.close();
      const selection = parseInt(answer.trim(), 10);

      if (isNaN(selection) || selection < 0 || selection > activeProjects.length) {
        console.log('❌ Invalid selection. Cancelled.');
        resolve(null);
        return;
      }

      if (selection === 0) {
        console.log('❌ Cancelled by user.');
        resolve(null);
        return;
      }

      const selectedProject = activeProjects[selection - 1];
      console.log(`\n✅ Selected: ${selectedProject.name || selectedProject.title || 'Unnamed'}`);
      console.log(`   Project ID: ${selectedProject.id}\n`);
      resolve(selectedProject);
    });
  });
}

/**
 * Prompt user to choose between using an existing project or creating a new one
 * Returns 'existing', 'create', or 'cancel'
 */
function promptProjectChoice(projectName) {
  return new Promise((resolve) => {
    console.log(`\n⚠️  Project "${projectName}" not found in your workspace.`);
    console.log('\nWhat would you like to do?');
    console.log('   1. Add tasks to an existing project (you may have gotten the name wrong)');
    console.log('   2. Create a new project with this name');
    console.log('   0. Cancel and exit\n');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Enter your choice (1/2/0): ', (answer) => {
      rl.close();
      const choice = answer.trim();

      if (choice === '1') {
        resolve('existing');
      } else if (choice === '2') {
        resolve('create');
      } else if (choice === '0') {
        console.log('❌ Cancelled by user.');
        resolve('cancel');
      } else {
        console.log('❌ Invalid choice. Cancelled.');
        resolve('cancel');
      }
    });
  });
}

/**
 * Check if a project with the given name exists (case-insensitive)
 * Returns the matching project or null
 */
function findProjectByName(projects, projectName) {
  if (!projects || !projectName) {
    return null;
  }

  const nameLower = projectName.toLowerCase().trim();
  return projects.find(project => {
    const projectNameLower = (project.name || project.title || '').toLowerCase().trim();
    return projectNameLower === nameLower;
  }) || null;
}

/**
 * Extract status name from various status formats
 */
function getStatusName(status) {
  if (!status) return null;
  if (typeof status === 'string') {
    return status.toLowerCase();
  }
  if (typeof status === 'object' && status !== null && 'name' in status) {
    const statusObj = status;
    if (typeof statusObj.name === 'string') {
      return statusObj.name.toLowerCase();
    }
  }
  return null;
}

/**
 * Check if a project should be excluded (completed, backlog, archived, etc.)
 */
function isExcludedStatus(statusName) {
  if (!statusName) return false;
  const normalized = statusName.toLowerCase().trim();
  return normalized === 'completed' || 
         normalized === 'done' || 
         normalized === 'backlog' ||
         normalized === 'archived' ||
         normalized === 'cancelled' ||  // British spelling
         normalized === 'canceled' ||    // American spelling
         normalized === 'closed';
}

/**
 * Filter projects to only include active ones (exclude completed, backlog, archived, etc.)
 */
function filterActiveProjects(projects) {
  if (!projects || !Array.isArray(projects)) {
    return [];
  }

  return projects.filter(project => {
    const status = project.status;
    const statusName = getStatusName(status);
    return !isExcludedStatus(statusName);
  });
}

// Main execution function
async function main() {
  console.log('🚀 Motion Bulk Creator Starting...\n');

  // Load configuration
  const env = loadEnvironmentVariables();
  const tasksData = loadTasksData();

  // Validate required environment variables
  if (!env.MOTION_API_KEY || !env.MOTION_WORKSPACE_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   - MOTION_API_KEY');
    console.error('   - MOTION_WORKSPACE_ID');
    console.log('\n💡 Copy env.example to .env and fill in your values');
    process.exit(1);
  }

  // Validate tasks data
  if (!tasksData.tasks || !Array.isArray(tasksData.tasks)) {
    console.error('❌ Invalid tasks.json format. Expected structure:');
    console.error('   { "projectId": "optional", "projectTopic": "optional", "project": {...}, "tasks": [...] }');
    console.error('\n💡 You can use one of:');
    console.error('   - "projectId": Use an existing project by ID');
    console.error('   - "projectTopic": Find a project by topic/keywords');
    console.error('   - "project": Create a new project');
    process.exit(1);
  }

  // Check if using existing project, topic-based matching, or creating new one
  const useExistingProject = tasksData.projectId && tasksData.projectId.trim() !== '';
  const projectId = useExistingProject ? tasksData.projectId : null;
  const projectTopic = tasksData.projectTopic && tasksData.projectTopic.trim() !== '' 
    ? tasksData.projectTopic.trim() 
    : null;

  const api = new MotionAPI(env.MOTION_API_KEY, env.MOTION_WORKSPACE_ID);
  
  try {
    let finalProjectId;
    let projectName;

    if (useExistingProject) {
      // Use existing project by ID
      console.log('📁 Using existing project...');
      console.log(`   Project ID: ${projectId}`);
      
      // Validate that the project exists
      try {
        const project = await api.getProject(projectId);
        projectName = project.name;
        console.log(`   Project Name: ${projectName}`);
        console.log(`✅ Found existing project: ${projectName}\n`);
        finalProjectId = projectId;
      } catch (error) {
        console.error(`❌ Project not found: ${projectId}`);
        console.error(`   Error: ${error.message}`);
        console.log('\n🔍 Fetching available projects for selection...\n');
        
        // Fetch all projects and prompt user to select
        try {
          const allProjects = await api.getAllProjects();
          if (!allProjects || allProjects.length === 0) {
            console.error('❌ No projects found in workspace');
            process.exit(1);
          }
          
          const selectedProject = await promptProjectSelection(allProjects);
          if (!selectedProject) {
            console.log('❌ No project selected. Exiting.');
            process.exit(1);
          }
          
          finalProjectId = selectedProject.id;
          projectName = selectedProject.name || selectedProject.title || 'Unnamed';
          console.log(`✅ Using project: ${projectName} (ID: ${finalProjectId})\n`);
        } catch (fetchError) {
          console.error(`❌ Failed to fetch projects: ${fetchError.message}`);
          console.log('\n💡 Use "npm run fetch-projects" to see available projects');
          process.exit(1);
        }
      }
    } else if (projectTopic) {
      // Find project by topic
      const matchedProject = await findProjectByTopic(api, projectTopic);
      
      if (!matchedProject) {
        console.error('❌ Could not find a matching project for the given topic');
        console.log('\n🔍 Fetching available projects for selection...\n');
        
        // Fetch all projects and prompt user to select
        try {
          const allProjects = await api.getAllProjects();
          if (!allProjects || allProjects.length === 0) {
            console.error('❌ No projects found in workspace');
            console.log('\n💡 Options:');
            console.log('   1. Use a more specific topic in tasks.json: { "projectTopic": "your topic" }');
            console.log('   2. Provide projectId directly: { "projectId": "proj_abc123" }');
            console.log('   3. Create a new project by providing a "project" object in tasks.json');
            process.exit(1);
          }
          
          const selectedProject = await promptProjectSelection(allProjects);
          if (!selectedProject) {
            console.log('❌ No project selected. Exiting.');
            process.exit(1);
          }
          
          finalProjectId = selectedProject.id;
          projectName = selectedProject.name || selectedProject.title || 'Unnamed';
          console.log(`✅ Using project: ${projectName} (ID: ${finalProjectId})\n`);
          
          // Cache the projects for future use
          try {
            saveProjectsCache(allProjects);
          } catch (error) {
            // Silently fail - caching is optional
          }
        } catch (fetchError) {
          console.error(`❌ Failed to fetch projects: ${fetchError.message}`);
          console.log('\n💡 Options:');
          console.log('   1. Use a more specific topic in tasks.json: { "projectTopic": "your topic" }');
          console.log('   2. Provide projectId directly: { "projectId": "proj_abc123" }');
          console.log('   3. Run "npm run fetch-projects" to see all available projects');
          process.exit(1);
        }
      } else {
        finalProjectId = matchedProject.id;
        projectName = matchedProject.name || matchedProject.title || 'Unnamed';
        
        // Cache the projects for future use
        try {
          const allProjects = await api.getAllProjects();
          saveProjectsCache(allProjects);
        } catch (error) {
          // Silently fail - caching is optional
        }
      }
    } else {
      // Create new project - but first check if it already exists
      if (!tasksData.project) {
        console.error('❌ No project data found. Either provide projectId or project object.');
        process.exit(1);
      }

      const requestedProjectName = tasksData.project.name;
      console.log('📁 Checking for project...');
      console.log(`   Requested name: ${requestedProjectName}\n`);

      // Fetch all projects to check if one with this name already exists
      let allProjects = [];
      try {
        allProjects = await api.getAllProjects();
        // Check in all projects (including inactive) for name matching
        const existingProject = findProjectByName(allProjects, requestedProjectName);
        
        if (existingProject) {
          // Project with this name already exists
          console.log(`✅ Found existing project: ${existingProject.name || existingProject.title}`);
          console.log(`   Project ID: ${existingProject.id}\n`);
          finalProjectId = existingProject.id;
          projectName = existingProject.name || existingProject.title || 'Unnamed';
        } else {
          // Project doesn't exist - ask user what to do
          const choice = await promptProjectChoice(requestedProjectName);
          
          if (choice === 'cancel') {
            console.log('❌ Cancelled by user. Exiting.');
            process.exit(1);
          } else if (choice === 'existing') {
            // User wants to use an existing project (filtered to active only)
            const selectedProject = await promptProjectSelection(allProjects);
            if (!selectedProject) {
              console.log('❌ No project selected. Exiting.');
              process.exit(1);
            }
            finalProjectId = selectedProject.id;
            projectName = selectedProject.name || selectedProject.title || 'Unnamed';
            console.log(`✅ Using existing project: ${projectName} (ID: ${finalProjectId})\n`);
          } else if (choice === 'create') {
            // User confirmed they want to create a new project
            console.log('📁 Creating new project...');
            console.log(`   Name: ${tasksData.project.name}`);
            if (tasksData.project.description) {
              console.log(`   Description: ${tasksData.project.description}`);
            }
            if (tasksData.project.priority) {
              console.log(`   Priority: ${tasksData.project.priority}`);
            }
            if (tasksData.project.dueDate) {
              console.log(`   Due Date: ${new Date(tasksData.project.dueDate).toLocaleDateString()}`);
            }
            console.log('');

            const project = await api.createProject(tasksData.project);
            console.log(`✅ Project created successfully!`);
            console.log(`   Project ID: ${project.id}`);
            console.log(`   Project Name: ${project.name}\n`);
            finalProjectId = project.id;
            projectName = project.name;
          }
        }
      } catch (error) {
        console.error(`❌ Failed to check for existing projects: ${error.message}`);
        console.log('\n⚠️  Proceeding with project creation...\n');
        
        // If we can't fetch projects, ask user if they want to proceed
        const choice = await promptProjectChoice(requestedProjectName);
        
        if (choice === 'cancel') {
          console.log('❌ Cancelled by user. Exiting.');
          process.exit(1);
        } else if (choice === 'create') {
          console.log('📁 Creating new project...');
          console.log(`   Name: ${tasksData.project.name}`);
          if (tasksData.project.description) {
            console.log(`   Description: ${tasksData.project.description}`);
          }
          if (tasksData.project.priority) {
            console.log(`   Priority: ${tasksData.project.priority}`);
          }
          if (tasksData.project.dueDate) {
            console.log(`   Due Date: ${new Date(tasksData.project.dueDate).toLocaleDateString()}`);
          }
          console.log('');

          const project = await api.createProject(tasksData.project);
          console.log(`✅ Project created successfully!`);
          console.log(`   Project ID: ${project.id}`);
          console.log(`   Project Name: ${project.name}\n`);
          finalProjectId = project.id;
          projectName = project.name;
        } else {
          console.log('❌ Cannot select existing project - failed to fetch projects list.');
          process.exit(1);
        }
      }
    }

    // Create tasks
    const tasks = tasksData.tasks;
    console.log(`📝 Creating ${tasks.length} tasks in project: ${projectName}...\n`);

    const results = {
      successful: [],
      failed: []
    };

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskNumber = i + 1;
      
      try {
        console.log(`[${taskNumber}/${tasks.length}] Creating task: ${task.name}`);
        
        if (task.description) {
          console.log(`   Description: ${task.description}`);
        }
        if (task.dueDate) {
          console.log(`   Due Date: ${new Date(task.dueDate).toLocaleDateString()}`);
        }
        if (task.duration) {
          console.log(`   Duration: ${formatDuration(task.duration)}`);
        }
        if (task.priority) {
          console.log(`   Priority: ${task.priority}`);
        }

        const createdTask = await api.createTask(task, finalProjectId);
        results.successful.push({
          taskNumber,
          name: task.name,
          id: createdTask.id
        });
        
        console.log(`✅ Task created successfully! (ID: ${createdTask.id})\n`);
        
      } catch (error) {
        console.error(`❌ Failed to create task "${task.name}": ${error.message}\n`);
        results.failed.push({
          taskNumber,
          name: task.name,
          error: error.message
        });
      }
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   ✅ Successful: ${results.successful.length}/${tasks.length}`);
    console.log(`   ❌ Failed: ${results.failed.length}/${tasks.length}`);
    
    if (results.successful.length > 0) {
      console.log('\n✅ Successfully created tasks:');
      results.successful.forEach(result => {
        console.log(`   ${result.taskNumber}. ${result.name} (ID: ${result.id})`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed tasks:');
      results.failed.forEach(result => {
        console.log(`   ${result.taskNumber}. ${result.name} - ${result.error}`);
      });
    }

    console.log('\n🎉 Motion Bulk Creator completed!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('❌ Main function error:', error.message);
  process.exit(1);
});
