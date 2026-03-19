# Motion Bulk Creator

A Node.js script for bulk creating projects and tasks in Motion with built-in rate limiting and error handling.

## Primary Workflow

**Create tasks externally → Paste into `tasks.json` → Run the app**

1. **Generate your tasks** using ChatGPT or another AI assistant with the [Task Generation Guide](TASK_GENERATION_GUIDE.md)
2. **Paste the JSON** into `tasks.json`
3. **Run the app**: `npm start`

That's it! The app reads your pre-formatted tasks and sends them to Motion via the API.

## Features

- ✅ Create projects and tasks in bulk via Motion API
- ✅ Built-in rate limiting (12 requests per minute)
- ✅ Progress tracking and detailed logging
- ✅ Error handling with retry logic
- ✅ JSON-based task configuration
- ✅ **Smart project matching by topic/keywords** - automatically find the right project
- ✅ No external dependencies (uses built-in Node.js fetch)

## Prerequisites

- Node.js 18.0.0 or higher
- Motion API key and workspace ID
- Valid Motion account

## Setup

### 1. Install Dependencies

No external dependencies required! This script uses only built-in Node.js modules.

### 2. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your Motion API credentials:
   ```env
   MOTION_API_KEY=your_api_key_here
   MOTION_WORKSPACE_ID=your_workspace_id_here
   DEBUG=false
   ```

### 3. Get Your Motion API Credentials

1. **API Key**: Go to [Motion Settings > API](https://www.usemotion.com/settings/api) and create a new API key
2. **Workspace ID**: Find your workspace ID in the Motion dashboard URL or API documentation

### 4. Generate Your Tasks

**Recommended**: Use ChatGPT or another AI assistant with the [Task Generation Guide](TASK_GENERATION_GUIDE.md) to generate properly formatted JSON.

The guide includes:
- Complete JSON structure templates
- Field requirements and validation rules
- Date format examples
- Task dependency patterns
- Best practices for Motion API

### 5. Configure Your Tasks

Paste the generated JSON into `tasks.json`. You can create a new project, add tasks to an existing project by ID, or find a project by topic:

#### Option A: Create New Project (Default)
```json
{
  "project": {
    "name": "My Project Name",
    "description": "Project description",
    "priority": "HIGH",
    "dueDate": "2025-03-31T23:59:59.000Z",
    "labels": ["tag1", "tag2"]
  },
  "tasks": [
    {
      "name": "Task Name",
      "description": "Task description",
      "dueDate": "2025-01-15T17:00:00.000Z",
      "duration": 120,
      "priority": "HIGH",
      "labels": ["tag1", "tag2"]
    }
  ]
}
```

#### Option B: Use Existing Project by ID
```json
{
  "projectId": "proj_abc123",
  "tasks": [
    {
      "name": "Task Name",
      "description": "Task description",
      "dueDate": "2025-01-15T17:00:00.000Z",
      "duration": 120,
      "priority": "HIGH",
      "labels": ["tag1", "tag2"]
    }
  ]
}
```

#### Option C: Find Project by Topic (NEW!)
Instead of manually finding the project ID, you can provide a topic and the app will automatically find the best matching project:

```json
{
  "projectTopic": "fleet planning",
  "tasks": [
    {
      "name": "Task Name",
      "description": "Task description",
      "dueDate": "2025-01-15T17:00:00.000Z",
      "duration": 120,
      "priority": "HIGH"
    }
  ]
}
```

The app uses intelligent fuzzy matching to find projects based on keywords. For example:
- `"projectTopic": "fleet"` will match projects like "2026 Fleet Planning & Alignment"
- `"projectTopic": "marketing"` will match projects containing "marketing" in the name
- `"projectTopic": "q1 2025"` will match projects with "Q1" or "2025" in the name

**Priority order**: If you provide both `projectId` and `projectTopic`, `projectId` takes precedence.

#### Finding Your Project ID
To find existing project IDs, you can search by name:

```bash
# List all projects
npm run fetch-projects

# Search for projects containing "specialty"
npm run fetch-projects "specialty"

# Search for projects containing "marketing"
npm run fetch-projects "marketing"
```

The search is case-insensitive and matches partial names, so you don't need the exact project name.

**Tip**: Instead of manually finding project IDs, you can use `projectTopic` in your `tasks.json` file for automatic project matching!

## Usage

### Primary Workflow: Pre-formatted Tasks

1. **Generate tasks externally** using the [Task Generation Guide](TASK_GENERATION_GUIDE.md) with ChatGPT or another AI assistant
2. **Copy the generated JSON** and paste it into `tasks.json`
3. **Run the app**:

```bash
npm start
```

The app will:
- Read your `tasks.json` file
- Create a new project (if specified) or use an existing one
- **If a project doesn't exist, it will prompt you to select from available projects**
- Create all tasks in bulk with rate limiting
- Show progress and summary

### Interactive Project Resolution

The app includes smart project resolution to prevent mistakes:

#### When Project Doesn't Exist

**For `projectId` or `projectTopic` that doesn't match:**
- Fetches all available projects from your workspace
- Displays them in a numbered list
- Prompts you to select the correct project
- Continues with task creation using your selection

**For new project creation (when you provide a `project` object):**
- First checks if a project with that name already exists
- If found, uses the existing project automatically
- If not found, asks you to choose:
  1. **Add tasks to an existing project** (in case you got the name wrong)
  2. **Create a new project** with the specified name
  3. **Cancel** and exit

Example flow:
```
📁 Checking for project...
   Requested name: Q1 Marketing Campaign

⚠️  Project "Q1 Marketing Campaign" not found in your workspace.

What would you like to do?
   1. Add tasks to an existing project (you may have gotten the name wrong)
   2. Create a new project with this name
   0. Cancel and exit

Enter your choice (1/2/0): 1

📋 Available Projects:
======================================================================
   1. 2026 Fleet Planning & Alignment
      ID: proj_abc123
   2. Q1 Marketing Campaign 2025
      ID: proj_def456
   3. Product Launch
      ID: proj_ghi789
======================================================================
   0. Cancel and exit

Select a project (enter number): 2

✅ Selected: Q1 Marketing Campaign 2025
   Project ID: proj_def456
```

### Pull open tasks for LLM prioritization

To dump all your open (todo) tasks in an LLM-friendly format so you can reason about priorities in a chat or prompt:

```bash
# Print to stdout (then paste into your LLM)
npm run pull-open-tasks

# Write to a file (e.g. to attach or paste later)
npm run pull-open-tasks -- --out open-tasks.md
```

Uses the same `.env` (MOTION_API_KEY, MOTION_WORKSPACE_ID). Output is markdown with task name, status, due date, priority, duration, project, and description.

### List Existing Projects

```bash
# List all projects
npm run fetch-projects

# Search for specific projects
npm run fetch-projects "specialty"
npm run fetch-projects "marketing"
npm run fetch-projects "q1"
```

### Development Mode (with auto-restart)

```bash
npm run dev
```

## Alternative Workflow: Notes to Tasks

If you prefer to convert raw notes into tasks automatically, you can use the notes-to-tasks workflow:

```bash
npm run motion-notes -- "your notes here"
```

**Note**: This workflow requires an `OPENAI_API_KEY` in your `.env` file and uses AI to parse notes into structured tasks. For most users, the [primary workflow](#primary-workflow-pre-formatted-tasks) of generating tasks externally and pasting them into `tasks.json` is recommended.

## Configuration Options

### Project Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Project name |
| `description` | string | ❌ | Project description |
| `priority` | string | ❌ | Priority: `ASAP`, `HIGH`, `MEDIUM`, `LOW` |
| `dueDate` | string | ❌ | ISO 8601 date string |
| `labels` | array | ❌ | Array of label strings |

### Task Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Task name |
| `description` | string | ❌ | Task description |
| `dueDate` | string | ❌ | ISO 8601 date string |
| `duration` | number | ❌ | Duration in minutes |
| `priority` | string | ❌ | Priority: `ASAP`, `HIGH`, `MEDIUM`, `LOW` |
| `labels` | array | ❌ | Array of label strings |
| `assigneeId` | string | ❌ | Assignee user ID |
| `autoScheduled` | object | ❌ | Auto-scheduling configuration |

### Auto-Scheduling Configuration

```json
{
  "autoScheduled": {
    "startDate": "2025-01-15T09:00:00.000Z",
    "deadlineType": "HARD",
    "schedule": "Work Hours"
  }
}
```

- `startDate`: ISO 8601 date string for when to start the task
- `deadlineType`: `HARD`, `SOFT`, or `NONE`
- `schedule`: `"Work Hours"` for business hours scheduling

## Rate Limiting

The script automatically handles Motion's rate limit of 12 requests per minute:

- ⏳ Automatically waits when rate limit is reached
- 📊 Shows progress and estimated wait times
- 🔄 Queues requests to stay within limits

## Error Handling

- ✅ Comprehensive error handling for API failures
- 🔄 Automatic retry logic for transient errors
- 📝 Detailed error logging and reporting
- 🛡️ Graceful handling of network issues

## Output

The script provides detailed progress information:

```
🚀 Motion Bulk Creator Starting...

📁 Creating project...
   Name: Q1 Marketing Campaign
   Description: Launch new product campaign for Q1 2025
   Priority: HIGH
   Due Date: 3/31/2025

✅ Project created successfully!
   Project ID: proj_123456789
   Project Name: Q1 Marketing Campaign

📝 Creating 6 tasks...

[1/6] Creating task: Design landing page
   Description: Create mockups and wireframes for the new product landing page
   Due Date: 1/15/2025
   Duration: 3h 0m
   Priority: HIGH
✅ Task created successfully! (ID: task_123456789)

📊 Summary:
   ✅ Successful: 6/6
   ❌ Failed: 0/6

🎉 Motion Bulk Creator completed!
```

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Make sure you have a `.env` file with `MOTION_API_KEY` and `MOTION_WORKSPACE_ID`

2. **"API request failed: 401 Unauthorized"**
   - Check that your API key is correct and has proper permissions

3. **"API request failed: 404 Not Found"**
   - Verify your workspace ID is correct

4. **"Rate limit reached"**
   - This is normal behavior - the script will automatically wait and continue

### Debug Mode

Set `DEBUG=true` in your `.env` file for additional logging information.

## API Reference

This script uses the Motion API v1:

- **Create Project**: `POST https://api.usemotion.com/v1/projects`
- **Create Task**: `POST https://api.usemotion.com/v1/tasks`

For more details, see the [Motion API Documentation](https://docs.usemotion.com/api-reference/).

## 📚 Additional Documentation

- **[Task Generation Guide](TASK_GENERATION_GUIDE.md)** - **Start here!** Complete guide for generating task JSON files using ChatGPT or other AI assistants. This is the recommended way to create your `tasks.json` file.
- **[Motion API Documentation](https://docs.usemotion.com/api-reference/)** - Official Motion API reference

## License

MIT License - feel free to modify and use as needed.
